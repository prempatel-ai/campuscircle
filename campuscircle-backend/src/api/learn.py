import asyncio
import html
import json
import os
import re
import tempfile
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import httpx
from youtube_transcript_api import (
    YouTubeTranscriptApi,
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable
)

from src.config import settings
from src.database import get_db
from src.auth.dependencies import get_current_user
from src.models.learn import LearnExtractionLog
from src.models.learning_session import LearningSession
from src.schemas.learn import (
    ExtractRequest,
    ExtractResponse,
    TranscriptSegment,
    ExplainRequest,
    ExplainResponse,
    ExplanationChunk,
    QuizQuestionOut,
    QuizPhaseOut,
    QuizSessionOut,
    QuizSubmitRequest,
    QuestionResultDetail,
    QuizSubmitResponse
)

router = APIRouter(prefix="/learn", tags=["learn"])

YOUTUBE_REGEX = re.compile(
    r'(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})'
)

EXTRACTION_DAILY_LIMIT = 10
EXPLAIN_DAILY_LIMIT = 5


def extract_video_id(url: str) -> str | None:
    match = YOUTUBE_REGEX.search(url.strip())
    if match:
        return match.group(1)
    return None


async def fetch_video_title(video_id: str) -> str | None:
    try:
        embed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        async with httpx.AsyncClient(timeout=4.0) as client:
            res = await client.get(embed_url)
            if res.status_code == 200:
                return res.json().get("title")
    except Exception:
        pass
    return None


def _ydl_extract_sync(video_id: str, tmpdir: str) -> None:
    """
    Blocking yt-dlp call — runs in a thread via run_in_executor.
    yt-dlp constantly updates its anti-bot fingerprinting, making it the
    most reliable extractor on cloud IPs where plain HTTP gets 429'd.
    """
    import yt_dlp  # type: ignore

    ydl_opts = {
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en", "en-US", "en-GB"],
        "subtitlesformat": "json3",
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 20,
        "outtmpl": os.path.join(tmpdir, "%(id)s.%(ext)s"),
    }
    url = f"https://www.youtube.com/watch?v={video_id}"
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])


def _parse_json3(raw: str) -> List[dict]:
    data = json.loads(raw)
    segments = []
    for ev in data.get("events", []):
        segs = ev.get("segs", [])
        text_part = "".join(s.get("utf8", "") for s in segs).replace("\n", " ").strip()
        if text_part:
            segments.append({
                "text": text_part,
                "start": float(ev.get("tStartMs", 0)) / 1000.0,
                "duration": float(ev.get("dDurationMs", 0)) / 1000.0,
            })
    return segments


def _parse_vtt(raw: str) -> List[dict]:
    segments = []
    lines = raw.splitlines()
    i = 0
    while i < len(lines):
        if "-->" in lines[i]:
            try:
                parts = lines[i].split("-->")

                def _ts(ts: str) -> float:
                    ts = ts.strip().split(" ")[0].replace(",", ".")
                    p = ts.split(":")
                    if len(p) == 3:
                        return int(p[0]) * 3600 + int(p[1]) * 60 + float(p[2])
                    return int(p[0]) * 60 + float(p[1])

                start = _ts(parts[0])
                end = _ts(parts[1])
                i += 1
                text_lines = []
                while i < len(lines) and lines[i].strip():
                    cleaned = re.sub(r"<[^>]+>", "", lines[i].strip())
                    if cleaned:
                        text_lines.append(cleaned)
                    i += 1
                text_val = " ".join(text_lines).strip()
                if text_val:
                    segments.append({
                        "text": text_val,
                        "start": start,
                        "duration": max(0.0, end - start),
                    })
            except Exception:
                i += 1
        else:
            i += 1
    return segments


