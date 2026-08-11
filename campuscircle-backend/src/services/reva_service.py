import json
import uuid
import httpx
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.models.user import User
from src.models.university import University
from src.models.post import Post
from src.models.comment import Comment


def get_effective_reva_key() -> str:
    return settings.reva_groq_api_key or settings.groq_api_key


async def get_or_create_reva_user(db: AsyncSession) -> User:
    """
    Retrieves or creates the system Reva AI bot user.
    """
    stmt = select(User).where(User.username == "reva")
    res = await db.execute(stmt)
    bot = res.scalar_one_or_none()
    if bot:
        return bot

    # Fetch first available university for bot FK requirement
    uni_res = await db.execute(select(University.id).limit(1))
    uni_id = uni_res.scalar_one_or_none()
    if not uni_id:
        uni_id = uuid.uuid4()

    bot = User(
        university_id=uni_id,
        email="reva@campuscircle.ai",
        username="reva",
        password_hash="system_bot_no_login",
        email_verified=True,
        role="admin",
    )
    try:
        db.add(bot)
        await db.commit()
        await db.refresh(bot)
    except Exception:
        await db.rollback()
        bot_res = await db.execute(select(User).where(User.username == "reva"))
        bot = bot_res.scalar_one_or_none()

    return bot


async def generate_reva_grok_reply(
    post_title: str,
    post_content: str,
    user_comment: str
) -> str:
    """
    Generates a witty, Grok-style response to a user's @reva tag on a post comment.
    """
    api_key = get_effective_reva_key()
    if not api_key:
        return (
            "Beep boop! Reva AI here. I see you tagged me! "
            "Configure REVA_GROQ_API_KEY in your .env file to enable my full Grok-style reasoning powers!"
        )

    system_prompt = (
        "You are Reva, CampusCircle's resident AI agent — heavily inspired by Grok. "
        "You are sharp, witty, highly knowledgeable about computer science, engineering, campus life, viva prep, "
        "academics, and student banter. "
        "When tagged in a post or comment, respond directly, cleverly, and concisely with genuine insight, "
        "a slight touch of humor, and clean formatting. Keep responses under 150 words. Do NOT use emojis."
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.reva_groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    f"Post Title: '{post_title}'\n"
                    f"Post Content: '{post_content[:1500]}'\n"
                    f"User Tagged Reva with: '{user_comment}'\n\n"
                    "Respond as Reva AI."
                ),
            },
        ],
        "temperature": 0.7,
        "max_tokens": 300,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                data = res.json()
                return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"[Reva AI Error]: {e}")

    return f"Reva AI: Interesting point about '{post_title}'! Let's break this down further."


async def handle_reva_auto_reply_if_tagged(
    db: AsyncSession,
    post_id: uuid.UUID,
    comment_content: str,
    user_id: uuid.UUID,
    parent_comment_id: Optional[uuid.UUID] = None
) -> Optional[Comment]:
    """
    Checks if @reva is tagged in the comment. If yes, generates a Grok-style reply
    and saves it as a new comment from Reva AI.
    """
    if "reva" not in comment_content.lower():
        return None

    # Fetch post context
    post_res = await db.execute(select(Post).where(Post.id == post_id))
    post = post_res.scalar_one_or_none()
    if not post:
        return None

    reva_user = await get_or_create_reva_user(db)
    if reva_user.id == user_id:
        return None  # Prevent self loop

    reply_text = await generate_reva_grok_reply(
        post_title=post.title,
        post_content=post.content,
        user_comment=comment_content
    )

    reva_comment = Comment(
        post_id=post_id,
        parent_id=parent_comment_id,
        author_id=reva_user.id,
        content=reply_text,
        depth=0
    )
    db.add(reva_comment)
    await db.commit()
    await db.refresh(reva_comment)

    return reva_comment


import re
import datetime as dt
from src.models.reva_visual_cache import RevaVisualCache, RevaVisualRateLimit


def normalize_chat_query(query: str) -> str:
    """Normalizes prompt for loose caching (lowercase, strip extra spaces & punctuation)."""
    q = query.lower().strip()
    q = re.sub(r'[^\w\s]', '', q)
    q = re.sub(r'\s+', ' ', q)
    return q


