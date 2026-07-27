# CampusCircle Backend

## Phase 1 — Project Foundation

This is the initial scaffold: FastAPI app + Postgres, running in Docker,
with a working health check. Nothing product-specific yet — auth,
communities, posts, etc. come in later phases.

### Prerequisites
- Docker + Docker Compose installed
- (Python installed locally is optional for Phase 1 — Docker handles everything)

### Run it

```bash
# 1. Copy the environment template
cp .env.example .env

# 2. Build and start both containers (API + Postgres)
docker compose up --build
```

### Verify it worked

Open in your browser or curl:
- http://localhost:8000/health  → should return `{"status":"ok","environment":"development"}`
- http://localhost:8000/docs    → FastAPI's auto-generated interactive API docs (Swagger UI)

If both of those work, Phase 1 is done.

### Project structure
```
src/
  main.py          → FastAPI app entrypoint, health check lives here
  config.py        → all settings, read from environment variables
  api/              → (Phase 3+) route handlers go here
  auth/             → (Phase 3) JWT issuance, password hashing
  models/           → (Phase 2) SQLAlchemy models
  schemas/          → (Phase 3+) Pydantic request/response schemas
  repositories/     → (Phase 2+) DB query layer — university_id isolation enforced here
  services/         → (Phase 4+) business logic
  workers/          → (Phase 3+) background tasks (email sending)
  middleware/        → (Phase 3+) auth middleware, rate limiting
  utils/
migrations/          → (Phase 2) Alembic migrations
tests/
```

### Stopping it
```bash
docker compose down       # stop containers, keep DB data
docker compose down -v    # stop containers AND wipe DB data (fresh start)
```

## Phase 2 — Database

All 7 tables (universities, users, communities, posts, comments, votes,
reports) + the internal audit_logs table are now defined as SQLAlchemy
models in `src/models/`. Alembic is configured to auto-generate migrations
from those models.

### Step 1 — make sure your containers are running
```bash
docker compose up --build
```
(leave this running in one terminal)

### Step 2 — generate the migration (in a NEW terminal window)
This command looks at your SQLAlchemy models, compares them to the
(currently empty) database, and writes a migration file describing
every table it needs to create:

```bash
docker compose exec api alembic revision --autogenerate -m "create initial tables"
```

You should see a new file appear in `migrations/versions/`. **Open it
and read it** — this is a good habit to build now: always review what
Alembic generated before running it, never blindly trust autogenerate.

### Step 3 — apply the migration
This actually runs the migration against Postgres, creating the tables:
```bash
docker compose exec api alembic upgrade head
```

### Step 4 — verify it worked
```bash
docker compose exec db psql -U campuscircle -d campuscircle -c "\dt"
```
This should list all 8 tables (universities, users, communities, posts,
comments, votes, reports, audit_logs, plus alembic's own version-tracking
table).

If you see all your tables listed, **Phase 2 is done.**

### Next: Phase 3 — Authentication
Signup, email verification, login, JWT issuance, refresh tokens.
