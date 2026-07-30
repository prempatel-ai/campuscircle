import asyncio
import html
import json
import os
import re
import tempfile
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
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
from src.models.user_concept_gap import UserConceptGap
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
    QuizSubmitResponse,
    RemediateRequest,
    RemediateResponse,
    UserConceptGapOut,
    UserGapsResponse
)

router = APIRouter(prefix="/learn", tags=["learn"])

YOUTUBE_REGEX = re.compile(
    r'(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})'
)

EXTRACTION_DAILY_LIMIT = 10
EXPLAIN_DAILY_LIMIT = 5

SUPPORTED_LANGUAGES = {
    "en": "English",
    "hi": "Hindi (हिंदी)",
    "es": "Spanish (Español)",
    "fr": "French (Français)",
    "gu": "Gujarati (ગુજરાતી)"
}


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


async def fetch_transcript_supadata(video_id: str) -> List[dict]:
    if not settings.supadata_api_key:
        raise Exception("SUPADATA_API_KEY not configured")

    url = f"https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v={video_id}&text=false"
    headers = {"x-api-key": settings.supadata_api_key}

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(url, headers=headers)
        if res.status_code != 200:
            raise Exception(f"Supadata API returned {res.status_code}")

        data = res.json()
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


async def fetch_transcript_ytdlp(video_id: str) -> List[dict]:
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
            raise Exception("yt-dlp produced no subtitle file")

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
                        "duration": float(elem.attrib.get("duration", 0)),
                    })

        if not segments:
            raise Exception("Empty subtitle file from yt-dlp")

        return segments


async def get_transcript_with_fallback(video_id: str) -> List[dict]:
    try:
        return await fetch_transcript_supadata(video_id)
    except Exception:
        pass

    try:
        return await fetch_transcript_ytdlp(video_id)
    except Exception:
        pass

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
            "Switch to the 'Paste Notes / Text' tab to paste the transcript manually."
        ),
    )


# ─── Groq & Multilingual Helpers ───────────────────────────────────────────

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
    {"title": "Introduction & Fundamentals", "explanation": "Imagine opening a new textbook for the first time. The material lays out foundational principles in clear, simple terms."},
    {"title": "Real-World Application & Logic", "explanation": "A practical scenario—think of a chef orchestrating a kitchen during rush hour—demonstrates how each concept works together."},
    {"title": "Core Synthesis & Evaluation", "explanation": "By understanding these building blocks, you can apply them to solve complex problems independently."},
]


