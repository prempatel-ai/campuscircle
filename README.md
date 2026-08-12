```
  ____   _   __  __  ____   _   _  ____    ____  ___  ____    ____  _     _____ 
 / ___| / _ \|  \/  ||  _ \ | | | |/ ___|  / ___||_ _||  _ \  / ___|| |   | ____|
| |    / _ \| |\/| || |_) || | | |\___ \ | |     | | | |_) || |    | |   |  _|  
| |___/ ___ \ |  | ||  __/ | |_| | ___) || |___  | | |  _ < | |___ | |___| |___ 
 \____/_/   \_\_|  |_|_|    \___/ |____/  \____|___||_| \_\ \____||_____|_____|
```

# CampusCircle

CampusCircle is a state-of-the-art, privacy-first collegiate community platform, AI-powered learning engine, and STEM interactive simulation environment. Designed specifically for university ecosystems, CampusCircle pairs verified university email domains with pseudonymous handles, providing a candid, respectful environment for academic discussions, course feedback, viva preparation, and peer collaboration.

The platform features an integrated Grok/Claude-inspired AI agent named **Reva**, an adaptive video/text learning system with interactive HTML5/SVG/JS physical simulations, voice synthesis/recognition, multi-language support (English, Hindi, Spanish, French, Gujarati), and multi-key/multi-model AI resilience.

---

## System Architecture

```mermaid
graph TD
    subgraph Frontend [Next.js 16 Web Portal]
        UI[Tailwind CSS / Lucide React / HTML5]
        State[React Context / AuthContext / Custom Hooks]
        Voice[Web Speech API TTS & STT Engine]
    end

    subgraph Backend [FastAPI Async Core Engine]
        Server[FastAPI / Uvicorn Async Server]
        Auth[JWT Auth / Security / RBAC]
        Services[Reva AI / Learn / Feed Services]
        RateLimit[In-Memory & Redis Rate Limiters]
    end

    subgraph AI_Infrastructure [Groq Multi-Model LLM Engine]
        KeyPool[Multi-Key Rotation Pool - Groq API Keys]
        Cascade[Model Fallback Cascade - Llama 3.3 70B / 3.1 8B / Mixtral 8x7B]
        VisualGen[STEM Sandboxed Interactive Visual Generator]
    end

    subgraph Database [Persistence & Cache Layer]
        PostgreSQL[(PostgreSQL 16 Database)]
        Alembic[Alembic Migrations / SQLAlchemy 2.0]
        VisualCache[Reva STEM Visual Simulation Cache]
    end

    Frontend --> Backend
    Backend --> Database
    Backend --> AI_Infrastructure
    AI_Infrastructure --> Cascade
    AI_Infrastructure --> VisualGen
    Database --> VisualCache
```

CampusCircle is structured as a high-performance monorepo:

