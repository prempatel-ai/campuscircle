import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select

from src.models.university import University
from src.models.user import User
from src.models.learning_session import LearningSession
from src.models.user_learning_memory import UserLearningMemory
from src.auth.security import create_access_token
from src.services.learning_memory_service import (
    create_or_update_memory_from_session,
    get_relevant_memories_for_topic
)


@pytest_asyncio.fixture
async def setup_test_user(db_session: AsyncSession):
    uni = University(
        name="Memory Test University",
        email_domain=f"memory-{uuid.uuid4().hex[:6]}.edu"
    )
    db_session.add(uni)
    await db_session.commit()

    user = User(
        username=f"student_{uuid.uuid4().hex[:6]}",
        email=f"student_{uuid.uuid4().hex[:6]}@memory.edu",
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
    await db_session.execute(delete(LearningSession).where(LearningSession.user_id == user.id))
    await db_session.execute(delete(User).where(User.id == user.id))
    await db_session.execute(delete(University).where(University.id == uni.id))


@pytest.mark.asyncio
async def test_memory_creation_from_session(
    db_session: AsyncSession,
    setup_test_user
):
    user, _ = setup_test_user

    session = LearningSession(
        user_id=user.id,
        video_id="arr123",
        youtube_url="https://youtube.com/watch?v=arr123",
        video_title="Arrays and Dynamic Arrays Data Structure",
        transcript="Arrays store elements in contiguous memory locations...",
        language="en",
        explanation_chunks={"chunks": [{"title": "Contiguous Memory & Indexing", "explanation": "..."}]},
        user_progress={"phase1_score": 90.0, "phase2_score": 95.0, "is_completed": True}
    )
    db_session.add(session)
    await db_session.commit()

    memory = await create_or_update_memory_from_session(db_session, session)
    assert memory is not None
    assert memory.topic_title == "Arrays and Dynamic Arrays Data Structure"
    assert memory.mastery_level == "Mastered"
    assert "Contiguous Memory & Indexing" in memory.key_concepts


@pytest.mark.asyncio
async def test_relevant_memories_retrieval(
    db_session: AsyncSession,
    setup_test_user
):
    user, _ = setup_test_user

    # Create memory 1: Arrays
    mem1 = UserLearningMemory(
        user_id=user.id,
        topic_title="Arrays and Contiguous Memory",
        subject_category="Computer Science",
        mastery_level="Mastered",
        key_concepts=["Array indexing", "Memory allocation"],
        quiz_score=90.0
    )
    # Create memory 2: Quantum Physics (Unrelated)
    mem2 = UserLearningMemory(
        user_id=user.id,
        topic_title="Quantum Physics and Entanglement",
        subject_category="Physics",
        mastery_level="Novice",
        key_concepts=["Photons", "Spin states"],
        quiz_score=40.0
    )
    db_session.add_all([mem1, mem2])
    await db_session.commit()

    # Query relevant memories for a new topic: "Binary Trees and Dynamic Arrays"
    relevant = await get_relevant_memories_for_topic(
        db=db_session,
        user_id=user.id,
        current_topic_title="Binary Trees and Dynamic Arrays",
        limit=3
    )

    assert len(relevant) == 1
    assert "Arrays and Contiguous Memory" in relevant[0]
    assert "Quantum Physics" not in relevant[0]


@pytest.mark.asyncio
async def test_explanation_endpoint_with_learning_memory(
    client: AsyncClient,
    setup_test_user
):
    user, token = setup_test_user
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create first session (Arrays)
    res1 = await client.post(
        "/api/v1/learn/explain",
        json={"youtube_url": "", "transcript": "Arrays hold elements in sequential memory.", "language": "en"},
        headers=headers
    )
    assert res1.status_code == 200

    # 2. Create second session (Binary Trees)
    res2 = await client.post(
        "/api/v1/learn/explain",
        json={"youtube_url": "", "transcript": "Binary trees consist of nodes with left and right child pointers.", "language": "en"},
        headers=headers
    )
    assert res2.status_code == 200
    assert "session_id" in res2.json()
