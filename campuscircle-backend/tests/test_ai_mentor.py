import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete

from src.models.university import University
from src.models.user import User
from src.models.student_learning_profile import StudentLearningProfile
from src.models.learning_session import LearningSession
from src.models.user_learning_memory import UserLearningMemory
from src.auth.security import create_access_token
from src.services.ai_mentor_service import (
    generate_presession_mentor_guidance,
    generate_postsession_mentor_summary
)


@pytest_asyncio.fixture
async def setup_test_user(db_session: AsyncSession):
    uni = University(
        name="Mentor Test University",
        email_domain=f"mentor-{uuid.uuid4().hex[:6]}.edu"
    )
    db_session.add(uni)
    await db_session.commit()

    user = User(
        username=f"student_{uuid.uuid4().hex[:6]}",
        email=f"student_{uuid.uuid4().hex[:6]}@mentor.edu",
        password_hash="hashed_pw",
        university_id=uni.id,
        email_verified=True,
        role="student"
    )
    db_session.add(user)
    await db_session.commit()

    token = create_access_token(
        user_id=user.id,
        university_id=user.university_id,
        role=user.role,
        username=user.username
    )

    yield user, token

    await db_session.execute(delete(UserLearningMemory).where(UserLearningMemory.user_id == user.id))
    await db_session.execute(delete(StudentLearningProfile).where(StudentLearningProfile.user_id == user.id))
    await db_session.execute(delete(LearningSession).where(LearningSession.user_id == user.id))
    await db_session.execute(delete(User).where(User.id == user.id))
    await db_session.execute(delete(University).where(University.id == uni.id))


@pytest.mark.asyncio
async def test_presession_mentor_new_user_onboarding(
    client: AsyncClient,
    setup_test_user
):
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/v1/learn/me/mentor/pre-session", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert "Welcome" in data["greeting"]
    assert "Reva" in data["mentor_message"]
    assert data["streak_days"] == 0
    assert data["suggested_next_topic"] is not None


@pytest.mark.asyncio
async def test_presession_mentor_returning_user(
    db_session: AsyncSession,
    client: AsyncClient,
    setup_test_user
):
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}

    # Set up profile with career goal and 3 sessions
    profile = StudentLearningProfile(
        user_id=user.id,
        total_sessions=3,
        current_streak_days=2,
        career_goal="AI / Machine Learning",
        weak_concepts=["Dynamic Programming"]
    )
    db_session.add(profile)
    await db_session.commit()

    res = await client.get("/api/v1/learn/me/mentor/pre-session", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["streak_days"] == 2
    assert data["career_goal"] == "AI / Machine Learning"
    assert data["mentor_message"] is not None


@pytest.mark.asyncio
async def test_postsession_mentor_summary(
    db_session: AsyncSession,
    client: AsyncClient,
    setup_test_user
):
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}

    session = LearningSession(
        user_id=user.id,
        video_id="graph101",
        youtube_url="https://youtube.com/watch?v=graph101",
        video_title="Graph Traversal Algorithms (BFS & DFS)",
        transcript="Graphs consist of vertices and edges...",
        language="en",
        user_progress={"phase1_score": 100.0, "phase2_score": 80.0, "is_completed": True}
    )
    db_session.add(session)
    await db_session.commit()

    res = await client.post(f"/api/v1/learn/{session.id}/mentor/post-session", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert "summary_message" in data
    assert len(data["strengths"]) > 0