- **Frontend**: Next.js 16 (App Router, Turbopack, TypeScript, Tailwind CSS, Web Speech API)
- **Backend**: FastAPI (Python 3.11/3.13, AsyncIO, SQLAlchemy 2.0, Alembic)
- **Database**: PostgreSQL 16 (Relational schemas with strict foreign key constraints & Alembic migrations)
- **AI Core**: Groq Cloud Multi-Model Engine (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768`, `llama3-70b-8192`)
- **Key Rotation**: Multi-key round-robin key pool rotation to bypass single-account rate limits
- **Proxy Gateway**: Supadata API & fallback extractors for YouTube caption fetching

---

## Core Capabilities & Technical Implementations

### 1. Interactive STEM Visual Simulations
- **Real-Time Concept Evaluation**: AI automatically evaluates whether a question or lesson chunk is STEM/physics/math/algorithm-related and generates a custom, interactive simulation.
- **Sandboxed IFrame Execution**: Visuals are safely rendered inside isolated, sandboxed iframes preventing DOM pollution.
- **Interactive Controls**: MANDATORY HTML range sliders (`<input type="range">`) driving real-time JavaScript updates on SVG vectors and dynamic formula readouts.
- **Performance Caching & Rate Limiting**: Features a 5 visual/day rate limiter (`reva_visual_rate_limits`) and pre-rendered query cache (`reva_visual_cache`) for instant repeat loads.

### 2. Multi-Key & Multi-Model AI Resilience
- **Round-Robin Key Rotation**: Configurable `GROQ_API_KEYS_POOL` automatically rotates API requests across multiple Groq developer accounts to eliminate 429 rate limit errors.
- **4-Pass Model Fallback Cascade**: If the primary model fails or is rate-limited, requests automatically fallback through:
  `llama-3.3-70b-versatile` $\rightarrow$ `llama-3.1-8b-instant` $\rightarrow$ `mixtral-8x7b-32768` $\rightarrow$ `llama3-70b-8192`.
- **Fail-Safe Storytelling & Quiz Fallbacks**: Guarantees 100% uptime with localized fallback chunks and quizzes in target languages.

### 3. Reva AI Platform Agent ("Ask Reva")
- **Senior-Student Persona**: Sharp, knowledgeable, witty AI assistant trained on university topics, course discussions, and viva prep.
- **Model Mode Toggling**: Switch seamlessly between **Fast Model** (`llama-3.1-8b-instant`) for quick answers and **Deep Think** (`llama-3.3-70b-versatile`) for complex reasoning.
- **Inline Interactive Simulations**: Reva generates and embeds STEM visual simulations directly inside the chat response thread.
- **Thread Auto-Reply**: Tagging `@reva` in community posts or comments triggers automated contextual responses directly in the thread.

### 4. Interactive Multilingual AI Learn Module
- **YouTube & Text Processing**: Converts YouTube links or pasted study notes into digestible, storytelling explanation chunks.
- **Adaptive 3-Phase Quizzes**: Generates 3-phase structured quizzes (Recall, Application, Synthesis) linked directly to explanation chunks.
- **Real-Time Remediation**: Missed quiz questions trigger targeted micro-explanations and fresh analogies.
- **Weakness Gap Profiling**: Automatically tracks student concept weaknesses (`user_concept_gaps`) to provide personalized learning reports.
- **5-Language Native Support**: Full translation and generation in **English**, **Hindi (हिंदी)**, **Spanish (Español)**, **French (Français)**, and **Gujarati (ગુજરાતી)**.

### 5. Multilingual Voice Read-Aloud & Voice Input
- **Text-to-Speech (TTS)**: Built-in `useSpeech` hook utilizing browser `SpeechSynthesis` with automatic script detection (`hi-IN`, `gu-IN`, `es-ES`, `fr-FR`, `en-IN`) for natural voice read-aloud.
- **Voice Recognition (STT)**: Hands-free voice input via `SpeechRecognition` for Ask Reva and note entry.

### 6. Pseudonymous Collegiate Network & Auth
- **Optional University Affiliation**: Supports both verified `.edu` / academic domain signups and general user registration (`university_id` nullable migration).
- **Deterministic Avatars**: Procedurally generated organic SVG avatars derived from username hashes.
- **Threaded Discussions**: Nested comment threads up to 8 levels deep with real-time voting and bookmarking.
- **Auto Environment Hostname Conversion**: Automatically converts Render internal PostgreSQL hostnames (`dpg-xxxx-a`) to public external endpoints when running on a local PC outside cloud infrastructure.

---

## Repository Structure

```
campuscircle/
|-- campuscircle-backend/          # FastAPI Async Backend Application
|   |-- migrations/                # Alembic database schema migrations
|   |-- src/                       # Application source code
|   |   |-- api/                   # REST API Routers (auth, posts, learn, reva, users)
|   |   |-- auth/                  # JWT authentication & security dependencies
|   |   |-- models/                # SQLAlchemy database models (User, Learn, RevaVisualCache)
|   |   |-- schemas/               # Pydantic validation schemas
|   |   |-- services/              # Business logic (Reva, Learn, Dashboard, Weekly Reports)
|   |   |-- utils/                 # Utilities (Rate limiting, IP detection, stem topics)
|   |   |-- config.py              # Central environment config & key rotation
|   |   +-- main.py                # FastAPI entrypoint
|   |-- tests/                     # Pytest suite (reva visuals, interactive visuals)
|   |-- Dockerfile                 # Backend containerization spec
|   +-- requirements.txt           # Python dependencies
|
|-- campuscircle-frontend/         # Next.js 16 Web Application
|   |-- app/                       # App Router pages & layouts
|   |   |-- (authenticated)/       # Protected pages (feed, learn, ask-reva, my-posts)
|   |   |-- login/                 # Authentication & Registration pages
|   |   +-- layout.tsx             # Root layout & global CSS
|   |-- components/                # UI Components (InteractiveVisual, ExplanationChunks, LearnQuiz)
|   |-- context/                   # AuthContext state provider
|   |-- hooks/                     # Custom React hooks (useSpeech)
|   |-- lib/                       # API helpers & STEM topic metadata
|   +-- next.config.ts             # Next.js configuration
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

# Database Configuration (Render Internal or External PostgreSQL)
DATABASE_URL=postgresql+asyncpg://campuscicle_user:password@dpg-d9k9t2m417fc73ef9dqg-a/campuscicle

# Security & JWT
JWT_SECRET=your-secure-random-jwt-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30

# Groq API Keys & Rotation Pool (Committed keys or comma-separated pool)
GROQ_API_KEY=gsk_primary_key
GROQ_API_KEYS_POOL=gsk_key1,gsk_key2,gsk_key3
GROQ_MODEL=llama-3.3-70b-versatile

# Feature-Specific Groq Keys (Optional Overrides)
GROQ_API_KEY_EXPLANATION=gsk_explanation_key
GROQ_API_KEY_QUIZ=gsk_quiz_key
GROQ_API_KEY_CHAT=gsk_chat_key

# YouTube Transcript Proxy
SUPADATA_API_KEY=your_supadata_api_key

# CORS Settings
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### Frontend Environment (`campuscircle-frontend/.env.local`)

```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Quick Start & Local Development

### 1. Database Setup

Ensure PostgreSQL 16 is running, or provide a Render PostgreSQL URL in `DATABASE_URL`.

### 2. Backend Setup

```bash
cd campuscircle-backend

# Create & activate virtual environment
python -m venv venv
venv\Scripts\activate  # On Linux/Mac: source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Execute Alembic migrations
alembic upgrade head

# Launch FastAPI application server
uvicorn src.main:app --reload --port 8000
```

FastAPI Interactive API Documentation will be available at `http://localhost:8000/docs`.

### 3. Frontend Setup

```bash
cd campuscircle-frontend

# Install dependencies
npm install

# Launch Next.js development server
npm run dev
```

The web app will be live at `http://localhost:3000`.

---

## Automated Test Suite

Run the full pytest suite for backend verification:

```bash
cd campuscircle-backend
pytest tests/test_reva_visuals.py tests/test_interactive_visuals.py
```

---

## License

Distributed under the MIT License. See `LICENSE` for more details.
