import uuid
from typing import List, Tuple, NamedTuple
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.post import Post
from src.models.user import User
from src.models.comment import Comment
from src.models.tag import Tag, post_tags
from src.repositories.tag_repository import associate_tags_for_post


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
    content: str,
    university_id: uuid.UUID | None = None
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

    if university_id:
        await associate_tags_for_post(db, new_id, university_id, [title, content])

    await db.commit()
    return new_id


async def create_thread(
    db: AsyncSession,
    community_id: uuid.UUID,
    author_id: uuid.UUID,
    title: str,
    parts: List[str],
    university_id: uuid.UUID | None = None
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
        post_title = title if idx == 1 else f"{title} (Part {idx})"
        post = Post(
            id=post_id,
            community_id=community_id,
            author_id=author_id,
            title=post_title,
            content=part_content.strip(),
            thread_id=first_post_id,
            thread_position=idx,
        )
        posts_to_create.append(post)
        created_ids.append(post_id)

    db.add_all(posts_to_create)
    await db.flush()

    if university_id:
        for p in posts_to_create:
            await associate_tags_for_post(db, p.id, university_id, [p.title, p.content])

    await db.commit()
    return created_ids


async def get_posts(
    db: AsyncSession,
    community_id: uuid.UUID,
    sort: str = "new",
    page: int = 1,
    size: int = 20,
    tag: str | None = None
) -> Tuple[List[EnrichedPost], int]:
    """
    Retrieve a paginated list of active posts in the specified community.
    Threaded posts appear ONCE in the feed, representing part 1.
    Supports optional filtering by tag name.
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

    if tag:
        tag_norm = tag.strip().lower().lstrip("#")
        base_query = (
            base_query
            .join(post_tags, post_tags.c.post_id == Post.id)
            .join(Tag, Tag.id == post_tags.c.tag_id)
            .where(Tag.name == tag_norm)
        )
        count_stmt = (
            count_stmt
            .join(post_tags, post_tags.c.post_id == Post.id)
            .join(Tag, Tag.id == post_tags.c.tag_id)
            .where(Tag.name == tag_norm)
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


async def get_user_posts(
    db: AsyncSession,
    author_id: uuid.UUID,
    page: int = 1,
    size: int = 20
) -> Tuple[List[EnrichedPost], int]:
    """
    Retrieve a paginated list of active posts created by a specific user.
    Threaded posts appear ONCE in the list, representing part 1 (root post).
    Excludes soft-deleted posts.
    """
    from sqlalchemy import or_

    if page < 1:
        page = 1
    if size < 1:
        size = 20

    comment_count_col = _comment_count_subquery(Post.id)
    thread_total_col = _thread_total_parts_subquery(Post.thread_id)

    base_query = (
        select(
            Post,
            User.username.label("author_username"),
            comment_count_col.label("comment_count"),
            func.coalesce(thread_total_col, 1).label("thread_total_parts")
        )
        .join(User, User.id == Post.author_id)
        .where(
            Post.author_id == author_id,
            Post.is_deleted == False,
            or_(Post.thread_position == 1, Post.thread_position.is_(None))
        )
    )

    count_stmt = select(func.count(Post.id)).where(
        Post.author_id == author_id,
        Post.is_deleted == False,
        or_(Post.thread_position == 1, Post.thread_position.is_(None))
    )
    count_result = await db.execute(count_stmt)
    total_count = count_result.scalar_one() or 0

    query = base_query.order_by(Post.created_at.desc()).offset((page - 1) * size).limit(size)

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


async def search_posts(
    db: AsyncSession,
    community_id: uuid.UUID,
    query_str: str,
    page: int = 1,
    size: int = 20
) -> Tuple[List[EnrichedPost], int]:
    """
    Search active posts in a community by title/content using Postgres full-text search.
    Results are ranked by relevance (ts_rank). Threaded posts appear ONCE (part 1).
    Excludes soft-deleted posts.
    """
    from sqlalchemy import or_

    if page < 1:
        page = 1
    if size < 1:
        size = 20

    ts_query = func.websearch_to_tsquery('english', query_str.strip())
    rank_expr = func.ts_rank(Post.search_vector, ts_query)

    comment_count_col = _comment_count_subquery(Post.id)
    thread_total_col = _thread_total_parts_subquery(Post.thread_id)

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
            Post.search_vector.op("@@")(ts_query),
            or_(Post.thread_position == 1, Post.thread_position.is_(None))
        )
    )

    count_stmt = select(func.count(Post.id)).where(
        Post.community_id == community_id,
        Post.is_deleted == False,
        Post.search_vector.op("@@")(ts_query),
        or_(Post.thread_position == 1, Post.thread_position.is_(None))
    )
    count_result = await db.execute(count_stmt)
    total_count = count_result.scalar_one() or 0

    query = base_query.order_by(rank_expr.desc(), Post.created_at.desc()).offset((page - 1) * size).limit(size)

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


async def toggle_bookmark(
    db: AsyncSession,
    user_id: uuid.UUID,
    post_id: uuid.UUID
) -> bool:
    """
    Toggles bookmark status for a post by a user.
    Returns True if bookmarked, False if unbookmarked.
    """
    from src.models.bookmark import Bookmark

    stmt = select(Bookmark).where(Bookmark.user_id == user_id, Bookmark.post_id == post_id)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.flush()
        await db.commit()
        return False
    else:
        new_bm = Bookmark(user_id=user_id, post_id=post_id)
        db.add(new_bm)
        await db.flush()
        await db.commit()
        return True


async def get_saved_posts(
    db: AsyncSession,
    user_id: uuid.UUID,
    page: int = 1,
    size: int = 20
) -> Tuple[List[EnrichedPost], int]:
    """
    Retrieve paginated list of active posts bookmarked by user.
    """
    from sqlalchemy import or_
    from src.models.bookmark import Bookmark

    if page < 1:
        page = 1
    if size < 1:
        size = 20

    comment_count_col = _comment_count_subquery(Post.id)
    thread_total_col = _thread_total_parts_subquery(Post.thread_id)

    base_query = (
        select(
            Post,
            User.username.label("author_username"),
            comment_count_col.label("comment_count"),
            func.coalesce(thread_total_col, 1).label("thread_total_parts")
        )
        .join(Bookmark, Bookmark.post_id == Post.id)
        .join(User, User.id == Post.author_id)
        .where(
            Bookmark.user_id == user_id,
            Post.is_deleted == False,
            or_(Post.thread_position == 1, Post.thread_position.is_(None))
        )
    )

    count_stmt = select(func.count(Post.id)).join(Bookmark, Bookmark.post_id == Post.id).where(
        Bookmark.user_id == user_id,
        Post.is_deleted == False,
        or_(Post.thread_position == 1, Post.thread_position.is_(None))
    )
    count_res = await db.execute(count_stmt)
    total_count = count_res.scalar_one() or 0

    query = base_query.order_by(Bookmark.created_at.desc()).offset((page - 1) * size).limit(size)

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


async def get_for_you_feed(
    db: AsyncSession,
    user_id: uuid.UUID,
    university_id: uuid.UUID,
    page: int = 1,
    size: int = 20
) -> Tuple[List[EnrichedPost], int]:
    """
    Personalized "For You" feed for a specific user:
    - Calculates user's own activity (votes, comments, posts) in the last 30 days.
    - Identifies top communities the user interacted with.
    - Ranks posts in the caller's university matching these preferred communities higher.
    - Recency-sorted within affinity levels.
    - Fallback: If zero engagement history, returns recency-sorted posts across user's university.
    - CONSTRAINED: Never factors in OTHER users' global scores or popularity.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import or_, case
    from src.models.community import Community
    from src.models.vote import Vote
    from src.models.tag import Tag, post_tags

    if page < 1:
        page = 1
    if size < 1:
        size = 20

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    # 1. Compute user's community interactions in last 30 days
    # A. Votes by user
    vote_stmt = (
        select(Post.community_id, func.count(Vote.id))
        .join(Post, Vote.post_id == Post.id)
        .where(Vote.user_id == user_id, Vote.created_at >= cutoff)
        .group_by(Post.community_id)
    )
    vote_res = await db.execute(vote_stmt)
    vote_counts = {row[0]: row[1] for row in vote_res.all()}

    # B. Comments by user
    comment_stmt = (
        select(Post.community_id, func.count(Comment.id))
        .join(Post, Comment.post_id == Post.id)
        .where(Comment.author_id == user_id, Comment.created_at >= cutoff)
        .group_by(Post.community_id)
    )
    comment_res = await db.execute(comment_stmt)
    comment_counts = {row[0]: row[1] for row in comment_res.all()}

    # C. Posts created by user
    post_stmt = (
        select(Post.community_id, func.count(Post.id))
        .where(Post.author_id == user_id, Post.created_at >= cutoff)
        .group_by(Post.community_id)
    )
    post_res = await db.execute(post_stmt)
    post_counts = {row[0]: row[1] for row in post_res.all()}

    # Combine community scores (Votes: 1x, Comments: 2x, Posts: 3x)
    all_community_ids = set(vote_counts.keys()) | set(comment_counts.keys()) | set(post_counts.keys())
    community_scores = {}
    for cid in all_community_ids:
        score = (vote_counts.get(cid, 0) * 1) + (comment_counts.get(cid, 0) * 2) + (post_counts.get(cid, 0) * 3)
        if score > 0:
            community_scores[cid] = score

    # Base query for all active posts in caller's university
    comment_count_col = _comment_count_subquery(Post.id)
    thread_total_col = _thread_total_parts_subquery(Post.thread_id)

    base_query = (
        select(
            Post,
            User.username.label("author_username"),
            comment_count_col.label("comment_count"),
            func.coalesce(thread_total_col, 1).label("thread_total_parts")
        )
        .join(User, User.id == Post.author_id)
        .join(Community, Community.id == Post.community_id)
        .where(
            Community.university_id == university_id,
            Post.is_deleted == False,
            or_(Post.thread_position == 1, Post.thread_position.is_(None))
        )
    )

    count_stmt = (
        select(func.count(Post.id))
        .join(Community, Community.id == Post.community_id)
        .where(
            Community.university_id == university_id,
            Post.is_deleted == False,
            or_(Post.thread_position == 1, Post.thread_position.is_(None))
        )
    )

    count_res = await db.execute(count_stmt)
    total_count = count_res.scalar_one() or 0

    # If user has NO engagement history at all, fallback to pure recency feed
    if not community_scores:
        query = base_query.order_by(Post.created_at.desc()).offset((page - 1) * size).limit(size)
        res = await db.execute(query)
        rows = res.all()
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

    # Build CASE expression for community affinity score
    community_case_w = []
    for cid, weight in community_scores.items():
        community_case_w.append((Post.community_id == cid, weight))

    community_affinity = case(*community_case_w, else_=0)

    # Order by user's personal community affinity DESC, then recency DESC
    query = (
        base_query
        .order_by(community_affinity.desc(), Post.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )

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
