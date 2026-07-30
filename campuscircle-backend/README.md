# CampusCircle Backend API

Production-grade FastAPI backend service powering CampusCircle. Includes university domain isolation, JWT authentication, post threads, voting logic, Groq LLM integration, YouTube transcript proxy processing, and the Reva AI platform agent.

---

## Technical Stack

- **Framework**: FastAPI (Python 3.11, AsyncIO)
- **Database ORM**: SQLAlchemy 2.0 (AsyncPG driver)
- **Database Migrations**: Alembic
- **AI Core**: Groq Cloud API (`llama-3.3-70b-versatile`)
- **YouTube Proxy**: Supadata API
- **Containerization**: Docker & Docker Compose

---

## Project Structure

```
src/
|-- api/                   # REST API routes (auth, posts, learn, reva, users, feed)
|-- auth/                  # JWT security, password hashing, dependency injection
|-- models/                # SQLAlchemy database models
|-- repositories/          # Async DB queries & repository pattern logic
|-- schemas/               # Pydantic request & response models
|-- services/              # External service integrations (Groq LLM, Reva AI, Supadata)
|-- config.py              # Central environment settings validator
+-- main.py                # FastAPI app entrypoint & middleware configuration
migrations/                # Alembic schema migration trajectories
```

---

## Setup & Local Execution

### 1. Configure Environment Variables
Copy `.env.example` to `.env` and fill in required values:

```bash
cp .env.example .env
```

### 2. Run with Docker Compose

```bash
docker compose up --build
```

### 3. Run Database Migrations

```bash
docker compose exec api alembic upgrade head
```

---

## API Health Check

- Health Check: `GET /health` -> `{"status":"ok","environment":"development"}`
- Swagger Documentation: `GET /docs`
- ReDoc Documentation: `GET /redoc`
