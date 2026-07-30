# CampusCircle Frontend

Modern, high-performance web frontend for CampusCircle built with Next.js 16 (App Router), TypeScript, Turbopack, and custom CSS styling.

---

## Technical Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript
- **Styling**: Vanilla CSS tokens + Tailwind CSS
- **State & Auth**: Custom React `AuthContext`
- **Typography**: Google Fonts (Space Grotesk, Inter, IBM Plex Mono)

---

## Page Structure

```
app/
|-- (authenticated)/       # Protected route group (AppShell wrapper)
|   |-- feed/              # Community campus post feed & creation
|   |-- learn/             # AI Storytelling explanation & adaptive quiz
|   |-- ask-reva/          # Grok-inspired Reva AI chat interface
|   +-- my-posts/          # User activity dashboard (Posts, Saved, Commented)
|-- login/                 # Student authentication & login
|-- signup/                # University domain registration
|-- verify-pending/        # Email verification pending state
|-- icon.svg               # Custom vector C logo favicon
|-- icon.png               # High-res favicon PNG
+-- layout.tsx             # Root layout & typography setup
```

---

## Setup & Local Execution

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Local Environment (`.env.local`)

```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Run Development Server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### 4. Build Production Bundle

```bash
npm run build
```