async def fetch_transcript_ytdlp(video_id: str) -> List[dict]:
    """Primary extractor using yt-dlp — handles cloud IP anti-bot blocks."""
    with tempfile.TemporaryDirectory() as tmpdir:
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(None, _ydl_extract_sync, video_id, tmpdir)
        except Exception as e:
            raise Exception(f"yt-dlp failed: {e}")

        sub_file = None
        for fname in sorted(os.listdir(tmpdir)):
            if fname.endswith(".json3") or fname.endswith(".vtt") or fname.endswith(".srv1"):
                sub_file = os.path.join(tmpdir, fname)
                break

        if not sub_file:
            raise Exception("yt-dlp produced no subtitle file (captions may be disabled)")

        with open(sub_file, "r", encoding="utf-8") as f:
            raw = f.read()

        if sub_file.endswith(".json3"):
            segments = _parse_json3(raw)
        elif sub_file.endswith(".vtt"):
            segments = _parse_vtt(raw)
        else:
            root = ET.fromstring(raw)
            segments = []
            for elem in root.findall("text"):
                text_val = html.unescape(elem.text or "").replace("\n", " ").strip()
                if text_val:
                    segments.append({
                        "text": text_val,
                        "start": float(elem.attrib.get("start", 0)),
                        "duration": float(elem.attrib.get("dur", 0)),
                    })

        if not segments:
            raise Exception("Empty subtitle file from yt-dlp")

        return segments



async def fetch_transcript_supadata(video_id: str) -> List[dict]:
    """
    Use Supadata.ai third-party transcript API (free 100 req/month).
    Supadata has its own proxy infrastructure with clean residential IPs,
    so it bypasses YouTube cloud IP blocks that affect Render/Railway/etc.
    """
    if not settings.supadata_api_key:
        raise Exception("SUPADATA_API_KEY not configured")

    url = f"https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v={video_id}&text=false"
    headers = {"x-api-key": settings.supadata_api_key}

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(url, headers=headers)
        if res.status_code != 200:
            raise Exception(f"Supadata API returned {res.status_code}: {res.text[:200]}")

        data = res.json()

        # Supadata returns { "content": [...] } where each item has "text", "offset", "duration"
        content = data.get("content", [])
        if not content:
            raise Exception("Supadata returned empty transcript")

        segments = []
        for item in content:
            text_val = str(item.get("text", "")).replace("\n", " ").strip()
            if text_val:
                segments.append({
                    "text": text_val,
                    "start": float(item.get("offset", 0)) / 1000.0,
                    "duration": float(item.get("duration", 0)) / 1000.0,
                })

        if not segments:
            raise Exception("Supadata transcript has no text segments")

        return segments


async def get_transcript_with_fallback(video_id: str) -> List[dict]:
    # 1. Supadata API — third-party proxy with clean IPs (most reliable on cloud hosting)
    try:
        return await fetch_transcript_supadata(video_id)
    except Exception:
        pass

    # 2. yt-dlp — battle-hardened anti-bot extractor
    try:
        return await fetch_transcript_ytdlp(video_id)
    except Exception:
        pass

    # 3. youtube-transcript-api — lightweight library fallback
    try:
        try:
            return YouTubeTranscriptApi.get_transcript(video_id, languages=["en", "en-US", "en-GB"])
        except Exception:
            return YouTubeTranscriptApi.get_transcript(video_id)
    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable):
        raise
    except Exception:
        pass

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            "Could not retrieve transcript automatically. "
            "The video may have captions disabled or be age-restricted. "
            "Switch to the 'Paste Notes / Text' tab to paste the transcript manually."
        ),
    )


# ─── Groq helpers ────────────────────────────────────────────────────────────

def parse_and_validate_chunks(content_str: str) -> List[dict] | None:
    try:
        data = json.loads(content_str)
        chunks = data.get("chunks")
        if isinstance(chunks, list) and chunks:
            validated = [
                {"title": str(c["title"]).strip(), "explanation": str(c["explanation"]).strip()}
                for c in chunks
                if isinstance(c, dict) and "title" in c and "explanation" in c
            ]
            if validated:
                return validated
    except Exception:
        pass
    return None


