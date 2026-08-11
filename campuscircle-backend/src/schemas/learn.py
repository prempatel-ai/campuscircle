import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
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
    has_visual: bool = Field(False, description="Whether this chunk includes an interactive sandboxed visual simulation")
    visual_html: Optional[str] = Field(None, description="Self-contained HTML + SVG + JS for interactive visual simulation")


class ExplainRequest(BaseModel):
    youtube_url: str = Field(..., description="YouTube video URL")
    transcript: Optional[str] = Field(None, description="Optional pre-extracted transcript text")
    language: str = Field("en", description="Target language code: en, hi, es, fr, gu")


class ExplainResponse(BaseModel):
    session_id: str
    video_id: str
    video_title: str
    language: str
    chunks: List[ExplanationChunk]
    is_cached: bool
    daily_explanations_remaining: int


class QuizQuestionOut(BaseModel):
    id: str
    question: str
    options: List[str]
    chunk_id: Optional[str] = Field(None, description="Explanation chunk reference ID or title")
    concept_category: Optional[str] = Field(None, description="Broad concept category tag e.g. Recursion, System Design")


class QuizPhaseOut(BaseModel):
    phase: int
    name: str
    description: str
    is_unlocked: bool
    is_passed: bool
    questions: List[QuizQuestionOut]
    attempts_count: int = 0
    max_attempts: int = 3


class QuizSessionOut(BaseModel):
    session_id: str
    video_id: str
    video_title: str
    language: str
    current_unlocked_phase: int
    is_completed: bool
    phase1: QuizPhaseOut
    phase2: Optional[QuizPhaseOut] = None
    phase3: Optional[QuizPhaseOut] = None


class QuizSubmitRequest(BaseModel):
    answers: dict[str, int] = Field(..., description="Mapping of question_id to selected option index (0..3)")


class QuestionResultDetail(BaseModel):
    question_id: str
    user_index: int
    correct_index: int
    is_correct: bool
    explanation: str
    chunk_id: Optional[str] = None
    concept_title: Optional[str] = None
    concept_category: Optional[str] = None


class QuizSubmitResponse(BaseModel):
    phase: int
    passed: bool
    score_percent: float
    correct_count: int
    total_questions: int
    passing_threshold_percent: float = 70.0
    next_phase_unlocked: Optional[int] = None
    is_session_completed: bool
    attempts_count: int = 1
    max_attempts: int = 3
    can_retry: bool = True
    details: List[QuestionResultDetail]
    failed_chunk_ids: List[str] = Field(default_factory=list, description="Chunk/concept IDs needing remediation")


class RemediateRequest(BaseModel):
    chunk_id: str = Field(..., description="ID or title of the explanation chunk to remediate")


class RemediateResponse(BaseModel):
    session_id: str
    chunk_id: str
    concept_title: str
    re_explanation: str
    analogy: Optional[str] = None
    is_cached: bool


class UserConceptGapOut(BaseModel):
    concept_category: str
    miss_count: int
    last_seen_at: datetime


class UserGapsResponse(BaseModel):
    total_gaps_count: int
    gaps: List[UserConceptGapOut]


class StudentLearningProfileOut(BaseModel):
    user_id: uuid.UUID
    total_sessions: int
    total_study_time_seconds: int
    topics_completed: int
    topics_learning: int
    avg_quiz_score: float
    highest_quiz_score: float
    total_quizzes_completed: int
    strong_concepts: List[str]
    weak_concepts: List[str]
    preferred_language: str
    current_streak_days: int
    last_learning_date: Optional[datetime] = None
    career_goal: Optional[str] = Field(None, description="Student's selected career learning goal")
    extra_data: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CareerGoalUpdatePayload(BaseModel):
    career_goal: str = Field(..., max_length=100, description="Selected career learning goal")


class PreSessionMentorOut(BaseModel):
    greeting: str
    mentor_message: str
    suggested_next_topic: Optional[str] = None
    career_goal: Optional[str] = None
    streak_days: int = 0


class PostSessionMentorOut(BaseModel):
    summary_message: str
    strengths: List[str] = Field(default_factory=list)
    needs_practice: List[str] = Field(default_factory=list)
    suggested_next_topic: Optional[str] = None




class LessonChatSendIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="Follow-up question or message from student")


class LessonChatMessageOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    sender: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Learning Dashboard schemas ──────────────────────────────────────────────

class SubjectMasteryItem(BaseModel):
    subject: str
    mastery_percent: float  # 0–100, derived from avg quiz score in that subject
    sessions_count: int


class RecentActivityItem(BaseModel):
    session_id: Optional[str] = None
    topic_title: str
    subject_category: str
    quiz_score: float
    mastery_level: str
    completed_at: datetime


class LearningDashboardOut(BaseModel):
    # Core stats (from StudentLearningProfile)
    total_sessions: int
    total_study_time_seconds: int
    topics_completed: int
    avg_quiz_score: float
    highest_quiz_score: float
    current_streak_days: int
    career_goal: Optional[str] = None

    # Concept strength (from StudentLearningProfile)
    strong_concepts: List[str] = Field(default_factory=list)
    weak_concepts: List[str] = Field(default_factory=list)

    # Subject mastery (computed from UserLearningMemory)
    subject_mastery: List[SubjectMasteryItem] = Field(default_factory=list)
    overall_mastery_percent: float  # weighted average across all subjects

    # Recent activity (last 7 UserLearningMemory records)
    recent_activity: List[RecentActivityItem] = Field(default_factory=list)

    # Concept gaps summary
    top_concept_gaps: List[str] = Field(default_factory=list)  # top 5 by miss_count


# ── Weekly Learning Report schemas ──────────────────────────────────────────

class WeeklyLearningReportOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    week_start: datetime
    week_end: datetime

    # Stats
    total_study_time_seconds: int
    lessons_completed: int
    quizzes_completed: int
    avg_quiz_score: float
    highest_quiz_score: float
    streak_days: int

    # Lists
    topics_completed: List[str] = Field(default_factory=list)
    topics_needing_revision: List[str] = Field(default_factory=list)
    most_improved_concepts: List[str] = Field(default_factory=list)
    weak_concepts: List[str] = Field(default_factory=list)
    recommended_next_topics: List[str] = Field(default_factory=list)

    # Narrative
    ai_summary: str
    career_goal: Optional[str] = None
    is_ai_generated: bool

    generated_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


# ── Socratic Discussion schemas ──────────────────────────────────────────────

class SocraticMessageOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    sender: str          # "reva" | "user"
    content: str
    discussion_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class SocraticRespondIn(BaseModel):
    student_text: str = Field(..., min_length=1, max_length=2000,
                               description="Student's response in the Socratic discussion")


class SocraticRespondOut(BaseModel):
    message: SocraticMessageOut
    is_concluded: bool
    understanding_level: Optional[str] = None  # "strong" | "adequate" | "developing" | "needs_review"


class SocraticStatusOut(BaseModel):
    session_id: uuid.UUID
    is_concluded: bool
    understanding_level: Optional[str] = None
    exchange_count: int
    messages: List[SocraticMessageOut] = Field(default_factory=list)