async def call_groq_api_for_explanation(transcript_text: str, language_name: str = "English") -> List[dict]:
    if not settings.groq_api_key:
        return _MOCK_CHUNKS

    system_prompt = (
        "You are an expert AI educator. Break down the provided video transcript into "
        "digestible, storytelling-style explanation chunks for a first-time learner. "
        f"You MUST write all titles and explanations directly in {language_name}. "
        "Return a JSON object with a single top-level key 'chunks' — a list where each item "
        "has exactly two string keys: 'title' and 'explanation'."
    )
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Explain the following transcript in storytelling chunks in {language_name}:\n\n{transcript_text[:12000]}"},
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
            "name": "Recall", "description": "Test basic memory of core terms and definitions.",
            "questions": [
                {"id": "p1_q1", "question": "What is the primary subject of this topic?", "options": ["Foundational concepts", "Historical background", "Unverified theories", "Admin guidelines"], "correct_index": 0, "explanation": "The material focuses on foundational concepts.", "chunk_id": "chunk_0", "concept_category": "Fundamentals"},
                {"id": "p1_q2", "question": "Why are building blocks introduced early?", "options": ["To confuse learners", "To build a mental framework", "To meet length requirements", "To skip real examples"], "correct_index": 1, "explanation": "They provide a framework for applying concepts later.", "chunk_id": "chunk_0", "concept_category": "Fundamentals"},
                {"id": "p1_q3", "question": "How should key terms be approached?", "options": ["Memorize without context", "Ignore definitions", "Connect to real scenarios", "Rely on luck"], "correct_index": 2, "explanation": "Connecting terms to examples solidifies understanding.", "chunk_id": "chunk_0", "concept_category": "Fundamentals"},
                {"id": "p1_q4", "question": "What role do definitions play in learning?", "options": ["They slow progress", "They anchor understanding", "They are optional", "They complicate things"], "correct_index": 1, "explanation": "Definitions anchor understanding for advanced concepts.", "chunk_id": "chunk_0", "concept_category": "Fundamentals"},
                {"id": "p1_q5", "question": "Which learning approach is most effective?", "options": ["Passive reading only", "Active recall and practice", "Skipping fundamentals", "Relying on memorization"], "correct_index": 1, "explanation": "Active recall strengthens retention and understanding.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p1_q6", "question": "What is a prerequisite before advanced study?", "options": ["Mastering terminology", "Speed reading", "Ignoring basics", "Random exploration"], "correct_index": 0, "explanation": "Mastering terminology is essential before tackling advanced material.", "chunk_id": "chunk_0", "concept_category": "Fundamentals"},
                {"id": "p1_q7", "question": "How does structured learning differ from unstructured?", "options": ["It follows a logical sequence", "It is always faster", "It skips fundamentals", "It requires no effort"], "correct_index": 0, "explanation": "Structured learning builds concepts in a logical, progressive sequence.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p1_q8", "question": "What is the purpose of examples in explanations?", "options": ["To fill space", "To ground abstract ideas in reality", "To confuse learners", "To replace definitions"], "correct_index": 1, "explanation": "Examples ground abstract ideas in reality for better understanding.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p1_q9", "question": "Why is context important when learning terms?", "options": ["Context is irrelevant", "It helps retention and application", "It makes things harder", "It delays progress"], "correct_index": 1, "explanation": "Context helps retention and practical application of terms.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p1_q10", "question": "What distinguishes a core concept from a detail?", "options": ["Core concepts are foundational and recurring", "Details are more important", "There is no difference", "Core concepts are always simpler"], "correct_index": 0, "explanation": "Core concepts are foundational principles that recur throughout the topic.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
            ],
        },
        "phase2": {
            "name": "Application", "description": "Apply concepts to real-world scenarios and problems.",
            "questions": [
                {"id": "p2_q1", "question": "First step when hitting a bottleneck?", "options": ["Abandon", "Trace execution path", "Change random settings", "Blame dependencies"], "correct_index": 1, "explanation": "Tracing pinpoints the exact cause.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p2_q2", "question": "How does scenario framing help?", "options": ["Isolates variables", "Adds complexity", "Hides flaws", "Removes testing"], "correct_index": 0, "explanation": "It isolates variables and predicts outcomes.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p2_q3", "question": "Common implementation trade-off?", "options": ["Simplicity vs Scalability", "Color vs Font", "Users vs Location", "None"], "correct_index": 0, "explanation": "Engineers balance simplicity against scaling demands.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p2_q4", "question": "When should you optimize prematurely?", "options": ["Never, measure first", "Always, at the start", "Only on weekends", "When the code looks slow"], "correct_index": 0, "explanation": "Premature optimization wastes effort; always measure first.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p2_q5", "question": "How do you validate a proposed solution?", "options": ["Test against edge cases", "Trust intuition alone", "Skip testing", "Ask random people"], "correct_index": 0, "explanation": "Testing against edge cases validates solution correctness.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p2_q6", "question": "What makes debugging systematic?", "options": ["Reproducing, isolating, then fixing", "Randomly changing code", "Restarting the server", "Ignoring error logs"], "correct_index": 0, "explanation": "Systematic debugging follows reproduce, isolate, fix methodology.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p2_q7", "question": "When is abstraction beneficial?", "options": ["When it hides unnecessary complexity", "Always, without exception", "Never", "Only in documentation"], "correct_index": 0, "explanation": "Abstraction is beneficial when it simplifies by hiding irrelevant complexity.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p2_q8", "question": "How should you handle conflicting requirements?", "options": ["Prioritize by impact and feasibility", "Implement all at once", "Ignore some", "Choose randomly"], "correct_index": 0, "explanation": "Prioritizing by impact and feasibility resolves conflicting requirements.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p2_q9", "question": "What indicates a well-designed component?", "options": ["Single responsibility and clear interfaces", "Maximum features", "Complex internals", "Tight coupling"], "correct_index": 0, "explanation": "Good components have a single responsibility and clear interfaces.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p2_q10", "question": "Why is iterative development preferred?", "options": ["Enables early feedback and course correction", "It is slower", "It avoids planning", "It requires no testing"], "correct_index": 0, "explanation": "Iterative development enables early feedback loops and timely correction.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
            ],
        },
        "phase3": {
            "name": "Synthesis", "description": "Synthesise and evaluate complex systems and trade-offs.",
            "questions": [
                {"id": "p3_q1", "question": "How do principles ensure reliability?", "options": ["Modular boundaries + verification", "Manual inspection", "Ignoring edge cases", "Hardcoding parameters"], "correct_index": 0, "explanation": "Modular design and verification ensure resilience.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q2", "question": "Ultimate mastery goal?", "options": ["Pass one test", "Design and adapt solutions", "Copy templates", "Avoid discussions"], "correct_index": 1, "explanation": "Mastery means synthesising knowledge to solve novel problems.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q3", "question": "Paramount architectural criterion?", "options": ["Social media popularity", "Domain fit and maintainability", "Fewest code lines", "Arbitrary preference"], "correct_index": 1, "explanation": "Maintainability and domain alignment drive the best choice.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q4", "question": "How do you evaluate competing approaches?", "options": ["Compare trade-offs against constraints", "Pick the newest one", "Choose the simplest always", "Flip a coin"], "correct_index": 0, "explanation": "Evaluating trade-offs against domain constraints yields the best approach.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q5", "question": "What makes knowledge transfer effective?", "options": ["Clear documentation and shared mental models", "Verbal instructions only", "No documentation needed", "Copy-pasting code"], "correct_index": 0, "explanation": "Clear documentation and shared mental models enable effective knowledge transfer.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q6", "question": "When should you break a system into microservices?", "options": ["When independent scaling and deployment are needed", "Always, for every project", "Never", "When the team is small"], "correct_index": 0, "explanation": "Microservices are justified when components need independent scaling.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q7", "question": "How does feedback loop quality affect outcomes?", "options": ["Faster, more accurate loops lead to better outcomes", "Loops are unnecessary", "Slower loops are better", "Feedback is only for managers"], "correct_index": 0, "explanation": "Faster and more accurate feedback loops consistently produce better outcomes.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q8", "question": "What is the risk of over-engineering?", "options": ["Wasted effort on unused abstractions", "Better code quality", "No risk at all", "Faster delivery"], "correct_index": 0, "explanation": "Over-engineering wastes effort on abstractions that may never be needed.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q9", "question": "How do you measure learning effectiveness?", "options": ["Ability to apply concepts to novel problems", "Pages read", "Time spent studying", "Number of certificates"], "correct_index": 0, "explanation": "True effectiveness is measured by applying concepts to novel, unseen problems.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q10", "question": "What integrates all phases of understanding?", "options": ["Connecting recall, application, and critical evaluation", "Memorization alone", "Skipping fundamentals", "Avoiding challenges"], "correct_index": 0, "explanation": "Full understanding connects recall, practical application, and critical evaluation.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
            ],
        },
    }
}


