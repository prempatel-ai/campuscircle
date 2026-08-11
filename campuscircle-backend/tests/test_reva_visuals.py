import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from src.services.reva_service import (
    normalize_chat_query,
    evaluate_and_generate_chat_visual,
    check_and_increment_visual_rate_limit,
)


def test_normalize_chat_query():
    q1 = "Explain Newton's Second Law!!!"
    q2 = "explain newtons second law"
    assert normalize_chat_query(q1) == normalize_chat_query(q2)


@pytest.mark.asyncio
async def test_non_stem_prompt_returns_no_visual():
    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_res

    result = await evaluate_and_generate_chat_visual(
        user_message="where is a good place to study on campus?",
        user_id=uuid.uuid4(),
        db=mock_db
    )
    assert result is None


@pytest.mark.asyncio
async def test_stem_prompt_generates_or_fetches_visual():
    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_res

    user_id = uuid.uuid4()
    result = await evaluate_and_generate_chat_visual(
        user_message="Explain Newton's second law with force and mass",
        user_id=user_id,
        db=mock_db
    )
    assert result is not None
    assert "visual_html" in result
    assert "<input" in result["visual_html"].lower()
    assert "<svg" in result["visual_html"].lower()


@pytest.mark.asyncio
async def test_reva_visual_caching():
    mock_db = AsyncMock()
    msg = "Explain Archimedes principle buoyancy"

    # Cached object mock
    cached_obj = MagicMock()
    cached_obj.title = "Archimedes Buoyancy Simulation"
    cached_obj.visual_html = "<html><body><input type='range'/><svg></svg></body></html>"

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = cached_obj
    mock_db.execute.return_value = mock_res

    res = await evaluate_and_generate_chat_visual(
        user_message=msg,
        user_id=uuid.uuid4(),
        db=mock_db
    )
    assert res is not None
    assert res["title"] == "Archimedes Buoyancy Simulation"
    assert res["visual_html"] == cached_obj.visual_html


@pytest.mark.asyncio
async def test_chat_visual_rate_limiting():
    mock_db = AsyncMock()
    user_id = uuid.uuid4()

    # Pre-filled 5 rate limit record mock
    record = MagicMock()
    record.count = 5

    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = record
    mock_db.execute.return_value = mock_res

    allowed = await check_and_increment_visual_rate_limit(mock_db, user_id)
    assert allowed is False
