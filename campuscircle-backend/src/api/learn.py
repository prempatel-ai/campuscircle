import json
import re
import uuid
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
    ExplanationChunk
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


async def call_groq_api_for_explanation(transcript_text: str) -> List[dict]:
    if not settings.groq_api_key:
        # Graceful fallback storytelling generator if GROQ_API_KEY is not yet configured
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
        # Attempt 1
        res = await client.post(url, headers=headers, json=payload)
        if res.status_code == 200:
            data = res.json()
            content = data["choices"][0]["message"]["content"]
            parsed = parse_and_validate_chunks(content)
            if parsed:
                return parsed

        # Attempt 2 (Retry once if format was invalid or API had transient issue)
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

    # 1. Validate YouTube URL & extract Video ID
    video_id = extract_video_id(payload.youtube_url)
    if not video_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid YouTube URL. Please provide a valid YouTube watch link or Short URL."
        )

    # 2. Rate limit check (Max 10 extractions per 24 hours)
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

    # 3. Extract Transcript using youtube-transcript-api
    try:
        try:
            raw_transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'en-US', 'en-GB'])
        except Exception:
            raw_transcript = YouTubeTranscriptApi.get_transcript(video_id)
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
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to extract transcript: {str(e)}"
        )

    # 4. Process segments & metadata
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

    # 5. Log extraction for rate limiting
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

    # 1. Extract Video ID
    video_id = extract_video_id(payload.youtube_url)
    if not video_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid YouTube URL. Please provide a valid YouTube watch link or Short URL."
        )

    # 2. Check DB Cache first (Keyed by video_id) — avoids re-calling Groq API!
    cache_stmt = (
        select(LearningSession)
        .where(LearningSession.video_id == video_id)
        .order_by(LearningSession.created_at.desc())
    )
    cache_res = await db.execute(cache_stmt)
    cached_session = cache_res.scalars().first()

    # Calculate user's remaining daily explanation quota
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    user_count_stmt = select(func.count(LearningSession.id)).where(
        LearningSession.user_id == user_uuid,
        LearningSession.created_at >= cutoff
    )
    user_count_res = await db.execute(user_count_stmt)
    user_daily_explanations = user_count_res.scalar_one() or 0

    if cached_session:
        # Return cached explanation directly without hitting Groq API
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

    # 3. Rate Limit Check for new AI API calls (Max 5 explanations per 24 hours)
    if user_daily_explanations >= EXPLAIN_DAILY_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily explanation limit reached ({EXPLAIN_DAILY_LIMIT} explanations per 24 hours)."
        )

    # 4. Get transcript text (from payload or extract live)
    transcript_text = payload.transcript.strip() if payload.transcript else None
    video_title = await fetch_video_title(video_id) or f"YouTube Video ({video_id})"

    if not transcript_text:
        try:
            try:
                raw_transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'en-US', 'en-GB'])
            except Exception:
                raw_transcript = YouTubeTranscriptApi.get_transcript(video_id)
            transcript_text = " ".join([item.get("text", "").replace("\n", " ").strip() for item in raw_transcript])
        except TranscriptsDisabled:
            raise HTTPException(status_code=400, detail="Captions/transcripts are disabled for this video.")
        except NoTranscriptFound:
            raise HTTPException(status_code=404, detail="No transcript available for this video.")
        except VideoUnavailable:
            raise HTTPException(status_code=404, detail="The specified video is unavailable.")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to fetch transcript: {str(e)}")

    # 5. Call Groq API for storytelling chunks
    chunks_data = await call_groq_api_for_explanation(transcript_text)

    # 6. Cache in DB (LearningSession)
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
