```
  ____   _   __  __  ____   _   _  ____    ____  ___  ____    ____  _     _____ 
 / ___| / \ |  \/  ||  _ \ | | | |/ ___|  / ___||_ _||  _ \  / ___|| |   | ____|
| |    / _ \| |\/| || |_) || | | |\___ \ | |     | | | |_) || |    | |   |  _|  
| |___/ ___ \ |  | ||  __/ | |_| | ___) || |___  | | |  _ < | |___ | |___| |___ 
 \____/_/   \_\_|  |_|_|    \___/ |____/  \____|___||_| \_\ \____||_____|_____|
```

# CampusCircle

CampusCircle is a production-grade, privacy-first collegiate community platform and AI-powered learning engine. Designed specifically for university ecosystems, CampusCircle pairs verified student university email domains with pseudonymous handles, providing a candid, respectful environment for academic discussions, course feedback, viva preparation, and peer collaboration.

The platform features an integrated Grok-inspired platform agent named **Reva**, an adaptive video/text learning system with automated remediation gap tracking, multi-language support, and comprehensive user activity monitoring.

---

## System Architecture

```
                                  +-----------------------+
                                  |    Next.js Frontend   |
                                  | (TypeScript/Turbopack)|
                                  +-----------+-----------+
                                              |
                                              | REST / JSON
                                              v
                                  +-----------+-----------+
                                  |   FastAPI Async Core  |
                                  | (Python 3.11 / Uvicorn|
                                  +-----+-----+-----+-----+
                                        |     |     |
              +-------------------------+     |     +-------------------------+
              |                               |                               |
              v                               v                               v
    +---------+---------+           +---------+---------+           +---------+---------+
    | PostgreSQL 16 DB  |           |   Groq LLM Engine |           | YouTube Proxy   |
    | (AsyncPG/SQLAlchemy)          | (Llama 3.3 70B)   |           | (Supadata API)  |
    +-------------------+           +-------------------+           +-------------------+
```

CampusCircle is structured as a high-performance monorepo:

- **Frontend**: Next.js 16 (App Router, Turbopack, TypeScript, Tailwind CSS)
- **Backend**: FastAPI (Python 3.11, AsyncIO, SQLAlchemy 2.0, Alembic)
- **Database**: PostgreSQL 16 (Relational schemas with strict foreign key constraints)
- **AI Core**: Groq Cloud Infrastructure (`llama-3.3-70b-versatile`)
- **Proxy Gateway**: Supadata API for cloud IP YouTube transcript extraction

---

## Core Capabilities

### 1. Pseudonymous Collegiate Network
- **Domain Verification**: Enforces strict `.edu` or university email domain validation.
- **Deterministic Avatars**: Procedurally generated organic SVG avatars derived from username hashes.
- **Threaded Discussions**: Nested comment threads up to 8 levels deep with real-time score tracking and voting.
- **Moderation & Reporting**: Built-in reporting pipelines and role-based access control (Student vs Administrator).

### 2. Interactive AI Learning Engine
- **Transcript Extraction**: Extracts YouTube video captions via primary and proxy fallback layers or direct note uploads.
- **Storytelling Explanations**: Converts complex academic topics into structured storytelling chunks with concept tags.
- **Adaptive Multi-Phase Quizzes**: Generates 3-phase structured quizzes linked directly to conceptual explanation chunks.
- **Real-Time Remediation**: Identifies incorrect answers and generates targeted micro-explanations for specific concept gaps.
- **User Gap Profiling**: Tracks recurring student weakness categories across multiple topics (`user_concept_gaps`).
- **Multi-Language Support**: Direct Groq prompt generation across 5 languages (`en`, `hi`, `es`, `fr`, `gu`).

### 3. Reva AI Platform Agent
- **Grok-Inspired Bot**: Sharp, witty, senior-student AI persona for campus banter and academic assistance.
- **Thread Auto-Reply**: Tagging `@reva` in posts or comments triggers automated contextual responses directly in the thread.
- **Platform-Wide RAG**: Real-time awareness of active campus posts, university events, and trending tags.
- **Ask Reva Interface**: Minimalist Claude/Grok-style centered chat interface with model mode selection (`Fast Model` vs `Deep Think`).

### 4. Activity & Bookmark Dashboard
- **My Posts**: Track published posts and thread history.
- **Saved Posts**: Bookmark posts for quick access.
- **Commented Posts**: View all discussions where you contributed comments.

---

## Repository Structure