async def call_groq_api_for_quiz(video_title: str, explanation_text: str, language_name: str = "English") -> dict:
    if not settings.groq_api_key:
        return _MOCK_QUIZ

    system_prompt = (
        "You are an expert AI assessment designer. Create a 3-phase multiple-choice quiz. "
        f"You MUST write all questions, options, and explanations directly in {language_name}. "
        "Return JSON with top-level key 'phases' containing 'phase1', 'phase2', 'phase3'. "
        "Each phase has 'name', 'description', and 'questions' (list of exactly 10 questions). "
        "Each question MUST contain:\n"
        "- 'id': string (e.g. p1_q1 through p1_q10)\n"
        "- 'question': string\n"
        "- 'options': list of 4 strings\n"
        "- 'correct_index': integer (0-3)\n"
        "- 'explanation': string explanation\n"
        "- 'chunk_id': string (e.g. 'chunk_0', 'chunk_1', 'chunk_2')\n"
        "- 'concept_category': string (a broad tag like 'System Design', 'Recursion', 'Fundamentals', 'Algorithms')."
    )
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Quiz in {language_name} for '{video_title}':\n\n{explanation_text[:12000]}"},
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


async def call_groq_api_for_remediation(video_title: str, concept_title: str, original_explanation: str, language_name: str = "English") -> dict:
    if not settings.groq_api_key:
        return {
            "re_explanation": (
                f"Let me explain '{concept_title}' with a fresh perspective! "
                "Think of it like building a bridge: instead of looking at the whole structure at once, "
                "you focus on reinforcing one key support pillar."
            ),
            "analogy": "Bridge support pillar analogy"
        }

    system_prompt = (
        "You are an empathetic AI tutor providing targeted remediation for a student who missed a quiz question. "
        f"Provide a SHORT, focused re-explanation of JUST this ONE concept directly in {language_name}. Use a DIFFERENT phrasing or fresh analogy. "
        "Return JSON with two string keys: 're_explanation' (2-3 encouraging sentences) and 'analogy' (short title of the analogy used)."
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    f"Video Topic: '{video_title}'\n"
                    f"Concept to Remediate: '{concept_title}'\n"
                    f"Original Explanation: {original_explanation[:2000]}\n\n"
                    f"Provide a targeted, fresh micro-explanation and analogy in {language_name}."
                )
            },
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.6,
    }

    async with httpx.AsyncClient(timeout=25.0) as client:
        res = await client.post(url, headers=headers, json=payload)
        if res.status_code == 200:
            content = res.json()["choices"][0]["message"]["content"]
            try:
                parsed = json.loads(content) if isinstance(content, str) else content
                if isinstance(parsed, dict) and "re_explanation" in parsed:
                    return {
                        "re_explanation": str(parsed.get("re_explanation", "")).strip(),
                        "analogy": str(parsed.get("analogy", "")).strip() or None
                    }
            except Exception:
                pass

    return {
        "re_explanation": (
            f"Let's break down '{concept_title}' again! "
            "Focus on the underlying core rule: each component has a specific job."
        ),
        "analogy": "Input-output transformation model"
    }


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/extract", response_model=ExtractResponse, status_code=200, summary="Extract transcript from YouTube URL")
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
        raise HTTPException(429, f"Daily limit of {EXTRACTION_DAILY_LIMIT} extractions reached.")

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