def validate_quiz_data_structure(data: dict) -> dict | None:
    try:
        if not isinstance(data, dict):
            return None
        phases = data.get("phases")
        if not isinstance(phases, dict):
            return None
        for phase_key in ["phase1", "phase2", "phase3"]:
            p_data = phases.get(phase_key)
            if not isinstance(p_data, dict):
                return None
            questions = p_data.get("questions")
            if not isinstance(questions, list) or not questions:
                return None
            for q in questions:
                if not isinstance(q, dict):
                    return None
                if not all(k in q for k in ["id", "question", "options", "correct_index", "explanation"]):
                    return None
                if not isinstance(q["options"], list) or len(q["options"]) != 4:
                    return None
                if q["correct_index"] not in [0, 1, 2, 3]:
                    return None
        return data
    except Exception:
        return None


_MOCK_CHUNKS = [
    {"title": "Introduction to the Topic", "explanation": "Imagine opening a new textbook for the first time. The video lays out foundational principles in clear, simple terms."},
    {"title": "Real-World Scenario", "explanation": "A practical scenario—think of a chef orchestrating a kitchen during rush hour—demonstrates how each concept works together."},
    {"title": "Core Takeaway & Application", "explanation": "By understanding these building blocks, you can apply them to solve complex problems independently."},
]


async def call_groq_api_for_explanation(transcript_text: str) -> List[dict]:
    if not settings.groq_api_key:
        return _MOCK_CHUNKS

    system_prompt = (
        "You are an expert AI educator. Break down the provided video transcript into "
        "digestible, storytelling-style explanation chunks for a first-time learner. "
        "Return a JSON object with a single top-level key 'chunks' — a list where each item "
        "has exactly two string keys: 'title' and 'explanation'."
    )
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Explain the following transcript in storytelling chunks:\n\n{transcript_text[:12000]}"},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.5,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        for _ in range(2):
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                parsed = parse_and_validate_chunks(res.json()["choices"][0]["message"]["content"])
                if parsed:
                    return parsed

    raise HTTPException(status_code=422, detail="AI model failed to generate a structured explanation. Please try again.")


_MOCK_QUIZ = {
    "phases": {
        "phase1": {
            "name": "Recall", "description": "Test basic memory of core terms.",
            "questions": [
                {"id": "p1_q1", "question": "What is the primary subject of this topic?", "options": ["Foundational concepts", "Historical background", "Unverified theories", "Admin guidelines"], "correct_index": 0, "explanation": "The material focuses on foundational concepts."},
                {"id": "p1_q2", "question": "Why are building blocks introduced early?", "options": ["To confuse learners", "To build a mental framework", "To meet length requirements", "To skip real examples"], "correct_index": 1, "explanation": "They provide a framework for applying concepts later."},
                {"id": "p1_q3", "question": "How should key terms be approached?", "options": ["Memorize without context", "Ignore definitions", "Connect to real scenarios", "Rely on luck"], "correct_index": 2, "explanation": "Connecting terms to examples solidifies understanding."},
            ],
        },
        "phase2": {
            "name": "Application", "description": "Apply concepts to real-world scenarios.",
            "questions": [
                {"id": "p2_q1", "question": "First step when hitting a bottleneck?", "options": ["Abandon", "Trace execution path", "Change random settings", "Blame dependencies"], "correct_index": 1, "explanation": "Tracing pinpoints the exact cause."},
                {"id": "p2_q2", "question": "How does scenario framing help?", "options": ["Isolates variables", "Adds complexity", "Hides flaws", "Removes testing"], "correct_index": 0, "explanation": "It isolates variables and predicts outcomes."},
                {"id": "p2_q3", "question": "Common implementation trade-off?", "options": ["Simplicity vs Scalability", "Color vs Font", "Users vs Location", "None"], "correct_index": 0, "explanation": "Engineers balance simplicity against scaling demands."},
            ],
        },
        "phase3": {
            "name": "Synthesis", "description": "Synthesise & evaluate complex systems.",
            "questions": [
                {"id": "p3_q1", "question": "How do principles ensure reliability?", "options": ["Modular boundaries + verification", "Manual inspection", "Ignoring edge cases", "Hardcoding parameters"], "correct_index": 0, "explanation": "Modular design and verification ensure resilience."},
                {"id": "p3_q2", "question": "Ultimate mastery goal?", "options": ["Pass one test", "Design & adapt solutions", "Copy templates", "Avoid discussions"], "correct_index": 1, "explanation": "Mastery means synthesising knowledge to solve novel problems."},
                {"id": "p3_q3", "question": "Paramount architectural criterion?", "options": ["Social media popularity", "Domain fit & maintainability", "Fewest code lines", "Arbitrary preference"], "correct_index": 1, "explanation": "Maintainability and domain alignment drive the best choice."},
            ],
        },
    }
}