```
campuscircle/
|-- campuscircle-backend/          # FastAPI Async Backend Application
|   |-- migrations/                # Alembic database migrations
|   |-- src/                       # Application source code
|   |   |-- api/                   # Router endpoints (auth, posts, learn, reva, users)
|   |   |-- auth/                  # JWT authentication & security handlers
|   |   |-- models/                # SQLAlchemy database models
|   |   |-- repositories/          # Data access layer & database queries
|   |   |-- schemas/               # Pydantic validation schemas
|   |   |-- services/              # External integrations (Groq, Reva, YouTube)
|   |   |-- config.py              # Central environment configuration
|   |   +-- main.py                # FastAPI application entrypoint
|   |-- Dockerfile                 # Backend containerization spec
|   +-- requirements.txt           # Python dependencies
|
|-- campuscircle-frontend/         # Next.js 16 Web Application
|   |-- app/                       # App router pages & layouts
|   |   |-- (authenticated)/       # Protected route group (feed, learn, ask-reva, my-posts)
|   |   |-- login/                 # Authentication pages
|   |   |-- icon.svg               # Custom vector favicon
|   |   +-- layout.tsx             # Root layout & font configurations
|   |-- components/                # Reusable UI components
|   |-- context/                   # React AuthContext provider
|   +-- lib/                       # API client helpers & fetch wrappers
|
+-- README.md                      # Project documentation
```

---

## Environment Configuration

### Backend Environment (`campuscircle-backend/.env`)

```ini
APP_NAME=CampusCircle API
ENVIRONMENT=development
DEBUG=True

# Database
DATABASE_URL=postgresql+asyncpg://campuscircle:campuscircle@localhost:5432/campuscircle

# Security & JWT
JWT_SECRET=your-secure-random-jwt-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30

# Email Integration (Brevo / Resend / SMTP)
BREVO_API_KEY=your-brevo-api-key
FROM_EMAIL_ADDRESS=noreply@campuscircle.ai
FRONTEND_URL=http://localhost:3000

# AI Core Configuration
GROQ_API_KEY=gsk_your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile

# Reva AI Agent (Optional separate key)
REVA_GROQ_API_KEY=gsk_your_reva_groq_api_key
REVA_GROQ_MODEL=llama-3.3-70b-versatile

# YouTube Transcript Proxy
SUPADATA_API_KEY=your_supadata_api_key

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### Frontend Environment (`campuscircle-frontend/.env.local`)

```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Local Development Setup

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm
- PostgreSQL 16

### 1. Database Initialization

```bash
createdb campuscircle
```

### 2. Backend Setup

```bash
cd campuscircle-backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start development server
uvicorn src.main:app --reload --port 8000
```

The FastAPI documentation will be available at `http://localhost:8000/docs`.

### 3. Frontend Setup

```bash
cd campuscircle-frontend

# Install dependencies
npm install

# Start Next.js development server
npm run dev
```

The frontend application will be running at `http://localhost:3000`.

---

## API Reference Overview

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/auth/signup` | `POST` | Register user with university email domain |
| `/api/v1/auth/login` | `POST` | Authenticate user and issue JWT token |
| `/api/v1/feed` | `GET` | Retrieve university campus post feed |
| `/api/v1/posts` | `POST` | Create post or multi-part thread |
| `/api/v1/posts/{id}/comments` | `POST` | Add comment reply (triggers `@reva` if tagged) |
| `/api/v1/posts/{id}/bookmark` | `POST` | Toggle post bookmark status |
| `/api/v1/users/me/posts` | `GET` | Retrieve authenticated user's post history |
| `/api/v1/users/me/saved` | `GET` | Retrieve saved/bookmarked posts |
| `/api/v1/users/me/commented` | `GET` | Retrieve posts where user commented |
| `/api/v1/learn/explain` | `POST` | Generate storytelling explanation & quiz |
| `/api/v1/learn/{id}/remediate` | `POST` | Generate targeted concept remediation |
| `/api/v1/learn/me/gaps` | `GET` | Retrieve student's recurring gap profile |
| `/api/v1/reva/chat` | `POST` | Interactive RAG chat with Reva AI Agent |

---

## Production Deployment

### Backend (Render / Docker)
- Deploy as a Web Service using the provided `Dockerfile` or `render.yaml`.
- Set Environment Variables (`DATABASE_URL`, `JWT_SECRET`, `GROQ_API_KEY`, etc.).
- Run database migration command on release: `alembic upgrade head`.

### Frontend (Vercel)
- Connect GitHub repository to Vercel.
- Set Framework Preset to **Next.js**.
- Add `NEXT_PUBLIC_API_URL` pointing to your deployed backend URL.

---