@router.post("/explain", response_model=ExplainResponse, status_code=200, summary="Generate AI explanation chunks in target language")
async def explain_youtube_transcript(
    payload: ExplainRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = uuid.UUID(current_user["user_id"])

    target_lang = payload.language.strip().lower() if payload.language else "en"
    if target_lang not in SUPPORTED_LANGUAGES:
        target_lang = "en"
    lang_name = SUPPORTED_LANGUAGES.get(target_lang, "English")

    video_id = extract_video_id(payload.youtube_url) if payload.youtube_url else None
    if not video_id:
        video_id = f"custom_{uuid.uuid4().hex[:10]}"

    # Cache lookup MUST check (video_id, language) pair!
    cached_session = None
    if not video_id.startswith("custom_"):
        res = await db.execute(
            select(LearningSession)
            .where(
                LearningSession.video_id == video_id,
                LearningSession.language == target_lang
            )
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
            language=cached_session.language,
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

    chunks_data = await call_groq_api_for_explanation(transcript_text, language_name=lang_name)

    session = LearningSession(
        user_id=user_uuid,
        video_id=video_id,
        youtube_url=payload.youtube_url or f"https://www.youtube.com/watch?v={video_id}",
        video_title=video_title,
        transcript=transcript_text,
        language=target_lang,
        explanation_chunks={"chunks": chunks_data},
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return ExplainResponse(
        session_id=str(session.id),
        video_id=video_id,
        video_title=video_title,
        language=session.language,
        chunks=[ExplanationChunk(title=c["title"], explanation=c["explanation"]) for c in chunks_data],
        is_cached=False,
        daily_explanations_remaining=max(0, EXPLAIN_DAILY_LIMIT - daily_count - 1),
    )


def sanitize_phase_questions(phase_dict: dict) -> List[QuizQuestionOut]:
    return [
        QuizQuestionOut(
            id=q["id"],
            question=q["question"],
            options=q["options"],
            chunk_id=q.get("chunk_id", "chunk_0"),
            concept_category=q.get("concept_category", "General Concept")
        )
        for q in phase_dict.get("questions", [])
    ]


@router.post("/{session_id}/quiz", response_model=QuizSessionOut, status_code=200, summary="Get/generate 3-phase quiz in session language")
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

    lang_name = SUPPORTED_LANGUAGES.get(session.language, "English")

    if not session.quiz_data:
        explanation_text = " ".join(c["explanation"] for c in session.explanation_chunks.get("chunks", []))
        session.quiz_data = await call_groq_api_for_quiz(session.video_title, explanation_text or session.transcript, language_name=lang_name)
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
        language=session.language,
        current_unlocked_phase=progress.get("current_phase", 1),
        is_completed=bool(progress.get("is_completed")),
        phase1=p1_out, phase2=p2_out, phase3=p3_out,
    )


@router.post("/{session_id}/quiz/{phase}/submit", response_model=QuizSubmitResponse, status_code=200, summary="Submit quiz phase answers")
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
        user_uuid = uuid.UUID(current_user["user_id"])
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
    failed_chunk_set = set()

    for q in questions:
        q_id, correct_idx = q["id"], q["correct_index"]
        q_chunk_id = q.get("chunk_id", "chunk_0")
        q_concept_cat = q.get("concept_category", "General Concept")
        user_idx = payload.answers.get(q_id, -1)
        is_correct = (user_idx == correct_idx)

        if is_correct:
            correct_count += 1
        else:
            failed_chunk_set.add(q_chunk_id)
            gap_stmt = select(UserConceptGap).where(
                UserConceptGap.user_id == user_uuid,
                UserConceptGap.concept_category == q_concept_cat
            )
            gap_res = await db.execute(gap_stmt)
            existing_gap = gap_res.scalar_one_or_none()
            if existing_gap:
                existing_gap.miss_count += 1
                existing_gap.last_seen_at = datetime.now(timezone.utc)
                db.add(existing_gap)
            else:
                new_gap = UserConceptGap(
                    user_id=user_uuid,
                    concept_category=q_concept_cat,
                    miss_count=1
                )
                db.add(new_gap)

    score = round(correct_count / len(questions) * 100.0, 1)
    passed = score >= 70.0
    next_unlocked = None

    if passed:
        updated_progress = dict(progress)
        if phase == 1:
            updated_progress["phase1_passed"] = True
            updated_progress["current_phase"] = max(updated_progress.get("current_phase", 1), 2)
            next_unlocked = 2
        elif phase == 2:
            updated_progress["phase2_passed"] = True
            updated_progress["current_phase"] = max(updated_progress.get("current_phase", 1), 3)
            next_unlocked = 3
        elif phase == 3:
            updated_progress["phase3_passed"] = True
            updated_progress["is_completed"] = True
        
        session.user_progress = updated_progress
        flag_modified(session, "user_progress")
        db.add(session)

    await db.commit()
    await db.refresh(session)

    chunks = session.explanation_chunks.get("chunks", [])

    for q in questions:
        q_chunk_id = q.get("chunk_id", "chunk_0")
        q_concept_cat = q.get("concept_category", "General Concept")
        concept_title = q_concept_cat
        if q_chunk_id.startswith("chunk_"):
            try:
                c_idx = int(q_chunk_id.replace("chunk_", ""))
                if 0 <= c_idx < len(chunks):
                    concept_title = chunks[c_idx].get("title", q_concept_cat)
            except ValueError:
                pass

        user_idx = payload.answers.get(q["id"], -1)
        details.append(QuestionResultDetail(
            question_id=q["id"],
            user_index=user_idx,
            correct_index=q["correct_index"],
            is_correct=(user_idx == q["correct_index"]),
            explanation=q.get("explanation", ""),
            chunk_id=q_chunk_id,
            concept_title=concept_title,
            concept_category=q_concept_cat
        ))

    return QuizSubmitResponse(
        phase=phase, passed=passed, score_percent=score,
        correct_count=correct_count, total_questions=len(questions),
        passing_threshold_percent=70.0, next_phase_unlocked=next_unlocked,
        is_session_completed=bool(session.user_progress.get("is_completed")),
        details=details,
        failed_chunk_ids=list(failed_chunk_set)
    )


@router.post("/{session_id}/remediate", response_model=RemediateResponse, status_code=200, summary="Generate targeted concept micro-explanation")
async def remediate_concept_chunk(
    session_id: str,
    payload: RemediateRequest,
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

    lang_name = SUPPORTED_LANGUAGES.get(session.language, "English")
    chunks = session.explanation_chunks.get("chunks", [])
    if not chunks:
        raise HTTPException(400, "No explanation chunks available.")

    target_chunk = None
    target_chunk_id = payload.chunk_id.strip()

    if target_chunk_id.startswith("chunk_"):
        try:
            idx = int(target_chunk_id.replace("chunk_", ""))
            if 0 <= idx < len(chunks):
                target_chunk = chunks[idx]
        except ValueError:
            pass

    if not target_chunk:
        for idx, c in enumerate(chunks):
            if c.get("title", "").strip().lower() == target_chunk_id.lower():
                target_chunk = c
                target_chunk_id = f"chunk_{idx}"
                break

    if not target_chunk:
        target_chunk = chunks[0]
        target_chunk_id = "chunk_0"

    concept_title = target_chunk.get("title", "Concept Remediation")
    original_exp = target_chunk.get("explanation", "")

    remediation_cache = session.remediation_data or {}
    if target_chunk_id in remediation_cache:
        cached_item = remediation_cache[target_chunk_id]
        return RemediateResponse(
            session_id=str(session.id),
            chunk_id=target_chunk_id,
            concept_title=concept_title,
            re_explanation=cached_item.get("re_explanation", ""),
            analogy=cached_item.get("analogy"),
            is_cached=True,
        )

    remediation_result = await call_groq_api_for_remediation(
        session.video_title, concept_title, original_exp, language_name=lang_name
    )

    remediation_cache[target_chunk_id] = remediation_result
    session.remediation_data = dict(remediation_cache)
    flag_modified(session, "remediation_data")
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return RemediateResponse(
        session_id=str(session.id),
        chunk_id=target_chunk_id,
        concept_title=concept_title,
        re_explanation=remediation_result["re_explanation"],
        analogy=remediation_result.get("analogy"),
        is_cached=False,
    )


@router.get("/me/gaps", response_model=UserGapsResponse, status_code=200, summary="Get student's recurring weak concept areas")
async def get_user_concept_gaps(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = uuid.UUID(current_user["user_id"])
    stmt = (
        select(UserConceptGap)
        .where(UserConceptGap.user_id == user_uuid)
        .order_by(UserConceptGap.miss_count.desc(), UserConceptGap.last_seen_at.desc())
    )
    res = await db.execute(stmt)
    gaps = res.scalars().all()

    gap_models = [
        UserConceptGapOut(
            concept_category=g.concept_category,
            miss_count=g.miss_count,
            last_seen_at=g.last_seen_at
        )
        for g in gaps
    ]

    return UserGapsResponse(
        total_gaps_count=len(gap_models),
        gaps=gap_models
    )
