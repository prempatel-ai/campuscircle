"""
Import every model here. Alembic's autogenerate feature works by
comparing src.database.Base.metadata against the real database — and
Base only knows about a model AFTER it's been imported somewhere.
This file is that "somewhere."
"""
from src.models.university import University
from src.models.user import User
from src.models.community import Community
from src.models.post import Post
from src.models.comment import Comment
from src.models.vote import Vote
from src.models.report import Report, AuditLog
from src.models.refresh_token import RefreshToken
from src.models.notification import Notification
from src.models.bookmark import Bookmark
from src.models.tag import Tag, post_tags
from src.models.learn import LearnExtractionLog
from src.models.learning_session import LearningSession
from src.models.conversation import Conversation
from src.models.chat_message import ChatMessage

__all__ = [
    "University",
    "User",
    "Community",
    "Post",
    "Comment",
    "Vote",
    "Report",
    "AuditLog",
    "RefreshToken",
    "Notification",
    "Bookmark",
    "Tag",
    "post_tags",
    "LearnExtractionLog",
    "LearningSession",
    "Conversation",
    "ChatMessage",
]
