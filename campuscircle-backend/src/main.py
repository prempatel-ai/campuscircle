"""
Application entrypoint. Phase 1 goal: app boots, /health returns 200.
Everything else (auth, communities, posts...) gets wired in as its own
router in later phases, kept out of this file to avoid it becoming a
dumping ground.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.api.auth import router as auth_router
from src.api.communities import router as communities_router
from src.api.posts import router as posts_router, posts_router as posts_detail_router
from src.api.votes import router as votes_router
from src.api.users import router as users_router
from src.api.notifications import router as notifications_router
from src.api.universities import router as universities_router

app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:\d+|http://127\.0\.0\.1:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wire the authentication endpoints
app.include_router(auth_router, prefix="/api/v1")
# Wire the universities endpoints
app.include_router(universities_router, prefix="/api/v1")
# Wire the communities endpoints
app.include_router(communities_router, prefix="/api/v1")
# Wire the posts endpoints
app.include_router(posts_router, prefix="/api/v1")
# Wire the posts detail/comments endpoints
app.include_router(posts_detail_router, prefix="/api/v1")
# Wire the votes endpoints
app.include_router(votes_router, prefix="/api/v1")
# Wire the users endpoints
app.include_router(users_router, prefix="/api/v1")
# Wire the notifications endpoints
app.include_router(notifications_router, prefix="/api/v1")


@app.get("/health", tags=["system"])
async def health_check():
    """
    Liveness/readiness check. Hosting platforms (Railway/Render/Fly)
    and load balancers hit this to know if an instance is healthy.
    Phase 1: just confirms the app process is up.
    Later: will also confirm DB connectivity.
    """
    return {"status": "ok", "environment": settings.environment}


@app.get("/", tags=["system"])
async def root():
    return {"message": f"{settings.app_name} is running"}
