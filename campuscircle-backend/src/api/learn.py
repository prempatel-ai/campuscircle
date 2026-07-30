import html
import json
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import List, Optional
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
                data = res.json()
                return data.get("title")
    except Exception:
        pass
    return None


async def fetch_transcript_fallback(video_id: str) -> List[dict]:
    """
    Direct fallback transcript extractor using custom User-Agent and YouTube timedtext API.
    Bypasses cloud IP bot detection flags by parsing player response captionTracks directly.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
    }
    url = f"https://www.youtube.com/watch?v={video_id}"

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        res = await client.get(url, headers=headers)
        if res.status_code != 200:
            raise Exception(f"Failed to fetch video page ({res.status_code})")

        html_content = res.text

        match = re.search(r'ytInitialPlayerResponse\s*=\s*({.*?});', html_content)
        if not match:
            match_url = re.search(r'"captionTracks":\s*\[\s*{"baseUrl":\s*"(.*?)"', html_content)
            if match_url:
                caption_url = match_url.group(1).replace(r"\u0026", "&")
            else:
                raise Exception("No caption tracks embedded in video page")
        else:
            try:
                player_data = json.loads(match.group(1))
                captions = player_data.get("captions", {}).get("playerCaptionsTracklistRenderer", {}).get("captionTracks", [])
                if not captions:
                    raise Exception("No caption tracks found for video")

                en_track = next((c for c in captions if "en" in c.get("languageCode", "")), captions[0])
                caption_url = en_track["baseUrl"]
            except Exception:
                raise Exception("Could not parse player captions response")

        sub_res = await client.get(caption_url, headers=headers)
        if sub_res.status_code != 200:
            raise Exception("Failed to fetch caption track XML")

        root = ET.fromstring(sub_res.text)
        segments = []
        for elem in root.findall("text"):
            text_val = html.unescape(elem.text or "").replace("\n", " ").strip()
            if text_val:
                segments.append({
                    "text": text_val,
                    "start": float(elem.attrib.get("start", 0)),
                    "duration": float(elem.attrib.get("dur", 0))
                })

        if not segments:
            raise Exception("Empty transcript XML")

        return segments


async def get_transcript_with_fallback(video_id: str) -> List[dict]:
    # 1. Try youtube-transcript-api first
    try:
        try:
            return YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'en-US', 'en-GB'])
        except Exception:
            return YouTubeTranscriptApi.get_transcript(video_id)
    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable) as e:
        raise e
    except Exception:
        pass

    # 2. Try direct timedtext fallback
    try:
        return await fetch_transcript_fallback(video_id)
    except Exception as fallback_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not retrieve transcript: {str(fallback_err)}. Ensure closed captions (CC) are enabled for this video."
        )


def parse_and_validate_chunks(content_str: str) -> List[dict] | None:
    try:
        data = json.loads(content_str)
        chunks = data.get("chunks")
        if isinstance(chunks, list) and len(chunks) > 0:
            validated = []
            for item in chunks:
                if isinstance(item, dict) and "title" in item and "explanation" in item:
                    validated.append({
                        "title": str(item["title"]).strip(),
                        "explanation": str(item["explanation"]).strip()
                    })
            if len(validated) > 0:
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
            if not isinstance(questions, list) or len(questions) == 0:
                return None
            for q in questions:
                if not isinstance(q, dict):
                    return None
                if not all(k in q for k in ["id", "question", "options", "correct_index", "explanation"]):
                    return None
                if not isinstance(q["options"], list) or len(q["options"]) != 4:
                    return None
                if not isinstance(q["correct_index"], int) or q["correct_index"] not in [0, 1, 2, 3]:
                    return None
        return data
    except Exception:
        return None


async def call_groq_api_for_explanation(transcript_text: str) -> List[dict]:
    if not settings.groq_api_key:
        return [
            {
                "title": "Introduction to the Topic",
                "explanation": "Imagine you are opening a new textbook for the first time. The video introduces the core concept by laying out foundational principles in clear, simple terms."
            },
            {
                "title": "Real-World Scenario",
                "explanation": "Next, the material uses a practical scenario—think of how a chef orchestrates a kitchen during rush hour—to demonstrate how each piece works together."
            },
            {
                "title": "Core Takeaway & Application",
                "explanation": "Finally, the key lesson is that by understanding these building blocks, you can apply them to solve complex problems independently."
            }
        ]

    system_prompt = (
        "You are an expert AI educator. Break down the provided video transcript into "
        "digestible, storytelling-style explanation chunks for a first-time learner. "
        "You MUST return a JSON object with a single top-level key 'chunks', which is a list of objects. "
        "Each object in 'chunks' MUST contain exactly two string keys: 'title' (a short, catchy title) and "
        "'explanation' (a scenario/storytelling-style explanation in plain language)."
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Explain the following transcript in storytelling chunks:\n\n{transcript_text[:12000]}"}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.5
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(url, headers=headers, json=payload)
        if res.status_code == 200:
            data = res.json()
            content = data["choices"][0]["message"]["content"]
            parsed = parse_and_validate_chunks(content)
            if parsed:
                return parsed

        res_retry = await client.post(url, headers=headers, json=payload)
        if res_retry.status_code == 200:
            data = res_retry.json()
            content = data["choices"][0]["message"]["content"]
            parsed = parse_and_validate_chunks(content)
            if parsed:
                return parsed

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="The AI model failed to generate a valid structured JSON explanation. Please try again."
    )


async def call_groq_api_for_quiz(video_title: str, explanation_text: str) -> dict:
    if not settings.groq_api_key:
        return {
            "phases": {
                "phase1": {
                    "name": "Recall",
                    "description": "Test basic memory of core terms and definitions.",
                    "questions": [
                        {
                            "id": "p1_q1",
                            "question": f"What primary topic is explored in '{video_title}'?",
                            "options": [
                                "Foundational concepts and core principles",
                                "Unrelated historical background",
                                "Advanced unverified theories",
                                "Administrative guidelines"
                            ],
                            "correct_index": 0,
                            "explanation": "The material focuses on foundational concepts and core principles."
                        },
                        {
                            "id": "p1_q2",
                            "question": "Why are basic building blocks established early in the lesson?",
                            "options": [
                                "To confuse first-time learners",
                                "To build a solid mental framework for practical applications",
                                "To meet arbitrary word length rules",
                                "To skip real-world examples"
                            ],
                            "correct_index": 1,
                            "explanation": "Building blocks provide a mental framework for applying concepts later."
                        },
                        {
                            "id": "p1_q3",
                            "question": "How should a first-time learner approach key terms?",
                            "options": [
                                "Memorize without understanding context",
                                "Ignore definitions completely",
                                "Connect definitions to practical scenario examples",
                                "Rely solely on luck"
                            ],
                            "correct_index": 2,
                            "explanation": "Connecting terms to real-world scenarios solidifies understanding."
                        }
                    ]
                },
                "phase2": {
                    "name": "Application",
                    "description": "Apply concepts to real-world scenarios.",
                    "questions": [
                        {
                            "id": "p2_q1",
                            "question": "If you encounter a bottleneck when applying these principles, what is the best first step?",
                            "options": [
                                "Abandon the solution",
                                "Analyze system components and trace the execution path",
                                "Randomly change configuration settings",
                                "Blame external dependencies"
                            ],
                            "correct_index": 1,
                            "explanation": "Tracing the execution path pinpoints the exact component causing the bottleneck."
                        },
                        {
                            "id": "p2_q2",
                            "question": "How does scenario framing help in problem solving?",
                            "options": [
                                "It forces you to isolate variables and predict outcomes",
                                "It adds unnecessary complexity",
                                "It hides underlying technical flaws",
                                "It eliminates the need for testing"
                            ],
                            "correct_index": 0,
                            "explanation": "Scenario framing helps isolate variables and accurately predict system behavior."
                        },
                        {
                            "id": "p2_q3",
                            "question": "Which trade-off is typically evaluated during practical implementation?",
                            "options": [
                                "Simplicity vs Scalability",
                                "Color scheme vs Font choice",
                                "User count vs Server location",
                                "None of the above"
                            ],
                            "correct_index": 0,
                            "explanation": "Engineers balance architectural simplicity against future scaling demands."
                        }
                    ]
                },
                "phase3": {
                    "name": "Synthesis",
                    "description": "Synthesize knowledge to evaluate complex systems.",
                    "questions": [
                        {
                            "id": "p3_q1",
                            "question": "How do the core principles combine to ensure long-term system reliability?",
                            "options": [
                                "By establishing modular boundaries and automated verification",
                                "By relying on manual inspection",
                                "By ignoring edge cases",
                                "By hardcoding variable parameters"
                            ],
                            "correct_index": 0,
                            "explanation": "Modular boundaries and automated verification ensure long-term resilience."
                        },
                        {
                            "id": "p3_q2",
                            "question": "What is the ultimate goal of mastering this topic?",
                            "options": [
                                "To pass a single test",
                                "To design, evaluate, and adapt solutions to novel challenges",
                                "To copy existing templates verbatim",
                                "To avoid technical discussions"
                            ],
                            "correct_index": 1,
                            "explanation": "True mastery allows you to synthesize knowledge and adapt solutions to new challenges."
                        },
                        {
                            "id": "p3_q3",
                            "question": "When evaluating two competing technical architectures, which criterion is paramount?",
                            "options": [
                                "Popularity on social media",
                                "Alignment with domain constraints and maintainability",
                                "Shortest code line count",
                                "Arbitrary preference"
                            ],
                            "correct_index": 1,
                            "explanation": "Maintainability and alignment with domain constraints drive optimal architectural choices."
                        }
                    ]
                }
            }
        }

    system_prompt = (
        "You are an expert AI assessment designer. Create a 3-phase multiple-choice quiz based on the provided material. "
        "You MUST return a JSON object containing a top-level key 'phases'. 'phases' MUST contain three keys: 'phase1', 'phase2', and 'phase3'.\n"
        "- 'phase1': Name 'Recall' (basic fact/concept recall). 'questions': list of 3 questions.\n"
        "- 'phase2': Name 'Application' (scenario/practical application). 'questions': list of 3 questions.\n"
        "- 'phase3': Name 'Synthesis' (analytical evaluation/synthesis). 'questions': list of 3 questions.\n\n"
        "Each question object MUST contain:\n"
        "- 'id': string (e.g. 'p1_q1', 'p1_q2', 'p1_q3', 'p2_q1'...)\n"
        "- 'question': string question text\n"
        "- 'options': list of exactly 4 string options [option0, option1, option2, option3]\n"
        "- 'correct_index': integer (0, 1, 2, or 3) indicating the zero-based index of the correct option\n"
        "- 'explanation': string explaining why that option is correct."
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Generate a 3-phase quiz for video '{video_title}':\n\n{explanation_text[:12000]}"}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3
    }

    async with httpx.AsyncClient(timeout=35.0) as client:
        res = await client.post(url, headers=headers, json=payload)
        if res.status_code == 200:
            data = res.json()
            content = data["choices"][0]["message"]["content"]
            parsed_json = json.loads(content) if isinstance(content, str) else content
            validated = validate_quiz_data_structure(parsed_json)
            if validated:
                return validated

        res_retry = await client.post(url, headers=headers, json=payload)
        if res_retry.status_code == 200:
            data = res_retry.json()
            content = data["choices"][0]["message"]["content"]
            parsed_json = json.loads(content) if isinstance(content, str) else content
            validated = validate_quiz_data_structure(parsed_json)
            if validated:
                return validated

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Failed to generate valid structured quiz JSON from AI model. Please try again."
    )


@router.post(
    "/extract",
    response_model=ExtractResponse,
    status_code=status.HTTP_200_OK,
    summary="Extract transcript from a YouTube URL (Rate limited: 10/day per user)"
)
async def extract_youtube_transcript(
    payload: ExtractRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])

    video_id = extract_video_id(payload.youtube_url)
    if not video_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid YouTube URL. Please provide a valid YouTube watch link or Short URL."
        )

    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    count_stmt = select(func.count(LearnExtractionLog.id)).where(
        LearnExtractionLog.user_id == user_uuid,
        LearnExtractionLog.created_at >= cutoff
    )
    count_res = await db.execute(count_stmt)
    user_extractions_count = count_res.scalar_one() or 0

    if user_extractions_count >= EXTRACTION_DAILY_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily extraction limit reached ({EXTRACTION_DAILY_LIMIT} extractions per 24 hours). Please try again tomorrow."
        )

    try:
        raw_transcript = await get_transcript_with_fallback(video_id)
    except TranscriptsDisabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captions/transcripts are disabled for this YouTube video."
        )
    except NoTranscriptFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No transcript available for this YouTube video."
        )
    except VideoUnavailable:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The specified YouTube video is unavailable or private."
        )

    segments = [
        TranscriptSegment(
            text=item.get("text", "").replace("\n", " ").strip(),
            start=round(float(item.get("start", 0)), 2),
            duration=round(float(item.get("duration", 0)), 2)
        )
        for item in raw_transcript
    ]

    full_transcript_text = " ".join([seg.text for seg in segments])
    total_duration = int(sum([seg.duration for seg in segments])) if segments else 0

    video_title = await fetch_video_title(video_id)

    log_entry = LearnExtractionLog(user_id=user_uuid, video_id=video_id)
    db.add(log_entry)
    await db.commit()

    remaining = EXTRACTION_DAILY_LIMIT - (user_extractions_count + 1)

    return ExtractResponse(
        video_id=video_id,
        youtube_url=f"https://www.youtube.com/watch?v={video_id}",
        title=video_title or f"YouTube Video ({video_id})",
        transcript=full_transcript_text,
        duration_seconds=total_duration,
        segments_count=len(segments),
        segments=segments,
        daily_extractions_remaining=max(0, remaining)
    )


@router.post(
    "/explain",
    response_model=ExplainResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate storytelling explanation chunks for a YouTube video using Groq AI (Cached per video)"
)
async def explain_youtube_transcript(
    payload: ExplainRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])

    video_id = extract_video_id(payload.youtube_url)
    if not video_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid YouTube URL. Please provide a valid YouTube watch link or Short URL."
        )

    cache_stmt = (
        select(LearningSession)
        .where(LearningSession.video_id == video_id)
        .order_by(LearningSession.created_at.desc())
    )
    cache_res = await db.execute(cache_stmt)
    cached_session = cache_res.scalars().first()

    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    user_count_stmt = select(func.count(LearningSession.id)).where(
        LearningSession.user_id == user_uuid,
        LearningSession.created_at >= cutoff
    )
    user_count_res = await db.execute(user_count_stmt)
    user_daily_explanations = user_count_res.scalar_one() or 0

    if cached_session:
        raw_chunks = cached_session.explanation_chunks.get("chunks", [])
        chunk_models = [ExplanationChunk(title=c["title"], explanation=c["explanation"]) for c in raw_chunks]
        return ExplainResponse(
            session_id=str(cached_session.id),
            video_id=video_id,
            video_title=cached_session.video_title,
            chunks=chunk_models,
            is_cached=True,
            daily_explanations_remaining=max(0, EXPLAIN_DAILY_LIMIT - user_daily_explanations)
        )

    if user_daily_explanations >= EXPLAIN_DAILY_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily explanation limit reached ({EXPLAIN_DAILY_LIMIT} explanations per 24 hours)."
        )

    transcript_text = payload.transcript.strip() if payload.transcript else None
    video_title = await fetch_video_title(video_id) or f"YouTube Video ({video_id})"

    if not transcript_text:
        try:
            raw_transcript = await get_transcript_with_fallback(video_id)
            transcript_text = " ".join([item.get("text", "").replace("\n", " ").strip() for item in raw_transcript])
        except TranscriptsDisabled:
            raise HTTPException(status_code=400, detail="Captions/transcripts are disabled for this video.")
        except NoTranscriptFound:
            raise HTTPException(status_code=404, detail="No transcript available for this video.")
        except VideoUnavailable:
            raise HTTPException(status_code=404, detail="The specified video is unavailable.")

    chunks_data = await call_groq_api_for_explanation(transcript_text)

    new_session = LearningSession(
        user_id=user_uuid,
        video_id=video_id,
        youtube_url=f"https://www.youtube.com/watch?v={video_id}",
        video_title=video_title,
        transcript=transcript_text,
        explanation_chunks={"chunks": chunks_data}
    )
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)

    chunk_models = [ExplanationChunk(title=c["title"], explanation=c["explanation"]) for c in chunks_data]
    remaining = EXPLAIN_DAILY_LIMIT - (user_daily_explanations + 1)

    return ExplainResponse(
        session_id=str(new_session.id),
        video_id=video_id,
        video_title=video_title,
        chunks=chunk_models,
        is_cached=False,
        daily_explanations_remaining=max(0, remaining)
    )


def sanitize_phase_questions(phase_dict: dict) -> List[QuizQuestionOut]:
    questions = phase_dict.get("questions", [])
    sanitized = []
    for q in questions:
        sanitized.append(
            QuizQuestionOut(
                id=q["id"],
                question=q["question"],
                options=q["options"]
            )
        )
    return sanitized


@router.post(
    "/{session_id}/quiz",
    response_model=QuizSessionOut,
    status_code=status.HTTP_200_OK,
    summary="Get or generate 3-phase adaptive quiz for a learning session"
)
async def get_or_create_quiz(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learning session not found.")

    stmt = select(LearningSession).where(LearningSession.id == session_uuid)
    res = await db.execute(stmt)
    session = res.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learning session not found.")

    if not session.quiz_data:
        explanation_text = " ".join([c["explanation"] for c in session.explanation_chunks.get("chunks", [])])
        quiz_json = await call_groq_api_for_quiz(session.video_title, explanation_text or session.transcript)
        session.quiz_data = quiz_json
        session.user_progress = {
            "current_phase": 1,
            "phase1_passed": False,
            "phase2_passed": False,
            "phase3_passed": False,
            "is_completed": False
        }
        db.add(session)
        await db.commit()
        await db.refresh(session)

    progress = session.user_progress or {
        "current_phase": 1,
        "phase1_passed": False,
        "phase2_passed": False,
        "phase3_passed": False,
        "is_completed": False
    }

    phases_data = session.quiz_data.get("phases", {})
    p1_raw = phases_data.get("phase1", {})
    p2_raw = phases_data.get("phase2", {})
    p3_raw = phases_data.get("phase3", {})

    p1_out = QuizPhaseOut(
        phase=1,
        name=p1_raw.get("name", "Recall"),
        description=p1_raw.get("description", "Recall facts & core terms"),
        is_unlocked=True,
        is_passed=bool(progress.get("phase1_passed")),
        questions=sanitize_phase_questions(p1_raw)
    )

    p2_out = None
    if progress.get("phase1_passed"):
        p2_out = QuizPhaseOut(
            phase=2,
            name=p2_raw.get("name", "Application"),
            description=p2_raw.get("description", "Apply concepts to practical scenarios"),
            is_unlocked=True,
            is_passed=bool(progress.get("phase2_passed")),
            questions=sanitize_phase_questions(p2_raw)
        )

    p3_out = None
    if progress.get("phase2_passed"):
        p3_out = QuizPhaseOut(
            phase=3,
            name=p3_raw.get("name", "Synthesis"),
            description=p3_raw.get("description", "Synthesize & evaluate complex ideas"),
            is_unlocked=True,
            is_passed=bool(progress.get("phase3_passed")),
            questions=sanitize_phase_questions(p3_raw)
        )

    return QuizSessionOut(
        session_id=str(session.id),
        video_id=session.video_id,
        video_title=session.video_title,
        current_unlocked_phase=progress.get("current_phase", 1),
        is_completed=bool(progress.get("is_completed")),
        phase1=p1_out,
        phase2=p2_out,
        phase3=p3_out
    )


@router.post(
    "/{session_id}/quiz/{phase}/submit",
    response_model=QuizSubmitResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit answers for a quiz phase and grade locally without AI calls"
)
async def submit_quiz_phase(
    session_id: str,
    phase: int,
    payload: QuizSubmitRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if phase not in [1, 2, 3]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phase must be 1, 2, or 3.")

    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learning session not found.")

    stmt = select(LearningSession).where(LearningSession.id == session_uuid)
    res = await db.execute(stmt)
    session = res.scalar_one_or_none()

    if not session or not session.quiz_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz session not found.")

    progress = session.user_progress or {
        "current_phase": 1,
        "phase1_passed": False,
        "phase2_passed": False,
        "phase3_passed": False,
        "is_completed": False
    }

    if phase == 2 and not progress.get("phase1_passed"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phase 1 must be passed before attempting Phase 2.")
    if phase == 3 and not progress.get("phase2_passed"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phase 2 must be passed before attempting Phase 3.")

    phase_key = f"phase{phase}"
    phase_questions = session.quiz_data.get("phases", {}).get(phase_key, {}).get("questions", [])

    if not phase_questions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"No questions found for phase {phase}.")

    correct_count = 0
    total_questions = len(phase_questions)
    details: List[QuestionResultDetail] = []

    for q in phase_questions:
        q_id = q["id"]
        correct_idx = q["correct_index"]
        user_idx = payload.answers.get(q_id, -1)
        is_correct = (user_idx == correct_idx)

        if is_correct:
            correct_count += 1

        details.append(
            QuestionResultDetail(
                question_id=q_id,
                user_index=user_idx,
                correct_index=correct_idx,
                is_correct=is_correct,
                explanation=q.get("explanation", "")
            )
        )

    score_percent = round((correct_count / total_questions) * 100.0, 1)
    passed = (score_percent >= 70.0)

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
        phase=phase,
        passed=passed,
        score_percent=score_percent,
        correct_count=correct_count,
        total_questions=total_questions,
        passing_threshold_percent=70.0,
        next_phase_unlocked=next_unlocked,
        is_session_completed=bool(progress.get("is_completed")),
        details=details
    )
