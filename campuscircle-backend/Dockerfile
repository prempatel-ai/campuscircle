FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (separate layer = faster rebuilds when only code changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy migrations and config
COPY alembic.ini ./alembic.ini
COPY migrations ./migrations

# Copy application code
COPY src ./src

EXPOSE 8000

# Production startup command — runs migrations then starts uvicorn with $PORT
CMD ["sh", "-c", "alembic upgrade head && uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
