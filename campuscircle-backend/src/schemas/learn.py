from typing import List, Optional
from pydantic import BaseModel, Field, HttpUrl


class TranscriptSegment(BaseModel):
    text: str
    start: float
    duration: float


class ExtractRequest(BaseModel):
    youtube_url: str = Field(..., description="Full YouTube video URL (watch link, short, or embed)")


class ExtractResponse(BaseModel):
    video_id: str
    youtube_url: str
    title: Optional[str] = None
    transcript: str
    duration_seconds: int
    segments_count: int
    segments: Optional[List[TranscriptSegment]] = None
    daily_extractions_remaining: int


class ExplanationChunk(BaseModel):
    title: str
    explanation: str


class ExplainRequest(BaseModel):
    youtube_url: str = Field(..., description="YouTube video URL")
    transcript: Optional[str] = Field(None, description="Optional pre-extracted transcript text")


class ExplainResponse(BaseModel):
    session_id: str
    video_id: str
    video_title: str
    chunks: List[ExplanationChunk]
    is_cached: bool
    daily_explanations_remaining: int
