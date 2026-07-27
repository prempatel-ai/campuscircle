"""
This file sets up HOW we connect to Postgres. Every other file that
needs to talk to the database imports from here — there is exactly
ONE engine and ONE session factory for the whole app.
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from src.config import settings

# The engine manages the actual pool of connections to Postgres.
# "echo=settings.debug" means: in dev, print every SQL query to the
# console so you can see exactly what SQLAlchemy is doing under the hood.
# This is genuinely useful while learning — watch your terminal logs
# once we start querying, you'll see the raw SQL fly by.
engine = create_async_engine(settings.database_url, echo=settings.debug)

# A session is one "conversation" with the database — you open one,
# do some work (queries/inserts), then close it. async_sessionmaker
# is a factory that hands out fresh sessions on demand.
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    """
    Every model (User, Post, Comment...) inherits from this.
    This is what lets Alembic and SQLAlchemy discover all your
    tables in one place.
    """
    pass


async def get_db():
    """
    FastAPI dependency — request handlers will use this to get a
    database session, and it's guaranteed to close properly even if
    the request fails halfway through. You'll see this used like:
        async def some_route(db: AsyncSession = Depends(get_db)):
    starting in Phase 3.
    """
    async with AsyncSessionLocal() as session:
        yield session
