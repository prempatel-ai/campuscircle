"""
Central configuration. Everything environment-specific lives here,
never hardcoded elsewhere in the codebase.
"""
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # App
    app_name: str = "CampusCircle API"
    environment: str = "development"  # development | staging | production
    debug: bool = True

    # Database
    database_url: str = "postgresql+asyncpg://campuscircle:campuscircle@db:5432/campuscircle"

    # Auth
    jwt_secret: str = "change-me-in-env-file"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    # Email Configuration (Supports Brevo API, SMTP, Resend)
    brevo_api_key: str = ""
    smtp_server: str = "smtp-relay.brevo.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    resend_api_key: str = ""
    from_email_address: str = ""
    frontend_url: str = "https://campuscircle-pdqa.vercel.app"

    # AI / Groq Learning API Configuration
    groq_api_key: str = ""
    groq_api_key_explanation: str = ""
    groq_api_key_quiz: str = ""
    groq_api_key_chat: str = ""
    groq_api_keys_pool: str = ""  # Comma-separated list of keys from multiple accounts for round-robin rotation
    groq_model: str = "llama-3.3-70b-versatile"

    # YouTube Transcript Proxy (Supadata — free 100 req/month, bypasses cloud IP blocks)
    supadata_api_key: str = ""

    # Reva AI Agent Configuration (Separate env key for Grok-like platform bot & chatbot)
    reva_groq_api_key: str = ""
    reva_groq_model: str = "llama-3.3-70b-versatile"

    # CORS configuration
    cors_allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def parsed_cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]

    @model_validator(mode="after")
    def rewrite_database_url_and_validate_production(self) -> "Settings":
        # Automatically rewrite Render's postgresql:// or postgres:// scheme to postgresql+asyncpg://
        if self.database_url:
            if self.database_url.startswith("postgres://"):
                self.database_url = self.database_url.replace("postgres://", "postgresql+asyncpg://", 1)
            elif self.database_url.startswith("postgresql://") and not self.database_url.startswith("postgresql+asyncpg://"):
                self.database_url = self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

            # Automatically convert Render internal hostname (dpg-xxxx-a) to external hostname
            # (dpg-xxxx-a.oregon-postgres.render.com) when running on local PC outside Render
            import os, re
            if "@dpg-" in self.database_url and ".render.com" not in self.database_url and not os.environ.get("RENDER"):
                self.database_url = re.sub(
                    r'(@dpg-[a-z0-9]+-[a-z0-9]+)([:/])',
                    r'\1.oregon-postgres.render.com\2',
                    self.database_url
                )

        if self.environment.lower() == "production":
            if self.jwt_secret == "change-me-in-env-file":
                raise ValueError("JWT_SECRET must be set to a secure random string in production environment.")
            if self.debug:
                raise ValueError("debug must be set to False in production environment.")
        return self

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


import itertools
from typing import Optional

# Single shared settings instance, imported everywhere else
settings = Settings()

_pool_cycle: Optional[itertools.cycle] = None


def get_groq_api_key(feature: str = "explanation") -> str:
    """
    Returns the appropriate Groq API key for a given feature.
    1. Checks feature-specific env var (groq_api_key_explanation, groq_api_key_quiz, groq_api_key_chat).
    2. If groq_api_keys_pool is configured, cycles round-robin across multiple accounts.
    3. Falls back to default groq_api_key or reva_groq_api_key.
    """
    global _pool_cycle

    # 1. Feature-specific env key
    if feature == "explanation" and settings.groq_api_key_explanation:
        return settings.groq_api_key_explanation
    if feature == "quiz" and settings.groq_api_key_quiz:
        return settings.groq_api_key_quiz
    if feature == "chat" and settings.groq_api_key_chat:
        return settings.groq_api_key_chat

    # 2. Round-robin key pool if provided
    if settings.groq_api_keys_pool:
        keys = [k.strip() for k in settings.groq_api_keys_pool.split(",") if k.strip()]
        if keys:
            if _pool_cycle is None:
                _pool_cycle = itertools.cycle(keys)
            return next(_pool_cycle)

    # 3. Fallback to general keys
    if feature == "chat" and settings.reva_groq_api_key:
        return settings.reva_groq_api_key

    return settings.groq_api_key or settings.reva_groq_api_key