async def call_groq_api_for_quiz(video_title: str, explanation_text: str) -> dict:
    if not settings.groq_api_key:
        return _MOCK_QUIZ

    system_prompt = (
        "You are an expert AI assessment designer. Create a 3-phase multiple-choice quiz. "
        "Return JSON with top-level key 'phases' containing 'phase1', 'phase2', 'phase3'. "
        "Each phase has 'name', 'description', and 'questions' (list of 3). "
        "Each question: 'id' (e.g. p1_q1), 'question', 'options' (4 strings), 'correct_index' (0-3 int), 'explanation'."
    )
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Quiz for '{video_title}':\n\n{explanation_text[:12000]}"},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
    }

    async with httpx.AsyncClient(timeout=35.0) as client:
        for _ in range(2):
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                content = res.json()["choices"][0]["message"]["content"]
                parsed = json.loads(content) if isinstance(content, str) else content
                validated = validate_quiz_data_structure(parsed)
                if validated:
                    return validated

    raise HTTPException(status_code=422, detail="Failed to generate a valid quiz. Please try again.")


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/extract", response_model=ExtractResponse, status_code=200,
             summary="Extract transcript from a YouTube URL (10/day)")
async def extract_youtube_transcript(
    payload: ExtractRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = uuid.UUID(current_user["user_id"])

    video_id = extract_video_id(payload.youtube_url)
    if not video_id:
        raise HTTPException(400, "Invalid YouTube URL.")

    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    count = (await db.execute(
        select(func.count(LearnExtractionLog.id))
        .where(LearnExtractionLog.user_id == user_uuid, LearnExtractionLog.created_at >= cutoff)
    )).scalar_one() or 0

    if count >= EXTRACTION_DAILY_LIMIT:
        raise HTTPException(429, f"Daily limit of {EXTRACTION_DAILY_LIMIT} extractions reached. Try again tomorrow.")

    try:
        raw = await get_transcript_with_fallback(video_id)
    except TranscriptsDisabled:
        raise HTTPException(400, "Captions are disabled for this video.")
    except NoTranscriptFound:
        raise HTTPException(404, "No transcript found for this video.")
    except VideoUnavailable:
        raise HTTPException(404, "This video is unavailable or private.")

    segments = [
        TranscriptSegment(
            text=item.get("text", "").replace("\n", " ").strip(),
            start=round(float(item.get("start", 0)), 2),
            duration=round(float(item.get("duration", 0)), 2),
        )
        for item in raw
    ]
    full_text = " ".join(s.text for s in segments)
    duration = int(sum(s.duration for s in segments))
    title = await fetch_video_title(video_id)

    db.add(LearnExtractionLog(user_id=user_uuid, video_id=video_id))
    await db.commit()

    return ExtractResponse(
        video_id=video_id,
        youtube_url=f"https://www.youtube.com/watch?v={video_id}",
        title=title or f"YouTube Video ({video_id})",
        transcript=full_text,
        duration_seconds=duration,
        segments_count=len(segments),
        segments=segments,
        daily_extractions_remaining=max(0, EXTRACTION_DAILY_LIMIT - count - 1),
    )


@router.post("/explain", response_model=ExplainResponse, status_code=200,
             summary="Generate AI explanation chunks (cached per video)")
async def explain_youtube_transcript(
    payload: ExplainRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = uuid.UUID(current_user["user_id"])

    video_id = extract_video_id(payload.youtube_url) if payload.youtube_url else None
    if not video_id:
        video_id = f"custom_{uuid.uuid4().hex[:10]}"

    # Cache lookup for real YouTube IDs
    cached_session = None
    if not video_id.startswith("custom_"):
        res = await db.execute(
            select(LearningSession)
            .where(LearningSession.video_id == video_id)
            .order_by(LearningSession.created_at.desc())
        )
        cached_session = res.scalars().first()

    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    daily_count = (await db.execute(
        select(func.count(LearningSession.id))
        .where(LearningSession.user_id == user_uuid, LearningSession.created_at >= cutoff)
    )).scalar_one() or 0

    if cached_session:
        raw_chunks = cached_session.explanation_chunks.get("chunks", [])
        return ExplainResponse(
            session_id=str(cached_session.id),
            video_id=video_id,
            video_title=cached_session.video_title,
            chunks=[ExplanationChunk(title=c["title"], explanation=c["explanation"]) for c in raw_chunks],
            is_cached=True,
            daily_explanations_remaining=max(0, EXPLAIN_DAILY_LIMIT - daily_count),
        )

    if daily_count >= EXPLAIN_DAILY_LIMIT:
        raise HTTPException(429, f"Daily explanation limit of {EXPLAIN_DAILY_LIMIT} reached.")

    transcript_text = payload.transcript.strip() if payload.transcript else None
    video_title = (
        (await fetch_video_title(video_id) if not video_id.startswith("custom_") else None)
        or "Custom Learning Topic"
    )

    if not transcript_text:
        try:
            raw = await get_transcript_with_fallback(video_id)
            transcript_text = " ".join(item.get("text", "").replace("\n", " ").strip() for item in raw)
        except TranscriptsDisabled:
            raise HTTPException(400, "Captions are disabled for this video.")
        except NoTranscriptFound:
            raise HTTPException(404, "No transcript found for this video.")
        except VideoUnavailable:
            raise HTTPException(404, "This video is unavailable.")

    chunks_data = await call_groq_api_for_explanation(transcript_text)

    session = LearningSession(
        user_id=user_uuid,
        video_id=video_id,
        youtube_url=payload.youtube_url or f"https://www.youtube.com/watch?v={video_id}",
        video_title=video_title,
        transcript=transcript_text,
        explanation_chunks={"chunks": chunks_data},
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return ExplainResponse(
        session_id=str(session.id),
        video_id=video_id,
        video_title=video_title,
        chunks=[ExplanationChunk(title=c["title"], explanation=c["explanation"]) for c in chunks_data],
        is_cached=False,
        daily_explanations_remaining=max(0, EXPLAIN_DAILY_LIMIT - daily_count - 1),
    )


def sanitize_phase_questions(phase_dict: dict) -> List[QuizQuestionOut]:
    return [
        QuizQuestionOut(id=q["id"], question=q["question"], options=q["options"])
        for q in phase_dict.get("questions", [])
    ]


@router.post("/{session_id}/quiz", response_model=QuizSessionOut, status_code=200,
             summary="Get or generate 3-phase quiz for a learning session")
async def get_or_create_quiz(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(404, "Learning session not found.")

    res = await db.execute(select(LearningSession).where(LearningSession.id == session_uuid))
    session = res.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Learning session not found.")

    if not session.quiz_data:
        explanation_text = " ".join(c["explanation"] for c in session.explanation_chunks.get("chunks", []))
        session.quiz_data = await call_groq_api_for_quiz(session.video_title, explanation_text or session.transcript)
        session.user_progress = {
            "current_phase": 1, "phase1_passed": False,
            "phase2_passed": False, "phase3_passed": False, "is_completed": False,
        }
        db.add(session)
        await db.commit()
        await db.refresh(session)

    progress = session.user_progress or {
        "current_phase": 1, "phase1_passed": False,
        "phase2_passed": False, "phase3_passed": False, "is_completed": False,
    }
    phases_data = session.quiz_data.get("phases", {})
    p1_raw, p2_raw, p3_raw = phases_data.get("phase1", {}), phases_data.get("phase2", {}), phases_data.get("phase3", {})

    p1_out = QuizPhaseOut(
        phase=1, name=p1_raw.get("name", "Recall"),
        description=p1_raw.get("description", "Recall core terms"),
        is_unlocked=True, is_passed=bool(progress.get("phase1_passed")),
        questions=sanitize_phase_questions(p1_raw),
    )
    p2_out = QuizPhaseOut(
        phase=2, name=p2_raw.get("name", "Application"),
        description=p2_raw.get("description", "Apply concepts"),
        is_unlocked=bool(progress.get("phase1_passed")),
        is_passed=bool(progress.get("phase2_passed")),
        questions=sanitize_phase_questions(p2_raw) if progress.get("phase1_passed") else [],
    ) if progress.get("phase1_passed") else None
    p3_out = QuizPhaseOut(
        phase=3, name=p3_raw.get("name", "Synthesis"),
        description=p3_raw.get("description", "Synthesise ideas"),
        is_unlocked=bool(progress.get("phase2_passed")),
        is_passed=bool(progress.get("phase3_passed")),
        questions=sanitize_phase_questions(p3_raw) if progress.get("phase2_passed") else [],
    ) if progress.get("phase2_passed") else None

    return QuizSessionOut(
        session_id=str(session.id), video_id=session.video_id,
        video_title=session.video_title,
        current_unlocked_phase=progress.get("current_phase", 1),
        is_completed=bool(progress.get("is_completed")),
        phase1=p1_out, phase2=p2_out, phase3=p3_out,
    )


@router.post("/{session_id}/quiz/{phase}/submit", response_model=QuizSubmitResponse, status_code=200,
             summary="Submit phase answers — graded locally, zero AI calls")
async def submit_quiz_phase(
    session_id: str,
    phase: int,
    payload: QuizSubmitRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if phase not in [1, 2, 3]:
        raise HTTPException(400, "Phase must be 1, 2, or 3.")
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(404, "Learning session not found.")

    res = await db.execute(select(LearningSession).where(LearningSession.id == session_uuid))
    session = res.scalar_one_or_none()
    if not session or not session.quiz_data:
        raise HTTPException(404, "Quiz session not found.")

    progress = session.user_progress or {
        "current_phase": 1, "phase1_passed": False,
        "phase2_passed": False, "phase3_passed": False, "is_completed": False,
    }
    if phase == 2 and not progress.get("phase1_passed"):
        raise HTTPException(400, "Pass Phase 1 before attempting Phase 2.")
    if phase == 3 and not progress.get("phase2_passed"):
        raise HTTPException(400, "Pass Phase 2 before attempting Phase 3.")

    questions = session.quiz_data.get("phases", {}).get(f"phase{phase}", {}).get("questions", [])
    if not questions:
        raise HTTPException(400, f"No questions for phase {phase}.")

    correct_count = 0
    details: List[QuestionResultDetail] = []
    for q in questions:
        q_id, correct_idx = q["id"], q["correct_index"]
        user_idx = payload.answers.get(q_id, -1)
        is_correct = user_idx == correct_idx
        if is_correct:
            correct_count += 1
        details.append(QuestionResultDetail(
            question_id=q_id, user_index=user_idx,
            correct_index=correct_idx, is_correct=is_correct,
            explanation=q.get("explanation", ""),
        ))

    score = round(correct_count / len(questions) * 100.0, 1)
    passed = score >= 70.0
    next_unlocked = None

    if passed:
        if phase == 1:
            progress["phase1_passed"] = True
            progress["current_phase"] = max(progress.get("current_phase", 1), 2)
            next_unlocked = 2
        elif phase == 2:
            progress["phase2_passed"] = True
            progress["current_phase"] = max(progress.get("current_phase", 1), 3)
            next_unlocked = 3
        elif phase == 3:
            progress["phase3_passed"] = True
            progress["is_completed"] = True
        session.user_progress = progress
        db.add(session)
        await db.commit()

    return QuizSubmitResponse(
        phase=phase, passed=passed, score_percent=score,
        correct_count=correct_count, total_questions=len(questions),
        passing_threshold_percent=70.0, next_phase_unlocked=next_unlocked,
        is_session_completed=bool(progress.get("is_completed")),
        details=details,
    )
