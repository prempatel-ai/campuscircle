import uuid
from typing import List, Tuple, NamedTuple
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.post import Post
from src.models.user import User
from src.models.comment import Comment


class EnrichedPost(NamedTuple):
    """
    Result row returned by the enriched query.

    Contains the ORM Post, the joined author_username string, the
    correlated comment_count integer, and thread_total_parts count.
    """
    post: Post
    author_username: str
    comment_count: int
    thread_total_parts: int = 1


def _comment_count_subquery(post_id_col):
    """
    Correlated sub-select that counts non-deleted comments for a given post.
    Used in both the list query and the single-post query so the logic
    lives in exactly one place.
    """
    return (
        select(func.count(Comment.id))
        .where(Comment.post_id == post_id_col, Comment.is_deleted == False)
        .correlate_except(Comment)
        .scalar_subquery()
    )


def _thread_total_parts_subquery(thread_id_col):
    """
    Correlated sub-select that counts active posts sharing thread_id.
    Returns 1 for non-threaded posts (where thread_id is NULL).
    """
    subquery = (
        select(func.count(Post.id))
        .where(
            Post.thread_id == thread_id_col,
            Post.thread_id.is_not(None),
            Post.is_deleted == False
        )
        .correlate_except(Post)
        .scalar_subquery()
    )
    return case(
        (thread_id_col.is_(None), 1),
        else_=subquery
    )


async def create_post(
    db: AsyncSession,
    community_id: uuid.UUID,
    author_id: uuid.UUID,
    title: str,
    content: str
) -> uuid.UUID:
    """
    Create a new post in the specified community.
    Returns the UUID of the new post so the caller can immediately
    fetch the enriched version via get_post_by_id.
    """
    post = Post(
        community_id=community_id,
        author_id=author_id,
        title=title,
        content=content
    )
    db.add(post)
    await db.flush()
    new_id = post.id          # capture before commit expires the object
    await db.commit()
    return new_id


async def create_thread(
    db: AsyncSession,
    community_id: uuid.UUID,
    author_id: uuid.UUID,
    title: str,
    parts: List[str]
) -> List[uuid.UUID]:
    """
    Creates a multi-part thread of posts atomically in ONE transaction.
    Returns the list of created post UUIDs in order.
    """
    if len(parts) < 2 or len(parts) > 25:
        raise ValueError("Thread length must be between 2 and 25 parts.")

    for i, p in enumerate(parts):
        if not p or len(p.strip()) < 3:
            raise ValueError(f"Thread part {i + 1} must be at least 3 characters long.")

    first_post_id = uuid.uuid4()
    created_ids = []
    posts_to_create = []

    for idx, part_content in enumerate(parts, start=1):
        post_id = first_post_id if idx == 1 else uuid.uuid4()
        post = Post(
            id=post_id,
            community_id=community_id,
            author_id=author_id,
            title=title if idx == 1 else f"{title} (Part {idx})",
            content=part_content.strip(),
            thread_id=first_post_id,
            thread_position=idx,
        )
        posts_to_create.append(post)
        created_ids.append(post_id)

    db.add_all(posts_to_create)
    await db.flush()
    await db.commit()
    return created_ids


async def get_posts(
    db: AsyncSession,
    community_id: uuid.UUID,
    sort: str = "new",
    page: int = 1,
    size: int = 20
) -> Tuple[List[EnrichedPost], int]:
    """
    Retrieve a paginated list of active posts in the specified community.
    Threaded posts appear ONCE in the feed, representing part 1.
    """
    from sqlalchemy import or_

    if page < 1:
        page = 1
    if size < 1:
        size = 20

    comment_count_col = _comment_count_subquery(Post.id)
    thread_total_col = _thread_total_parts_subquery(Post.thread_id)

    # Base SELECT — Post columns + username + comment_count + thread_total_parts
    base_query = (
        select(
            Post,
            User.username.label("author_username"),
            comment_count_col.label("comment_count"),
            func.coalesce(thread_total_col, 1).label("thread_total_parts")
        )
        .join(User, User.id == Post.author_id)
        .where(
            Post.community_id == community_id,
            Post.is_deleted == False,
            or_(Post.thread_position == 1, Post.thread_position.is_(None))
        )
    )

    # Total count for feed pagination (excludes parts 2+)
    count_stmt = select(func.count(Post.id)).where(
        Post.community_id == community_id,
        Post.is_deleted == False,
        or_(Post.thread_position == 1, Post.thread_position.is_(None))
    )
    count_result = await db.execute(count_stmt)
    total_count = count_result.scalar_one() or 0

    # Apply sort
    if sort == "top":
        query = base_query.order_by(Post.score.desc(), Post.created_at.desc())
    elif sort == "hot":
        hot_expr = Post.score + func.extract("epoch", Post.created_at) / 45000.0
        query = base_query.order_by(hot_expr.desc())
    else:  # 'new'
        query = base_query.order_by(Post.created_at.desc())

    # Paginate
    query = query.offset((page - 1) * size).limit(size)

    result = await db.execute(query)
    rows = result.all()

    enriched = [
        EnrichedPost(
            post=row[0],
            author_username=row[1],
            comment_count=row[2],
            thread_total_parts=row[3] or 1
        )
        for row in rows
    ]

    return enriched, total_count


async def get_post_by_id(
    db: AsyncSession,
    post_id: uuid.UUID
) -> EnrichedPost | None:
    """
    Fetch a single non-deleted post enriched with author_username, comment_count,
    and thread_total_parts. Returns None if the post does not exist or is soft-deleted.
    """
    comment_count_col = _comment_count_subquery(Post.id)
    thread_total_col = _thread_total_parts_subquery(Post.thread_id)

    stmt = (
        select(
            Post,
            User.username.label("author_username"),
            comment_count_col.label("comment_count"),
            func.coalesce(thread_total_col, 1).label("thread_total_parts")
        )
        .join(User, User.id == Post.author_id)
        .where(Post.id == post_id, Post.is_deleted == False)
    )

    result = await db.execute(stmt)
    row = result.one_or_none()

    if row is None:
        return None

    return EnrichedPost(
        post=row[0],
        author_username=row[1],
        comment_count=row[2],
        thread_total_parts=row[3] or 1
    )


async def get_thread_posts(
    db: AsyncSession,
    post_id: uuid.UUID
) -> List[EnrichedPost]:
    """
    Returns all parts of that post's thread in position order (thread_position ASC).
    If the post is standalone (thread_id is None), returns an empty list [].
    """
    target_stmt = select(Post.thread_id).where(Post.id == post_id, Post.is_deleted == False)
    target_result = await db.execute(target_stmt)
    thread_id = target_result.scalar_one_or_none()

    if not thread_id:
        return []

    comment_count_col = _comment_count_subquery(Post.id)
    thread_total_col = _thread_total_parts_subquery(Post.thread_id)

    stmt = (
        select(
            Post,
            User.username.label("author_username"),
            comment_count_col.label("comment_count"),
            func.coalesce(thread_total_col, 1).label("thread_total_parts")
        )
        .join(User, User.id == Post.author_id)
        .where(Post.thread_id == thread_id, Post.is_deleted == False)
        .order_by(Post.thread_position.asc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    return [
        EnrichedPost(
            post=row[0],
            author_username=row[1],
            comment_count=row[2],
            thread_total_parts=row[3] or 1
        )
        for row in rows
    ]
