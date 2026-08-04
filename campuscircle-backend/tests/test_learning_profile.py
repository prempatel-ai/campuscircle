import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select

from src.models.university import University
from src.models.user import User
from src.models.student_learning_profile import StudentLearningProfile
from src.models.learning_session import LearningSession
from src.auth.security import create_access_token


@pytest_asyncio.fixture
async def setup_test_user(db_session: AsyncSession):
    uni = University(
        name="Profile Test University",
        email_domain=f"profile-{uuid.uuid4().hex[:6]}.edu"
    )
    db_session.add(uni)
    await db_session.commit()

    user = User(
        username=f"student_{uuid.uuid4().hex[:6]}",
        email=f"student_{uuid.uuid4().hex[:6]}@profile.edu",
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

    await db_session.execute(delete(StudentLearningProfile).where(StudentLearningProfile.user_id == user.id))
    await db_session.execute(delete(LearningSession).where(LearningSession.user_id == user.id))
    await db_session.execute(delete(User).where(User.id == user.id))
    await db_session.execute(delete(University).where(University.id == uni.id))


@pytest.mark.asyncio
async def test_get_initial_student_learning_profile(
    client: AsyncClient,
    setup_test_user
):
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/v1/learn/me/profile", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["user_id"] == str(user.id)
    assert data["total_sessions"] == 0
    assert data["topics_completed"] == 0
    assert data["topics_learning"] == 0
    assert data["avg_quiz_score"] == 0.0
    assert data["highest_quiz_score"] == 0.0
    assert data["total_quizzes_completed"] == 0
    assert data["preferred_language"] == "en"
    assert data["current_streak_days"] == 0
    assert data["extra_data"] == {}


@pytest.mark.asyncio
async def test_explanation_session_updates_profile_stats(
    client: AsyncClient,
    setup_test_user
):
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}

    # Request explanation for custom text
    explain_res = await client.post(
        "/api/v1/learn/explain",
        json={"youtube_url": "", "transcript": "Python programming language basics and syntax overview.", "language": "es"},
        headers=headers
    )
    assert explain_res.status_code == 200
    explain_data = explain_res.json()
    assert "session_id" in explain_data

    # Check updated profile
    profile_res = await client.get("/api/v1/learn/me/profile", headers=headers)
    assert profile_res.status_code == 200
    profile = profile_res.json()

    assert profile["total_sessions"] == 1
    assert profile["topics_learning"] == 1
    assert profile["preferred_language"] == "es"
    assert profile["current_streak_days"] == 1
    assert profile["last_learning_date"] is not None


@pytest.mark.asyncio
async def test_quiz_submission_updates_profile_quiz_scores(
    client: AsyncClient,
    setup_test_user
):
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create explanation session
    explain_res = await client.post(
        "/api/v1/learn/explain",
        json={"youtube_url": "", "transcript": "Data structures, arrays, linked lists, and tree traversals.", "language": "en"},
        headers=headers
    )
    session_id = explain_res.json()["session_id"]

    # 2. Generate quiz
    quiz_gen_res = await client.post(f"/api/v1/learn/{session_id}/quiz", headers=headers)
    assert quiz_gen_res.status_code == 200

    # 3. Submit Phase 1 answers
    phase1_questions = quiz_gen_res.json()["phase1"]["questions"]
    answers_p1 = {q["id"]: 0 for q in phase1_questions}  # Mock answers

    sub_p1_res = await client.post(
        f"/api/v1/learn/{session_id}/quiz/1/submit",
        json={"answers": answers_p1},
        headers=headers
    )
    assert sub_p1_res.status_code == 200
    p1_data = sub_p1_res.json()

    # Check updated profile stats
    profile_res = await client.get("/api/v1/learn/me/profile", headers=headers)
    assert profile_res.status_code == 200
    profile = profile_res.json()

    assert profile["total_quizzes_completed"] == 1
    assert profile["avg_quiz_score"] == p1_data["score_percent"]
    assert profile["highest_quiz_score"] == p1_data["score_percent"]
