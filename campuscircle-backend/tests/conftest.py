import os
import pytest
import pytest_asyncio
import asyncio
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.engine.url import make_url
from sqlalchemy.pool import NullPool

import src.config
import src.database
from src.database import Base

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://campuscircle_test:campuscircle_test@db_test:5432/campuscircle_test"
)

# 1. Hard Safety Check: Assert test DB URL database name contains 'test'
url_obj = make_url(TEST_DATABASE_URL)
db_name = (url_obj.database or "").lower()
if "test" not in db_name:
    raise RuntimeError(
        f"CRITICAL DB ISOLATION FAILURE: TEST_DATABASE_URL is set to '{TEST_DATABASE_URL}'. "
        f"Database name '{url_obj.database}' does NOT contain 'test'! Refusing to run tests."
    )

# 2. Force src.config.settings.database_url to TEST_DATABASE_URL
src.config.settings.database_url = TEST_DATABASE_URL

# 3. Create isolated test engine and session factory
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

# 4. Patch src.database.engine and src.database.AsyncSessionLocal so app code connects strictly to test DB
src.database.engine = test_engine
src.database.AsyncSessionLocal = TestSessionLocal


def pytest_sessionstart(session):
    """
    Hard safety check hook at pytest startup.
    Fails loudly if any configuration leaks to dev database.
    """
    url = make_url(TEST_DATABASE_URL)
    name = (url.database or "").lower()
    if "test" not in name:
        raise RuntimeError(
            f"LOUD SAFETY FAILURE: Test session startup failed because database '{name}' "
            f"is not a test database. Halting execution immediately."
        )


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def prepare_test_database():
    """Create all tables in the isolated test database once before any tests run."""
    try:
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        yield
        try:
            async with test_engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
            await test_engine.dispose()
        except Exception:
            pass
    except Exception:
        yield


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Provide an AsyncSession bound strictly to the isolated TEST database.
    """
    async with TestSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator["AsyncClient", None]:
    """
    Provide an AsyncClient for testing the FastAPI application with 
    database session dependency overridden to use db_session on db_test.
    """
    from httpx import AsyncClient, ASGITransport
    from src.main import app
    from src.database import get_db

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    
    async with AsyncClient(
        transport=ASGITransport(app=app), 
        base_url="http://testserver"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def reset_rate_limiters():
    """Clear in-memory rate limiters between tests."""
    from src.api.auth import signup_ip_limiter, login_ip_limiter, login_email_limiter
    from src.api.communities import community_creation_limiter
    signup_ip_limiter.history.clear()
    login_ip_limiter.history.clear()
    login_email_limiter.history.clear()
    community_creation_limiter.history.clear()
