import re
import uuid
from datetime import datetime, timedelta, timezone
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

from src.database import get_db
from src.auth.dependencies import get_current_user
from src.models.learn import LearnExtractionLog
from src.schemas.learn import ExtractRequest, ExtractResponse, TranscriptSegment

router = APIRouter(prefix="/learn", tags=["learn"])

YOUTUBE_REGEX = re.compile(
    r'(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})'
)

DAILY_LIMIT = 10


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

    if user_extractions_count >= DAILY_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily extraction limit reached ({DAILY_LIMIT} extractions per 24 hours). Please try again tomorrow."
        )

    # 3. Extract Transcript using youtube-transcript-api
    try:
        try:
            raw_transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'en-US', 'en-GB'])
        except Exception:
            # Fallback to any available language
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

    remaining = DAILY_LIMIT - (user_extractions_count + 1)

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
