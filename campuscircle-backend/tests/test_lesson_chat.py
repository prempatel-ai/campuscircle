import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete

from src.models.university import University
from src.models.user import User
from src.models.learning_session import LearningSession
from src.models.lesson_chat_message import LessonChatMessage
from src.auth.security import create_access_token


@pytest_asyncio.fixture
async def setup_test_users(db_session: AsyncSession):
    uni = University(
        id=uuid.uuid4(),
        name="Chat Test University",
        email_domain=f"chat-{uuid.uuid4().hex[:6]}.edu"
    )
    db_session.add(uni)
    await db_session.commit()

    user1 = User(
        username=f"student1_{uuid.uuid4().hex[:6]}",
        email=f"student1_{uuid.uuid4().hex[:6]}@chat.edu",
        password_hash="hashed_pw",
        university_id=uni.id,
        email_verified=True,
        role="student"
    )
    user2 = User(
        username=f"student2_{uuid.uuid4().hex[:6]}",
        email=f"student2_{uuid.uuid4().hex[:6]}@chat.edu",
        password_hash="hashed_pw",
        university_id=uni.id,
        email_verified=True,
        role="student"
    )
    db_session.add_all([user1, user2])
    await db_session.commit()

    token1 = create_access_token(
        user_id=user1.id,
        university_id=user1.university_id,
        role=user1.role,
        username=user1.username
    )
    token2 = create_access_token(
        user_id=user2.id,
        university_id=user2.university_id,
        role=user2.role,
        username=user2.username
    )

    session1 = LearningSession(
        user_id=user1.id,
        video_id="py101",
        youtube_url="https://youtube.com/watch?v=py101",
        video_title="Python Data Structures Crash Course",
        transcript="Python lists, tuples, and dicts...",
        explanation_chunks={"chunks": [{"title": "Lists", "content": "Lists are mutable sequences."}]},
        language="en"
    )
    session2 = LearningSession(
        user_id=user2.id,
        video_id="js101",
        youtube_url="https://youtube.com/watch?v=js101",
        video_title="JavaScript Async/Await",
        transcript="Promises and async await...",
        explanation_chunks={"chunks": [{"title": "Promises", "content": "Promises handle async operations."}]},
        language="en"
    )
    db_session.add_all([session1, session2])
    await db_session.commit()

    yield (user1, token1, session1), (user2, token2, session2)

    await db_session.execute(delete(LessonChatMessage).where(LessonChatMessage.session_id.in_([session1.id, session2.id])))
    await db_session.execute(delete(LearningSession).where(LearningSession.id.in_([session1.id, session2.id])))
    await db_session.execute(delete(User).where(User.id.in_([user1.id, user2.id])))
    await db_session.execute(delete(University).where(University.id == uni.id))


@pytest.mark.asyncio
async def test_get_lesson_chat_history_empty(client: AsyncClient, setup_test_users):
    (user1, token1, session1), _ = setup_test_users
    headers = {"Authorization": f"Bearer {token1}"}

    res = await client.get(f"/api/v1/learn/{session1.id}/chat/messages", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) == 0


@pytest.mark.asyncio
async def test_send_lesson_chat_followup(client: AsyncClient, setup_test_users):
    (user1, token1, session1), _ = setup_test_users
    headers = {"Authorization": f"Bearer {token1}"}

    # 1. Send follow-up question
    res = await client.post(
        f"/api/v1/learn/{session1.id}/chat/messages",
        json={"message": "Can you give a Python code example for lists vs tuples?"},
        headers=headers
    )
    assert res.status_code == 200
    reva_msg = res.json()
    assert reva_msg["sender"] == "reva"
    assert "content" in reva_msg

    # 2. Fetch history -> should contain user question + reva answer
    res_hist = await client.get(f"/api/v1/learn/{session1.id}/chat/messages", headers=headers)
    assert res_hist.status_code == 200
    hist = res_hist.json()
    assert len(hist) == 2
    assert hist[0]["sender"] == "user"
    assert hist[0]["content"] == "Can you give a Python code example for lists vs tuples?"
    assert hist[1]["sender"] == "reva"


@pytest.mark.asyncio
async def test_lesson_chat_unauthorized_access(client: AsyncClient, setup_test_users):
    (user1, token1, session1), (user2, token2, session2) = setup_test_users
    headers2 = {"Authorization": f"Bearer {token2}"}

    # User 2 tries to access user 1's lesson chat history -> should fail with 404
    res = await client.get(f"/api/v1/learn/{session1.id}/chat/messages", headers=headers2)
    assert res.status_code == 404

    # User 2 tries to post to user 1's lesson chat -> should fail with 404
    res_post = await client.post(
        f"/api/v1/learn/{session1.id}/chat/messages",
        json={"message": "Hack session"},
        headers=headers2
    )
    assert res_post.status_code == 404
