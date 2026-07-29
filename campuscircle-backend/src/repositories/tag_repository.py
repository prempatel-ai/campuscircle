import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Tuple
from sqlalchemy import select, func, insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.tag import Tag, post_tags
from src.models.post import Post

HASHTAG_REGEX = re.compile(r'#([A-Za-z0-9_]{1,30})')


def extract_hashtags(text: str) -> List[str]:
    """
    Parses #word patterns from text using regex.
    Matches alphanumeric characters + underscores up to 30 chars long.
    Returns deduplicated, lowercased tag names without the '#' symbol.
    """
    if not text:
        return []
    matches = HASHTAG_REGEX.findall(text)
    seen = set()
    result = []
    for m in matches:
        lowered = m.lower()
        if lowered not in seen:
            seen.add(lowered)
            result.append(lowered)
    return result


async def associate_tags_for_post(
    db: AsyncSession,
    post_id: uuid.UUID,
    university_id: uuid.UUID,
    texts: List[str]
) -> None:
    """
    Extracts hashtags from all provided text strings, creates or finds the university-scoped
    Tag entries, and links them to the post in post_tags.
    """
    tag_names = set()
    for text in texts:
        for tag in extract_hashtags(text):
            tag_names.add(tag)

    if not tag_names:
        return

    for tag_name in tag_names:
        # Check if tag exists for THIS university
        stmt = select(Tag).where(Tag.university_id == university_id, Tag.name == tag_name)
        res = await db.execute(stmt)
        tag_obj = res.scalar_one_or_none()

        if not tag_obj:
            tag_obj = Tag(
                id=uuid.uuid4(),
                university_id=university_id,
                name=tag_name
            )
            db.add(tag_obj)
            await db.flush()

        # Link post and tag in post_tags junction table
        ins_stmt = insert(post_tags).values(post_id=post_id, tag_id=tag_obj.id)
        await db.execute(ins_stmt)


async def get_trending_tags(
    db: AsyncSession,
    university_id: uuid.UUID,
    limit: int = 10,
    hours_window: int = 48
) -> List[Tuple[str, int]]:
    """
    Returns top N tags by post count within a rolling window (default 48h).
    Strictly isolated to the caller's university_id.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours_window)

    stmt = (
        select(
            Tag.name,
            func.count(post_tags.c.post_id).label("post_count")
        )
        .join(post_tags, post_tags.c.tag_id == Tag.id)
        .join(Post, Post.id == post_tags.c.post_id)
        .where(
            Tag.university_id == university_id,
            Post.is_deleted == False,
            Post.created_at >= cutoff
        )
        .group_by(Tag.id, Tag.name)
        .order_by(func.count(post_tags.c.post_id).desc(), Tag.name.asc())
        .limit(limit)
    )

    res = await db.execute(stmt)
    return [(row[0], row[1]) for row in res.all()]