async def check_and_increment_visual_rate_limit(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """
    Checks if user has triggered <= 5 chat visual generations today.
    Returns True if allowed (and increments count), False if limit reached (5/day).
    """
    today_str = dt.date.today().isoformat()
    stmt = select(RevaVisualRateLimit).where(
        RevaVisualRateLimit.user_id == user_id,
        RevaVisualRateLimit.date_stamp == today_str
    )
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()

    if record:
        if record.count >= 5:
            return False
        record.count += 1
    else:
        record = RevaVisualRateLimit(user_id=user_id, date_stamp=today_str, count=1)
        db.add(record)

    await db.flush()
    return True


async def evaluate_and_generate_chat_visual(
    user_message: str,
    user_id: Optional[uuid.UUID],
    db: AsyncSession
) -> Optional[dict]:
    """
    Determines if a chat message warrants an interactive visual simulation.
    Reuses Learn module rules, reference template, quality gate, caching & rate limiting.
    Returns dict with keys {"title": ..., "visual_html": ...} or None.
    """
    normalized = normalize_chat_query(user_message)
    if not normalized or len(normalized) < 4:
        return None

    # 1. Check cache first
    cache_stmt = select(RevaVisualCache).where(RevaVisualCache.normalized_query == normalized).limit(1)
    cache_res = await db.execute(cache_stmt)
    cached = cache_res.scalar_one_or_none()
    if cached:
        return {"title": cached.title, "visual_html": cached.visual_html}

    # 2. Check STEM suitability heuristic / AI evaluation
    stem_keywords = [
        "physics", "newton", "force", "mass", "acceleration", "gravity", "friction",
        "velocity", "archimedes", "buoyancy", "pendulum", "wave", "frequency",
        "circuit", "resistor", "voltage", "current", "ohm", "algorithm", "binary search",
        "sorting", "tree", "graph", "vector", "matrix", "derivative", "integral", "trigonometry",
        "pythagoras", "projectile", "momentum", "energy", "work", "power", "thermodynamics"
    ]
    is_stem_topic = any(kw in normalized for kw in stem_keywords)

    if not is_stem_topic:
        api_key = get_effective_reva_key()
        if api_key:
            try:
                eval_prompt = (
                    "Evaluate if the user's prompt is a STEM, physics, math, engineering, or computer science concept "
                    "where an interactive visual slider simulation (with inputs driving live diagram and equation readouts) "
                    "would MEANINGFULLY help teach it.\n"
                    "Respond with JSON: {\"is_visualizable\": true/false, \"title\": \"Short Title\"}"
                )
                url = "https://api.groq.com/openai/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                payload = {
                    "model": settings.reva_groq_model,
                    "messages": [
                        {"role": "system", "content": eval_prompt},
                        {"role": "user", "content": user_message}
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.1,
                    "max_tokens": 100,
                }
                async with httpx.AsyncClient(timeout=8.0) as client:
                    res = await client.post(url, headers=headers, json=payload)
                    if res.status_code == 200:
                        eval_data = res.json()["choices"][0]["message"]["content"]
                        eval_json = json.loads(eval_data)
                        if eval_json.get("is_visualizable"):
                            is_stem_topic = True
            except Exception:
                pass

    if not is_stem_topic:
        return None

    # 3. Check rate limit if user_id is provided
    if user_id:
        allowed = await check_and_increment_visual_rate_limit(db, user_id)
        if not allowed:
            print(f"[REVA VISUAL] User {user_id} reached daily 5 chat visual limit.")
            return None

    # 4. Generate Visual using exact Learn module pipeline & quality checks
    from src.api.learn import validate_and_sanitize_visual_html, validate_visual_quality_check, _MOCK_PHYSICS_VISUAL

    api_key = get_effective_reva_key()
    if not api_key:
        return {
            "title": "Interactive Visual Simulation",
            "visual_html": _MOCK_PHYSICS_VISUAL
        }

    system_prompt = (
        "You are an expert AI visual designer. Generate a self-contained interactive visual simulation for the student's question.\n\n"
        "MANDATORY STRUCTURAL RULES:\n"
        "- Generate a complete self-contained HTML string in 'visual_html'.\n"
        "- MANDATORY RULE: This output MUST contain at least one <input type=\"range\"> element for every adjustable variable in the concept. Static buttons are NOT an acceptable substitute for sliders.\n"
        "- MUST USE CAMPUSCIRCLE DESIGN TOKENS IN INLINE CSS:\n"
        "  :root { --background: #FAF9F6; --surface: #FFFFFF; --primary: #2F5233; --accent: #E8A33D; --ink: #1C2826; --border: #E2E8F0; }\n"
        "- MUST MATCH THIS EXACT STRUCTURAL PATTERN:\n"
        "  1. Continuous range sliders (<input type='range'>) for every adjustable variable.\n"
        "  2. An SVG diagram (<svg>) with dynamic attributes or vectors.\n"
        "  3. A live formula readout box displaying exact mathematical equations and correct physical units.\n"
        "  4. Plain vanilla JS update functions listening to 'input' events on range sliders.\n\n"
        "LITERAL WORKING REFERENCE HTML TEMPLATE TO STRUCTURALLY MATCH:\n"
        f"```html\n{_MOCK_PHYSICS_VISUAL}\n```\n\n"
        "Return a JSON object with top-level keys: 'title' (string title) and 'visual_html' (full HTML string)."
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.reva_groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Create interactive visual for concept: {user_message}"}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.4,
        "max_tokens": 4096,
    }

    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                data = res.json()
                content = data["choices"][0]["message"]["content"]
                parsed = json.loads(content)
                title = str(parsed.get("title", "Interactive Visual")).strip()
                raw_html = str(parsed.get("visual_html", "")).strip()

                if raw_html:
                    is_valid_sec, clean_html = validate_and_sanitize_visual_html(raw_html)
                    is_valid_qual = validate_visual_quality_check(clean_html) if is_valid_sec else False

                    if is_valid_sec and is_valid_qual:
                        cache_record = RevaVisualCache(
                            normalized_query=normalized,
                            title=title,
                            visual_html=clean_html
                        )
                        db.add(cache_record)
                        await db.flush()
                        return {"title": title, "visual_html": clean_html}
                    else:
                        print("[REVA VISUAL] Generated visual failed quality/security gate. Falling back to text-only.")
    except Exception as e:
        print(f"[REVA VISUAL ERROR]: {e}")

    return None


async def generate_reva_chat_response(
    user_message: str,
    conversation_history: List[dict],
    db: AsyncSession,
    user_id: Optional[uuid.UUID] = None,
    user_university_id: Optional[uuid.UUID] = None
) -> dict:
    """
    Provides platform-wide context-aware answers for the 'Ask Reva' chatbot tab.
    Queries recent active posts across the platform/university for RAG context.
    Evaluates and attaches an inline interactive visual if prompt is STEM/visualizable.
    """
    api_key = get_effective_reva_key()

    # RAG Context: Fetch up to 5 recent posts for campus context
    recent_posts_stmt = (
        select(Post.title, Post.content, User.username)
        .join(User, User.id == Post.author_id)
        .where(Post.is_deleted == False)
        .order_by(Post.created_at.desc())
        .limit(5)
    )
    posts_res = await db.execute(recent_posts_stmt)
    campus_posts = posts_res.all()

    context_summary = "\n".join(
        f"- @{author}: '{title}' — {content[:150]}..."
        for title, content, author in campus_posts
    )

    system_prompt = (
        "You are Reva, the intelligent, Grok & Claude inspired AI Agent for CampusCircle. "
        "You speak directly, warmly, and conversationally to the student. "
        "IMPORTANT: You have internal background awareness of recent campus posts provided below. "
        "Do NOT simply list or dump all recent posts unless the user explicitly asks 'what's trending' or 'summarize campus posts'. "
        "Instead, directly answer the user's specific prompt using your intelligence, and weave in campus context naturally if relevant. "
        "Do NOT use emojis. Do NOT use filler phrases like 'I'd be happy to help' or 'Feel free to ask'.\n\n"

        "Use Markdown formatting to make responses clear and scannable. Adapt the structure to the question:\n"
        "- Use headings (###) only when grouping distinct sections. Skip headings for simple or short answers.\n"
        "- Use bullet points for lists and multiple related items.\n"
        "- Use numbered steps for procedures or sequential instructions.\n"
        "- Use code blocks (```) for code. Use inline code (`) for variables, commands, APIs, filenames, and technical terms.\n"
        "- Use bold (**) only for key terms or important takeaways.\n"
        "- Keep paragraphs short (2-4 sentences).\n\n"

        "Match response length and structure to the question type:\n"
        "- Simple question → short direct answer, no headings.\n"
        "- Explanation → organized sections with concise paragraphs.\n"
        "- How-to question → numbered steps.\n"
        "- Coding or debugging → explanation + code + key fix.\n"
        "- Comparison → separate options or a table.\n"
        "- Campus question → concise answer with relevant context.\n\n"

        f"Internal Campus Background Context:\n{context_summary if context_summary else 'No recent public posts.'}"
    )

    visual_data = await evaluate_and_generate_chat_visual(
        user_message=user_message,
        user_id=user_id,
        db=db
    )

    if not api_key:
        return {
            "reply": (
                "Hello! I am Reva, your CampusCircle AI Assistant. "
                "I am currently running in local demonstration mode. "
                "To unlock full AI conversation capabilities powered by Groq, add REVA_GROQ_API_KEY to your backend .env file!"
            ),
            "context_posts_count": len(campus_posts),
            "visual_html": visual_data.get("visual_html") if visual_data else None,
            "visual_title": visual_data.get("title") if visual_data else None,
        }

    formatted_messages = [{"role": "system", "content": system_prompt}]
    for msg in conversation_history[-6:]:
        role = "user" if msg.get("sender") == "user" else "assistant"
        formatted_messages.append({"role": role, "content": msg.get("text", "")})

    formatted_messages.append({"role": "user", "content": user_message})

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.reva_groq_model,
        "messages": formatted_messages,
        "temperature": 0.6,
        "max_tokens": 600,
    }

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                data = res.json()
                reply = data["choices"][0]["message"]["content"].strip()
                return {
                    "reply": reply,
                    "context_posts_count": len(campus_posts),
                    "visual_html": visual_data.get("visual_html") if visual_data else None,
                    "visual_title": visual_data.get("title") if visual_data else None,
                }
    except Exception as e:
        print(f"[Reva Chat Error]: {e}")

    return {
        "reply": "I'm having trouble connecting to my neural core right now. Please try asking your question again in a moment!",
        "context_posts_count": len(campus_posts),
        "visual_html": visual_data.get("visual_html") if visual_data else None,
        "visual_title": visual_data.get("title") if visual_data else None,
    }
