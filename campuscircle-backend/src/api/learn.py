import asyncio
import html
import json
import os
import re
import tempfile
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
import httpx
from youtube_transcript_api import (
    YouTubeTranscriptApi,
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable
)

from src.config import settings
from src.database import get_db
from src.auth.dependencies import get_current_user
from src.models.learn import LearnExtractionLog
from src.models.learning_session import LearningSession
from src.models.user_concept_gap import UserConceptGap
from src.schemas.learn import (
    ExtractRequest,
    ExtractResponse,
    TranscriptSegment,
    ExplainRequest,
    ExplainResponse,
    ExplanationChunk,
    QuizQuestionOut,
    QuizPhaseOut,
    QuizSessionOut,
    QuizSubmitRequest,
    QuestionResultDetail,
    QuizSubmitResponse,
    RemediateRequest,
    RemediateResponse,
    UserConceptGapOut,
    UserGapsResponse,
    StudentLearningProfileOut,
    CareerGoalUpdatePayload,
    PreSessionMentorOut,
    PostSessionMentorOut,
    LessonChatSendIn,
    LessonChatMessageOut,
    LearningDashboardOut,
    WeeklyLearningReportOut,
    SocraticMessageOut,
    SocraticRespondIn,
    SocraticRespondOut,
    SocraticStatusOut,
)
from src.services.learning_profile_service import (
    get_or_create_learning_profile,
    update_profile_on_explanation,
    update_profile_on_quiz_submission,
    update_career_goal
)
from src.services.learning_memory_service import (
    create_or_update_memory_from_session,
    get_relevant_memories_for_topic
)
from src.services.ai_mentor_service import (
    generate_presession_mentor_guidance,
    generate_postsession_mentor_summary
)
from src.services.dashboard_service import get_learning_dashboard
from src.services.weekly_report_service import (
    get_or_generate_current_week_report,
    list_reports_for_user,
    get_report_by_id,
)

router = APIRouter(prefix="/learn", tags=["learn"])

YOUTUBE_REGEX = re.compile(
    r'(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})'
)

EXTRACTION_DAILY_LIMIT = 999999  # Disabled for testing
EXPLAIN_DAILY_LIMIT = 999999  # Disabled for testing

SUPPORTED_LANGUAGES = {
    "en": "English",
    "hi": "Hindi (हिंदी)",
    "es": "Spanish (Español)",
    "fr": "French (Français)",
    "gu": "Gujarati (ગુજરાતી)"
}


def extract_video_id(url: str) -> str | None:
    match = YOUTUBE_REGEX.search(url.strip())
    if match:
        return match.group(1)
    return None


async def fetch_video_title(video_id: str) -> str | None:
    try:
        embed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        async with httpx.AsyncClient(timeout=4.0) as client:
            res = await client.get(embed_url)
            if res.status_code == 200:
                return res.json().get("title")
    except Exception:
        pass
    return None


def _ydl_extract_sync(video_id: str, tmpdir: str) -> None:
    import yt_dlp  # type: ignore

    ydl_opts = {
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en", "en-US", "en-GB"],
        "subtitlesformat": "json3",
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 20,
        "outtmpl": os.path.join(tmpdir, "%(id)s.%(ext)s"),
    }
    url = f"https://www.youtube.com/watch?v={video_id}"
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])


def _parse_json3(raw: str) -> List[dict]:
    data = json.loads(raw)
    segments = []
    for ev in data.get("events", []):
        segs = ev.get("segs", [])
        text_part = "".join(s.get("utf8", "") for s in segs).replace("\n", " ").strip()
        if text_part:
            segments.append({
                "text": text_part,
                "start": float(ev.get("tStartMs", 0)) / 1000.0,
                "duration": float(ev.get("dDurationMs", 0)) / 1000.0,
            })
    return segments


def _parse_vtt(raw: str) -> List[dict]:
    segments = []
    lines = raw.splitlines()
    i = 0
    while i < len(lines):
        if "-->" in lines[i]:
            try:
                parts = lines[i].split("-->")

                def _ts(ts: str) -> float:
                    ts = ts.strip().split(" ")[0].replace(",", ".")
                    p = ts.split(":")
                    if len(p) == 3:
                        return int(p[0]) * 3600 + int(p[1]) * 60 + float(p[2])
                    return int(p[0]) * 60 + float(p[1])

                start = _ts(parts[0])
                end = _ts(parts[1])
                i += 1
                text_lines = []
                while i < len(lines) and lines[i].strip():
                    cleaned = re.sub(r"<[^>]+>", "", lines[i].strip())
                    if cleaned:
                        text_lines.append(cleaned)
                    i += 1
                text_val = " ".join(text_lines).strip()
                if text_val:
                    segments.append({
                        "text": text_val,
                        "start": start,
                        "duration": max(0.0, end - start),
                    })
            except Exception:
                i += 1
        else:
            i += 1
    return segments


async def fetch_transcript_supadata(video_id: str) -> List[dict]:
    if not settings.supadata_api_key:
        raise Exception("SUPADATA_API_KEY not configured")

    url = f"https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v={video_id}&text=false"
    headers = {"x-api-key": settings.supadata_api_key}

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(url, headers=headers)
        if res.status_code != 200:
            raise Exception(f"Supadata API returned {res.status_code}")

        data = res.json()
        content = data.get("content", [])
        if not content:
            raise Exception("Supadata returned empty transcript")

        segments = []
        for item in content:
            text_val = str(item.get("text", "")).replace("\n", " ").strip()
            if text_val:
                segments.append({
                    "text": text_val,
                    "start": float(item.get("offset", 0)) / 1000.0,
                    "duration": float(item.get("duration", 0)) / 1000.0,
                })

        if not segments:
            raise Exception("Supadata transcript has no text segments")

        return segments


async def fetch_transcript_ytdlp(video_id: str) -> List[dict]:
    with tempfile.TemporaryDirectory() as tmpdir:
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(None, _ydl_extract_sync, video_id, tmpdir)
        except Exception as e:
            raise Exception(f"yt-dlp failed: {e}")

        sub_file = None
        for fname in sorted(os.listdir(tmpdir)):
            if fname.endswith(".json3") or fname.endswith(".vtt") or fname.endswith(".srv1"):
                sub_file = os.path.join(tmpdir, fname)
                break

        if not sub_file:
            raise Exception("yt-dlp produced no subtitle file")

        with open(sub_file, "r", encoding="utf-8") as f:
            raw = f.read()

        if sub_file.endswith(".json3"):
            segments = _parse_json3(raw)
        elif sub_file.endswith(".vtt"):
            segments = _parse_vtt(raw)
        else:
            root = ET.fromstring(raw)
            segments = []
            for elem in root.findall("text"):
                text_val = html.unescape(elem.text or "").replace("\n", " ").strip()
                if text_val:
                    segments.append({
                        "text": text_val,
                        "start": float(elem.attrib.get("start", 0)),
                        "duration": float(elem.attrib.get("duration", 0)),
                    })

        if not segments:
            raise Exception("Empty subtitle file from yt-dlp")

        return segments


async def get_transcript_with_fallback(video_id: str) -> List[dict]:
    try:
        return await fetch_transcript_supadata(video_id)
    except Exception:
        pass

    try:
        return await fetch_transcript_ytdlp(video_id)
    except Exception:
        pass

    try:
        try:
            return YouTubeTranscriptApi.get_transcript(video_id, languages=["en", "en-US", "en-GB"])
        except Exception:
            return YouTubeTranscriptApi.get_transcript(video_id)
    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable):
        raise
    except Exception:
        pass

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            "Could not retrieve transcript automatically. "
            "Switch to the 'Paste Notes / Text' tab to paste the transcript manually."
        ),
    )


# ─── Groq & Multilingual Helpers ───────────────────────────────────────────

CSP_META_TAG = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\';">'


def validate_and_sanitize_visual_html(html_str: str) -> Tuple[bool, Optional[str]]:
    """
    Scans and sanitizes AI-generated visual HTML code against strict security requirements.
    - Rejects external script sources (<script src=...)
    - Rejects dangerous network APIs (fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon)
    - Rejects outer frame tags (<iframe, <object, <embed)
    - Enforces embedded strict Content Security Policy meta tag.
    Returns (is_valid, sanitized_html_or_none).
    """
    if not html_str or not isinstance(html_str, str):
        return False, None

    clean_str = html_str.strip()
    if len(clean_str) < 20:
        return False, None

    lower_str = clean_str.lower()

    # Check for <script src=...
    if re.search(r'<script[^>]+src\s*=', lower_str):
        return False, None

    # Check for dangerous network APIs or outer embeds
    for pattern in ["fetch(", "fetch (", "xmlhttprequest", "websocket", "eventsource", "sendbeacon", "<iframe", "<object", "<embed"]:
        if pattern in lower_str:
            return False, None

    # Check for external script src or link href loading external HTTP resources
    if re.search(r'<link[^>]+href\s*=\s*["\']http', lower_str):
        return False, None

    # Ensure CSP meta tag is present
    if "content-security-policy" not in lower_str:
        if "<head>" in lower_str:
            clean_str = re.sub(r'(<head[^>]*>)', r'\1\n  ' + CSP_META_TAG, clean_str, count=1, flags=re.IGNORECASE)
        elif "<html>" in lower_str:
            clean_str = re.sub(r'(<html[^>]*>)', r'\1\n<head>\n  ' + CSP_META_TAG + '\n</head>', clean_str, count=1, flags=re.IGNORECASE)
        else:
            clean_str = f"<!DOCTYPE html>\n<html>\n<head>\n  {CSP_META_TAG}\n</head>\n<body>\n{clean_str}\n</body>\n</html>"

    return True, clean_str


import logging

logger = logging.getLogger(__name__)


def validate_visual_quality_check(html_str: str) -> bool:
    """
    Programmatically verifies that generated visual HTML meets quality criteria:
    1. Contains at least one <input type="range"> (continuous control, not just buttons)
    2. Contains an <svg> element
    3. Contains JS code handling live updates (oninput, addEventListener, requestAnimationFrame, or update())
    4. Contains CampusCircle CSS variable design tokens (--primary, --surface, --ink)
    """
    if not html_str or not isinstance(html_str, str):
        logger.warning("[VISUAL QUALITY CHECK FAILED] HTML string is empty or invalid type.")
        return False

    lower_str = html_str.lower()

    # 1. Must contain continuous range slider
    has_slider = bool(re.search(r'<input[^>]+type\s*=\s*["\']range["\']', lower_str))
    if not has_slider:
        logger.warning("[VISUAL QUALITY CHECK FAILED] Missing continuous range slider <input type='range'>. Static buttons are not acceptable.")
        return False

    # 2. Must contain SVG diagram
    has_svg = "<svg" in lower_str
    if not has_svg:
        logger.warning("[VISUAL QUALITY CHECK FAILED] Missing <svg> diagram element.")
        return False

    # 3. Must contain JS update logic
    has_js_update = any(k in lower_str for k in [
        "addeventlistener",
        "oninput",
        "requestanimationframe",
        "function update",
        "const update",
        "let update"
    ])
    if not has_js_update:
        logger.warning("[VISUAL QUALITY CHECK FAILED] Missing JS event listener or update function.")
        return False

    # 4. Must contain CampusCircle CSS design variable tokens
    has_tokens = all(tok in lower_str for tok in ["--primary", "--surface", "--ink"])
    if not has_tokens:
        logger.warning("[VISUAL QUALITY CHECK FAILED] Missing CampusCircle CSS variable design tokens (--primary, --surface, --ink).")
        return False

    logger.info("[VISUAL QUALITY CHECK PASSED] Valid visual HTML with continuous range slider <input type='range'>, <svg>, JS update logic, and CSS design tokens.")
    return True


def parse_and_validate_chunks(content_str: str) -> List[dict] | None:
    try:
        data = json.loads(content_str)
        chunks = data.get("chunks")
        if isinstance(chunks, list) and chunks:
            validated = []
            for c in chunks:
                if isinstance(c, dict) and "title" in c and "explanation" in c:
                    has_vis = bool(c.get("has_visual", False))
                    raw_html = c.get("visual_html")
                    clean_html = None
                    if has_vis and raw_html:
                        is_valid_sec, sanitized = validate_and_sanitize_visual_html(str(raw_html))
                        is_valid_qual = validate_visual_quality_check(sanitized) if is_valid_sec else False
                        if is_valid_sec and is_valid_qual:
                            clean_html = sanitized
                        else:
                            has_vis = False
                            clean_html = None

                    validated.append({
                        "title": str(c["title"]).strip(),
                        "explanation": str(c["explanation"]).strip(),
                        "has_visual": has_vis,
                        "visual_html": clean_html,
                    })
            if validated:
                return validated
    except Exception:
        pass
    return None


def validate_quiz_data_structure(data: dict) -> dict | None:
    try:
        if not isinstance(data, dict):
            return None
        phases = data.get("phases")
        if not isinstance(phases, dict):
            return None
        for phase_key in ["phase1", "phase2", "phase3"]:
            p_data = phases.get(phase_key)
            if not isinstance(p_data, dict):
                return None
            questions = p_data.get("questions")
            if not isinstance(questions, list) or not questions:
                return None
            for q in questions:
                if not isinstance(q, dict):
                    return None
                if not all(k in q for k in ["id", "question", "options", "correct_index", "explanation"]):
                    return None
                if not isinstance(q["options"], list) or len(q["options"]) != 4:
                    return None
                if q["correct_index"] not in [0, 1, 2, 3]:
                    return None
        return data
    except Exception:
        return None


_MOCK_PHYSICS_VISUAL = """<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
  <style>
    :root {
      --background: #FAF9F6;
      --surface: #FFFFFF;
      --primary: #2F5233;
      --accent: #E8A33D;
      --ink: #1C2826;
      --border: #E2E8F0;
    }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: var(--background); color: var(--ink); margin: 0; padding: 14px; box-sizing: border-box; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    .title { font-family: 'Space Grotesk', system-ui, sans-serif; font-size: 13px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em; }
    .controls { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
    .control-group { flex: 1; min-width: 140px; }
    label { font-size: 12px; font-weight: 700; color: var(--primary); display: block; margin-bottom: 4px; }
    input[type=range] { width: 100%; accent-color: var(--primary); cursor: pointer; }
    .actions { display: flex; gap: 8px; margin-top: 8px; }
    .btn { background: var(--primary); color: #FFFFFF; border: none; border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: 700; cursor: pointer; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
    .btn-accent { background: var(--accent); color: #1C2826; }
    .readout { display: flex; justify-content: space-between; align-items: center; background: #F1F5F9; border-radius: 8px; padding: 10px 14px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 700; margin-top: 12px; color: var(--primary); border: 1px solid var(--border); }
    svg { width: 100%; height: 120px; background: #F8FAFC; border-radius: 8px; border: 1px solid var(--border); }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <span class="title">Newton's Second Law Interactive Demo</span>
      <span style="font-size:11px; color:#64748B;">Formula: F = m · a</span>
    </div>
    <div class="controls">
      <div class="control-group">
        <label>Force (F): <span id="fVal">10</span> N</label>
        <input type="range" id="fRange" min="1" max="50" value="10">
      </div>
      <div class="control-group">
        <label>Mass (m): <span id="mVal">5</span> kg</label>
        <input type="range" id="mRange" min="1" max="20" value="5">
      </div>
    </div>
    <svg id="simSvg" viewBox="0 0 400 120">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#E8A33D"/>
        </marker>
      </defs>
      <line x1="20" y1="90" x2="380" y2="90" stroke="#94A3B8" stroke-width="2" />
      <rect id="box" x="40" y="50" width="40" height="40" rx="6" fill="#2F5233" />
      <text id="boxText" x="60" y="74" fill="#FFFFFF" font-size="11" font-weight="bold" text-anchor="middle">5kg</text>
      <line id="forceArrow" x1="80" y1="70" x2="130" y2="70" stroke="#E8A33D" stroke-width="3" marker-end="url(#arrow)" />
    </svg>
    <div class="actions">
      <button class="btn" id="pushBtn">Apply Push Force</button>
      <button class="btn btn-accent" id="resetBtn">Reset Demo</button>
    </div>
    <div class="readout">
      <span>Equation: a = F / m</span>
      <span>Acceleration (a): <span id="aVal">2.00</span> m/s²</span>
    </div>
  </div>
  <script>
    const fRange = document.getElementById('fRange');
    const mRange = document.getElementById('mRange');
    const fVal = document.getElementById('fVal');
    const mVal = document.getElementById('mVal');
    const aVal = document.getElementById('aVal');
    const box = document.getElementById('box');
    const boxText = document.getElementById('boxText');
    const forceArrow = document.getElementById('forceArrow');
    const pushBtn = document.getElementById('pushBtn');
    const resetBtn = document.getElementById('resetBtn');

    let posX = 40;
    let animId = null;

    function update() {
      const F = parseFloat(fRange.value);
      const m = parseFloat(mRange.value);
      const a = (F / m).toFixed(2);
      fVal.textContent = F;
      mVal.textContent = m;
      aVal.textContent = a;
      boxText.textContent = m + 'kg';
      const arrowLen = Math.min(120, 20 + F * 2.0);
      forceArrow.setAttribute('x1', posX + 40);
      forceArrow.setAttribute('x2', posX + 40 + arrowLen);
      box.setAttribute('x', posX);
      boxText.setAttribute('x', posX + 20);
    }

    function animate() {
      const F = parseFloat(fRange.value);
      const m = parseFloat(mRange.value);
      const a = F / m;
      if (posX < 300) {
        posX += Math.min(10, a * 0.8);
        update();
        animId = requestAnimationFrame(animate);
      }
    }

    pushBtn.addEventListener('click', () => {
      cancelAnimationFrame(animId);
      animate();
    });

    resetBtn.addEventListener('click', () => {
      cancelAnimationFrame(animId);
      posX = 40;
      update();
    });

    fRange.addEventListener('input', update);
    mRange.addEventListener('input', update);
    update();
  </script>
</body>
</html>"""


_MOCK_CHUNKS = [
    {
        "title": "Introduction & Fundamentals",
        "explanation": "Imagine opening a new textbook for the first time. The material lays out foundational principles in clear, simple terms.",
        "has_visual": False,
        "visual_html": None,
    },
    {
        "title": "Interactive STEM Simulation & Mechanics",
        "explanation": "Newton's Second Law states that force equals mass times acceleration (F = m * a). Adjust the force and mass sliders below to see how acceleration updates live in real time.",
        "has_visual": True,
        "visual_html": _MOCK_PHYSICS_VISUAL,
    },
    {
        "title": "Core Synthesis & Evaluation",
        "explanation": "By understanding these building blocks, you can apply them to solve complex problems independently.",
        "has_visual": False,
        "visual_html": None,
    },
]


async def call_groq_api_for_explanation(
    transcript_text: str,
    language_name: str = "English",
    career_goal: Optional[str] = None,
    previous_memories: Optional[List[str]] = None
) -> List[dict]:
    if not settings.groq_api_key:
        return _MOCK_CHUNKS

    goal_prompt = (
        f" The student's primary career goal is '{career_goal}'. Where relevant and natural, "
        "tailor real-world analogies, practical examples, and domain emphasis to align with this goal "
        "without forcing repetitive mentions."
        if career_goal else ""
    )

    memory_prompt = ""
    if previous_memories and len(previous_memories) > 0:
        memories_joined = "; ".join(previous_memories)
        memory_prompt = (
            f" The student has previously studied related topics: [{memories_joined}]. "
            "Where relevant and natural, connect concepts from these prior lessons to help the student "
            "build upon their existing foundation without forcing artificial references."
        )

    system_prompt = (
        "You are an expert AI educator. Break down the provided video transcript into "
        "digestible, storytelling-style explanation chunks for a first-time learner. "
        f"You MUST write all titles and explanations directly in {language_name}.{goal_prompt}{memory_prompt}\n\n"
        "FOR EACH CHUNK, EVALUATE VISUAL SUITABILITY:\n"
        "- Decide if an interactive visual simulation (HTML + inline SVG + vanilla JS with controls like sliders or buttons driving live readouts and animated SVG diagram attributes) WOULD MEANINGFULLY HELP teach this specific concept.\n"
        "- ONLY generate a visual for STEM, physics, math, engineering, algorithms, or data structure concepts where an interactive visual genuinely aids understanding (e.g. force + mass sliders driving a live acceleration readout and animated SVG box, or interactive step visualizer).\n"
        "- DO NOT force a visual on non-visualizable chunks (e.g. historical background, philosophical context, definitions, introductory summaries). For non-visual chunks, set 'has_visual': false and 'visual_html': null.\n\n"
        "FOR QUALIFYING CHUNKS (has_visual: true):\n"
        "- Generate a complete self-contained HTML string in 'visual_html'.\n"
        "- MANDATORY RULE: This output MUST contain at least one <input type=\"range\"> element for every adjustable variable in the concept. Static buttons are NOT an acceptable substitute for sliders. Output containing only buttons with no range input will be rejected.\n"
        "- MUST USE CAMPUSCIRCLE DESIGN TOKENS IN INLINE CSS:\n"
        "  :root { --background: #FAF9F6; --surface: #FFFFFF; --primary: #2F5233; --accent: #E8A33D; --ink: #1C2826; --border: #E2E8F0; }\n"
        "- MANDATORY TEXT SPACING & FORMATTING: Always place titles, formula labels, and readout values inside visually separate elements (e.g. separate <div> or <span> blocks with proper CSS margins). NEVER concatenate inline text without spaces (e.g. PROHIBITED: 'DemoFormula', 'FormulaReadout').\n"
        "- MUST MATCH THIS EXACT STRUCTURAL PATTERN:\n"
        "  1. Continuous range sliders (<input type='range'>) for every adjustable physical/mathematical variable.\n"
        "  2. An SVG diagram (<svg>) with dynamic attributes or vectors (e.g. moving box, changing arrows/colors).\n"
        "  3. A live formula readout box displaying exact mathematical equations and correct physical units (e.g. 'a = F / m', 'Acceleration (a): 2.00 m/s²', 'Force: 10 N', 'Mass: 5 kg'). NEVER label force/newtons as acceleration!\n"
        "  4. Optional push / action / reset buttons.\n"
        "  5. Plain vanilla JS update functions listening to 'input' events on range sliders.\n\n"
        "LITERAL WORKING REFERENCE HTML TEMPLATE TO STRUCTURALLY MATCH:\n"
        f"```html\n{_MOCK_PHYSICS_VISUAL}\n```\n\n"
        "Return a JSON object with a single top-level key 'chunks' — a list where each item has exact keys: 'title', 'explanation', 'has_visual' (boolean), and 'visual_html' (string or null)."
    )
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Explain the following transcript in storytelling chunks in {language_name}:\n\n{transcript_text[:12000]}"},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.5,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        for attempt in range(2):
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                content_text = res.json()["choices"][0]["message"]["content"]
                parsed = parse_and_validate_chunks(content_text)
                if parsed:
                    # Check if any chunk intended to have a visual was rejected by quality/security check
                    try:
                        raw_json_chunks = json.loads(content_text).get("chunks", [])
                    except Exception:
                        raw_json_chunks = []

                    needs_quality_retry = False
                    for idx, r_chunk in enumerate(raw_json_chunks):
                        if isinstance(r_chunk, dict) and r_chunk.get("has_visual"):
                            if idx < len(parsed) and not parsed[idx]["has_visual"]:
                                needs_quality_retry = True
                                break

                    if needs_quality_retry:
                        logger.warning(f"[VISUAL QUALITY RETRY] Attempt {attempt + 1} produced visual chunks that failed quality check (<input type='range'> missing). Triggering retry pass...")
                        if attempt == 1:
                            logger.warning("[VISUAL QUALITY REJECTED] Attempt 2 failed quality check. Setting has_visual=False for non-conforming chunks per quality contract.")
                    else:
                        logger.info(f"[VISUAL GENERATION SUCCESS] Attempt {attempt + 1} passed all security and quality checks with valid sliders and SVG.")

                    if not needs_quality_retry or attempt == 1:
                        return parsed

                    # On attempt 0 quality failure, append stricter reminder prompt and retry once
                    payload["messages"].append({"role": "assistant", "content": content_text})
                    payload["messages"].append({
                        "role": "user",
                        "content": (
                            "QUALITY CHECK FAILED: Your generated visual lacked continuous range sliders (<input type='range'>), "
                            "an <svg> diagram, or live JS event listeners. Please regenerate the JSON chunks following the "
                            "REFERENCE STRUCTURAL TEMPLATE with continuous sliders for all variables, an SVG diagram, formula readout, and correct physical units."
                        )
                    })

    raise HTTPException(status_code=422, detail="AI model failed to generate a structured explanation. Please try again.")


_MOCK_QUIZ = {
    "phases": {
        "phase1": {
            "name": "Recall", "description": "Test basic memory of core terms and definitions.",
            "questions": [
                {"id": "p1_q1", "question": "What is the primary subject of this topic?", "options": ["Foundational concepts", "Historical background", "Unverified theories", "Admin guidelines"], "correct_index": 0, "explanation": "The material focuses on foundational concepts.", "chunk_id": "chunk_0", "concept_category": "Fundamentals"},
                {"id": "p1_q2", "question": "Why are building blocks introduced early?", "options": ["To confuse learners", "To build a mental framework", "To meet length requirements", "To skip real examples"], "correct_index": 1, "explanation": "They provide a framework for applying concepts later.", "chunk_id": "chunk_0", "concept_category": "Fundamentals"},
                {"id": "p1_q3", "question": "How should key terms be approached?", "options": ["Memorize without context", "Ignore definitions", "Connect to real scenarios", "Rely on luck"], "correct_index": 2, "explanation": "Connecting terms to examples solidifies understanding.", "chunk_id": "chunk_0", "concept_category": "Fundamentals"},
                {"id": "p1_q4", "question": "What role do definitions play in learning?", "options": ["They slow progress", "They anchor understanding", "They are optional", "They complicate things"], "correct_index": 1, "explanation": "Definitions anchor understanding for advanced concepts.", "chunk_id": "chunk_0", "concept_category": "Fundamentals"},
                {"id": "p1_q5", "question": "Which learning approach is most effective?", "options": ["Passive reading only", "Active recall and practice", "Skipping fundamentals", "Relying on memorization"], "correct_index": 1, "explanation": "Active recall strengthens retention and understanding.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p1_q6", "question": "What is a prerequisite before advanced study?", "options": ["Mastering terminology", "Speed reading", "Ignoring basics", "Random exploration"], "correct_index": 0, "explanation": "Mastering terminology is essential before tackling advanced material.", "chunk_id": "chunk_0", "concept_category": "Fundamentals"},
                {"id": "p1_q7", "question": "How does structured learning differ from unstructured?", "options": ["It follows a logical sequence", "It is always faster", "It skips fundamentals", "It requires no effort"], "correct_index": 0, "explanation": "Structured learning builds concepts in a logical, progressive sequence.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p1_q8", "question": "What is the purpose of examples in explanations?", "options": ["To fill space", "To ground abstract ideas in reality", "To confuse learners", "To replace definitions"], "correct_index": 1, "explanation": "Examples ground abstract ideas in reality for better understanding.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p1_q9", "question": "Why is context important when learning terms?", "options": ["Context is irrelevant", "It helps retention and application", "It makes things harder", "It delays progress"], "correct_index": 1, "explanation": "Context helps retention and practical application of terms.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p1_q10", "question": "What distinguishes a core concept from a detail?", "options": ["Core concepts are foundational and recurring", "Details are more important", "There is no difference", "Core concepts are always simpler"], "correct_index": 0, "explanation": "Core concepts are foundational principles that recur throughout the topic.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
            ],
        },
        "phase2": {
            "name": "Application", "description": "Apply concepts to real-world scenarios and problems.",
            "questions": [
                {"id": "p2_q1", "question": "First step when hitting a bottleneck?", "options": ["Abandon", "Trace execution path", "Change random settings", "Blame dependencies"], "correct_index": 1, "explanation": "Tracing pinpoints the exact cause.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p2_q2", "question": "How does scenario framing help?", "options": ["Isolates variables", "Adds complexity", "Hides flaws", "Removes testing"], "correct_index": 0, "explanation": "It isolates variables and predicts outcomes.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p2_q3", "question": "Common implementation trade-off?", "options": ["Simplicity vs Scalability", "Color vs Font", "Users vs Location", "None"], "correct_index": 0, "explanation": "Engineers balance simplicity against scaling demands.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p2_q4", "question": "When should you optimize prematurely?", "options": ["Never, measure first", "Always, at the start", "Only on weekends", "When the code looks slow"], "correct_index": 0, "explanation": "Premature optimization wastes effort; always measure first.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p2_q5", "question": "How do you validate a proposed solution?", "options": ["Test against edge cases", "Trust intuition alone", "Skip testing", "Ask random people"], "correct_index": 0, "explanation": "Testing against edge cases validates solution correctness.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p2_q6", "question": "What makes debugging systematic?", "options": ["Reproducing, isolating, then fixing", "Randomly changing code", "Restarting the server", "Ignoring error logs"], "correct_index": 0, "explanation": "Systematic debugging follows reproduce, isolate, fix methodology.", "chunk_id": "chunk_1", "concept_category": "Application"},
                {"id": "p2_q7", "question": "When is abstraction beneficial?", "options": ["When it hides unnecessary complexity", "Always, without exception", "Never", "Only in documentation"], "correct_index": 0, "explanation": "Abstraction is beneficial when it simplifies by hiding irrelevant complexity.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p2_q8", "question": "How should you handle conflicting requirements?", "options": ["Prioritize by impact and feasibility", "Implement all at once", "Ignore some", "Choose randomly"], "correct_index": 0, "explanation": "Prioritizing by impact and feasibility resolves conflicting requirements.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p2_q9", "question": "What indicates a well-designed component?", "options": ["Single responsibility and clear interfaces", "Maximum features", "Complex internals", "Tight coupling"], "correct_index": 0, "explanation": "Good components have a single responsibility and clear interfaces.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p2_q10", "question": "Why is iterative development preferred?", "options": ["Enables early feedback and course correction", "It is slower", "It avoids planning", "It requires no testing"], "correct_index": 0, "explanation": "Iterative development enables early feedback loops and timely correction.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
            ],
        },
        "phase3": {
            "name": "Synthesis", "description": "Synthesise and evaluate complex systems and trade-offs.",
            "questions": [
                {"id": "p3_q1", "question": "How do principles ensure reliability?", "options": ["Modular boundaries + verification", "Manual inspection", "Ignoring edge cases", "Hardcoding parameters"], "correct_index": 0, "explanation": "Modular design and verification ensure resilience.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q2", "question": "Ultimate mastery goal?", "options": ["Pass one test", "Design and adapt solutions", "Copy templates", "Avoid discussions"], "correct_index": 1, "explanation": "Mastery means synthesising knowledge to solve novel problems.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q3", "question": "Paramount architectural criterion?", "options": ["Social media popularity", "Domain fit and maintainability", "Fewest code lines", "Arbitrary preference"], "correct_index": 1, "explanation": "Maintainability and domain alignment drive the best choice.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q4", "question": "How do you evaluate competing approaches?", "options": ["Compare trade-offs against constraints", "Pick the newest one", "Choose the simplest always", "Flip a coin"], "correct_index": 0, "explanation": "Evaluating trade-offs against domain constraints yields the best approach.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q5", "question": "What makes knowledge transfer effective?", "options": ["Clear documentation and shared mental models", "Verbal instructions only", "No documentation needed", "Copy-pasting code"], "correct_index": 0, "explanation": "Clear documentation and shared mental models enable effective knowledge transfer.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q6", "question": "When should you break a system into microservices?", "options": ["When independent scaling and deployment are needed", "Always, for every project", "Never", "When the team is small"], "correct_index": 0, "explanation": "Microservices are justified when components need independent scaling.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q7", "question": "How does feedback loop quality affect outcomes?", "options": ["Faster, more accurate loops lead to better outcomes", "Loops are unnecessary", "Slower loops are better", "Feedback is only for managers"], "correct_index": 0, "explanation": "Faster and more accurate feedback loops consistently produce better outcomes.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q8", "question": "What is the risk of over-engineering?", "options": ["Wasted effort on unused abstractions", "Better code quality", "No risk at all", "Faster delivery"], "correct_index": 0, "explanation": "Over-engineering wastes effort on abstractions that may never be needed.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q9", "question": "How do you measure learning effectiveness?", "options": ["Ability to apply concepts to novel problems", "Pages read", "Time spent studying", "Number of certificates"], "correct_index": 0, "explanation": "True effectiveness is measured by applying concepts to novel, unseen problems.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
                {"id": "p3_q10", "question": "What integrates all phases of understanding?", "options": ["Connecting recall, application, and critical evaluation", "Memorization alone", "Skipping fundamentals", "Avoiding challenges"], "correct_index": 0, "explanation": "Full understanding connects recall, practical application, and critical evaluation.", "chunk_id": "chunk_2", "concept_category": "Synthesis"},
            ],
        },
    }
}


async def call_groq_api_for_quiz(video_title: str, explanation_text: str, language_name: str = "English") -> dict:
    if not settings.groq_api_key:
        return _MOCK_QUIZ

    system_prompt = (
        "You are an expert AI assessment designer. Create a 3-phase multiple-choice quiz. "
        f"You MUST write all questions, options, and explanations directly in {language_name}. "
        "Return JSON with top-level key 'phases' containing 'phase1', 'phase2', 'phase3'. "
        "Each phase has 'name', 'description', and 'questions' (list of exactly 10 questions). "
        "Each question MUST contain:\n"
        "- 'id': string (e.g. p1_q1 through p1_q10)\n"
        "- 'question': string\n"
        "- 'options': list of 4 strings\n"
        "- 'correct_index': integer (0-3)\n"
        "- 'explanation': string explanation\n"
        "- 'chunk_id': string (e.g. 'chunk_0', 'chunk_1', 'chunk_2')\n"
        "- 'concept_category': string (a broad tag like 'System Design', 'Recursion', 'Fundamentals', 'Algorithms')."
    )
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Quiz in {language_name} for '{video_title}':\n\n{explanation_text[:12000]}"},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
    }

    async with httpx.AsyncClient(timeout=35.0) as client:
        for _ in range(2):
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                content = res.json()["choices"][0]["message"]["content"]
                parsed = json.loads(content) if isinstance(content, str) else content
                validated = validate_quiz_data_structure(parsed)
                if validated:
                    return validated

    raise HTTPException(status_code=422, detail="Failed to generate a valid quiz. Please try again.")


async def call_groq_api_for_remediation(video_title: str, concept_title: str, original_explanation: str, language_name: str = "English") -> dict:
    if not settings.groq_api_key:
        return {
            "re_explanation": (
                f"Let me explain '{concept_title}' with a fresh perspective! "
                "Think of it like building a bridge: instead of looking at the whole structure at once, "
                "you focus on reinforcing one key support pillar."
            ),
            "analogy": "Bridge support pillar analogy"
        }

    system_prompt = (
        "You are an empathetic AI tutor providing targeted remediation for a student who missed a quiz question. "
        f"Provide a SHORT, focused re-explanation of JUST this ONE concept directly in {language_name}. Use a DIFFERENT phrasing or fresh analogy. "
        "Return JSON with two string keys: 're_explanation' (2-3 encouraging sentences) and 'analogy' (short title of the analogy used)."
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    f"Video Topic: '{video_title}'\n"
                    f"Concept to Remediate: '{concept_title}'\n"
                    f"Original Explanation: {original_explanation[:2000]}\n\n"
                    f"Provide a targeted, fresh micro-explanation and analogy in {language_name}."
                )
            },
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.6,
    }

    async with httpx.AsyncClient(timeout=25.0) as client:
        res = await client.post(url, headers=headers, json=payload)
        if res.status_code == 200:
            content = res.json()["choices"][0]["message"]["content"]
            try:
                parsed = json.loads(content) if isinstance(content, str) else content
                if isinstance(parsed, dict) and "re_explanation" in parsed:
                    return {
                        "re_explanation": str(parsed.get("re_explanation", "")).strip(),
                        "analogy": str(parsed.get("analogy", "")).strip() or None
                    }
            except Exception:
                pass

    return {
        "re_explanation": (
            f"Let's break down '{concept_title}' again! "
            "Focus on the underlying core rule: each component has a specific job."
        ),
        "analogy": "Input-output transformation model"
    }


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/extract", response_model=ExtractResponse, status_code=200, summary="Extract transcript from YouTube URL")
async def extract_youtube_transcript(
    payload: ExtractRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = uuid.UUID(current_user["user_id"])

    video_id = extract_video_id(payload.youtube_url)
    if not video_id:
        raise HTTPException(400, "Invalid YouTube URL.")

    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    count = (await db.execute(
        select(func.count(LearnExtractionLog.id))
        .where(LearnExtractionLog.user_id == user_uuid, LearnExtractionLog.created_at >= cutoff)
    )).scalar_one() or 0

    if count >= EXTRACTION_DAILY_LIMIT:
        raise HTTPException(429, f"Daily limit of {EXTRACTION_DAILY_LIMIT} extractions reached.")

    try:
        raw = await get_transcript_with_fallback(video_id)
    except TranscriptsDisabled:
        raise HTTPException(400, "Captions are disabled for this video.")
    except NoTranscriptFound:
        raise HTTPException(404, "No transcript found for this video.")
    except VideoUnavailable:
        raise HTTPException(404, "This video is unavailable or private.")

    segments = [
        TranscriptSegment(
            text=item.get("text", "").replace("\n", " ").strip(),
            start=round(float(item.get("start", 0)), 2),
            duration=round(float(item.get("duration", 0)), 2),
        )
        for item in raw
    ]
    full_text = " ".join(s.text for s in segments)
    duration = int(sum(s.duration for s in segments))
    title = await fetch_video_title(video_id)

    db.add(LearnExtractionLog(user_id=user_uuid, video_id=video_id))
    await db.commit()

    return ExtractResponse(
        video_id=video_id,
        youtube_url=f"https://www.youtube.com/watch?v={video_id}",
        title=title or f"YouTube Video ({video_id})",
        transcript=full_text,
        duration_seconds=duration,
        segments_count=len(segments),
        segments=segments,
        daily_extractions_remaining=max(0, EXTRACTION_DAILY_LIMIT - count - 1),
    )


@router.post("/explain", response_model=ExplainResponse, status_code=200, summary="Generate AI explanation chunks in target language")
async def explain_youtube_transcript(
    payload: ExplainRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = uuid.UUID(current_user["user_id"])

    target_lang = payload.language.strip().lower() if payload.language else "en"
    if target_lang not in SUPPORTED_LANGUAGES:
        target_lang = "en"
    lang_name = SUPPORTED_LANGUAGES.get(target_lang, "English")

    video_id = extract_video_id(payload.youtube_url) if payload.youtube_url else None
    if not video_id:
        video_id = f"custom_{uuid.uuid4().hex[:10]}"

    # Cache lookup MUST check (video_id, language) pair!
    cached_session = None
    if not video_id.startswith("custom_"):
        res = await db.execute(
            select(LearningSession)
            .where(
                LearningSession.video_id == video_id,
                LearningSession.language == target_lang
            )
            .order_by(LearningSession.created_at.desc())
        )
        cached_session = res.scalars().first()

    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    daily_count = (await db.execute(
        select(func.count(LearningSession.id))
        .where(LearningSession.user_id == user_uuid, LearningSession.created_at >= cutoff)
    )).scalar_one() or 0

    if cached_session:
        await update_profile_on_explanation(db=db, user_id=user_uuid, language=cached_session.language)
        raw_chunks = cached_session.explanation_chunks.get("chunks", [])
        return ExplainResponse(
            session_id=str(cached_session.id),
            video_id=video_id,
            video_title=cached_session.video_title,
            language=cached_session.language,
            chunks=[
                ExplanationChunk(
                    title=c["title"],
                    explanation=c["explanation"],
                    has_visual=bool(c.get("has_visual", False)),
                    visual_html=c.get("visual_html"),
                )
                for c in raw_chunks
            ],
            is_cached=True,
            daily_explanations_remaining=max(0, EXPLAIN_DAILY_LIMIT - daily_count),
        )

    if daily_count >= EXPLAIN_DAILY_LIMIT:
        raise HTTPException(429, f"Daily explanation limit of {EXPLAIN_DAILY_LIMIT} reached.")

    transcript_text = payload.transcript.strip() if payload.transcript else None
    video_title = (
        (await fetch_video_title(video_id) if not video_id.startswith("custom_") else None)
        or "Custom Learning Topic"
    )

    if not transcript_text:
        try:
            raw = await get_transcript_with_fallback(video_id)
            transcript_text = " ".join(item.get("text", "").replace("\n", " ").strip() for item in raw)
        except TranscriptsDisabled:
            raise HTTPException(400, "Captions are disabled for this video.")
        except NoTranscriptFound:
            raise HTTPException(404, "No transcript found for this video.")
        except VideoUnavailable:
            raise HTTPException(404, "This video is unavailable.")

    profile = await get_or_create_learning_profile(db=db, user_id=user_uuid)
    previous_memories = await get_relevant_memories_for_topic(
        db=db,
        user_id=user_uuid,
        current_topic_title=video_title,
        limit=3
    )

    chunks_data = await call_groq_api_for_explanation(
        transcript_text,
        language_name=lang_name,
        career_goal=profile.career_goal,
        previous_memories=previous_memories
    )

    session = LearningSession(
        user_id=user_uuid,
        video_id=video_id,
        youtube_url=payload.youtube_url or f"https://www.youtube.com/watch?v={video_id}",
        video_title=video_title,
        transcript=transcript_text,
        language=target_lang,
        explanation_chunks={"chunks": chunks_data},
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # Index learning memory snapshot
    await create_or_update_memory_from_session(db=db, session=session)

    await update_profile_on_explanation(db=db, user_id=user_uuid, language=target_lang)

    return ExplainResponse(
        session_id=str(session.id),
        video_id=video_id,
        video_title=video_title,
        language=session.language,
        chunks=[
            ExplanationChunk(
                title=c["title"],
                explanation=c["explanation"],
                has_visual=bool(c.get("has_visual", False)),
                visual_html=c.get("visual_html"),
            )
            for c in chunks_data
        ],
        is_cached=False,
        daily_explanations_remaining=max(0, EXPLAIN_DAILY_LIMIT - daily_count - 1),
    )


def sanitize_phase_questions(phase_dict: dict) -> List[QuizQuestionOut]:
    return [
        QuizQuestionOut(
            id=q["id"],
            question=q["question"],
            options=q["options"],
            chunk_id=q.get("chunk_id", "chunk_0"),
            concept_category=q.get("concept_category", "General Concept")
        )
        for q in phase_dict.get("questions", [])
    ]


@router.post("/{session_id}/quiz", response_model=QuizSessionOut, status_code=200, summary="Get/generate 3-phase quiz in session language")
async def get_or_create_quiz(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(404, "Learning session not found.")

    res = await db.execute(select(LearningSession).where(LearningSession.id == session_uuid))
    session = res.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Learning session not found.")

    lang_name = SUPPORTED_LANGUAGES.get(session.language, "English")

    if not session.quiz_data:
        explanation_text = " ".join(c["explanation"] for c in session.explanation_chunks.get("chunks", []))
        session.quiz_data = await call_groq_api_for_quiz(session.video_title, explanation_text or session.transcript, language_name=lang_name)
        session.user_progress = {
            "current_phase": 1, "phase1_passed": False,
            "phase2_passed": False, "phase3_passed": False, "is_completed": False,
        }
        db.add(session)
        await db.commit()
        await db.refresh(session)

    progress = session.user_progress or {
        "current_phase": 1, "phase1_passed": False,
        "phase2_passed": False, "phase3_passed": False, "is_completed": False,
    }
    phases_data = session.quiz_data.get("phases", {})
    p1_raw, p2_raw, p3_raw = phases_data.get("phase1", {}), phases_data.get("phase2", {}), phases_data.get("phase3", {})

    p1_out = QuizPhaseOut(
        phase=1, name=p1_raw.get("name", "Recall"),
        description=p1_raw.get("description", "Recall core terms"),
        is_unlocked=True, is_passed=bool(progress.get("phase1_passed")),
        questions=sanitize_phase_questions(p1_raw),
    )
    p2_out = QuizPhaseOut(
        phase=2, name=p2_raw.get("name", "Application"),
        description=p2_raw.get("description", "Apply concepts"),
        is_unlocked=bool(progress.get("phase1_passed")),
        is_passed=bool(progress.get("phase2_passed")),
        questions=sanitize_phase_questions(p2_raw) if progress.get("phase1_passed") else [],
    ) if progress.get("phase1_passed") else None
    p3_out = QuizPhaseOut(
        phase=3, name=p3_raw.get("name", "Synthesis"),
        description=p3_raw.get("description", "Synthesise ideas"),
        is_unlocked=bool(progress.get("phase2_passed")),
        is_passed=bool(progress.get("phase3_passed")),
        questions=sanitize_phase_questions(p3_raw) if progress.get("phase2_passed") else [],
    ) if progress.get("phase2_passed") else None

    return QuizSessionOut(
        session_id=str(session.id), video_id=session.video_id,
        video_title=session.video_title,
        language=session.language,
        current_unlocked_phase=progress.get("current_phase", 1),
        is_completed=bool(progress.get("is_completed")),
        phase1=p1_out, phase2=p2_out, phase3=p3_out,
    )


@router.post("/{session_id}/quiz/{phase}/submit", response_model=QuizSubmitResponse, status_code=200, summary="Submit quiz phase answers")
async def submit_quiz_phase(
    session_id: str,
    phase: int,
    payload: QuizSubmitRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if phase not in [1, 2, 3]:
        raise HTTPException(400, "Phase must be 1, 2, or 3.")
    try:
        session_uuid = uuid.UUID(session_id)
        user_uuid = uuid.UUID(current_user["user_id"])
    except ValueError:
        raise HTTPException(404, "Learning session not found.")

    res = await db.execute(select(LearningSession).where(LearningSession.id == session_uuid))
    session = res.scalar_one_or_none()
    if not session or not session.quiz_data:
        raise HTTPException(404, "Quiz session not found.")

    progress = session.user_progress or {
        "current_phase": 1, "phase1_passed": False,
        "phase2_passed": False, "phase3_passed": False, "is_completed": False,
    }
    if phase == 2 and not progress.get("phase1_passed"):
        raise HTTPException(400, "Pass Phase 1 before attempting Phase 2.")
    if phase == 3 and not progress.get("phase2_passed"):
        raise HTTPException(400, "Pass Phase 2 before attempting Phase 3.")

    questions = session.quiz_data.get("phases", {}).get(f"phase{phase}", {}).get("questions", [])
    if not questions:
        raise HTTPException(400, f"No questions for phase {phase}.")

    correct_count = 0
    details: List[QuestionResultDetail] = []
    failed_chunk_set = set()

    for q in questions:
        q_id, correct_idx = q["id"], q["correct_index"]
        q_chunk_id = q.get("chunk_id", "chunk_0")
        q_concept_cat = q.get("concept_category", "General Concept")
        user_idx = payload.answers.get(q_id, -1)
        is_correct = (user_idx == correct_idx)

        if is_correct:
            correct_count += 1
        else:
            failed_chunk_set.add(q_chunk_id)
            gap_stmt = select(UserConceptGap).where(
                UserConceptGap.user_id == user_uuid,
                UserConceptGap.concept_category == q_concept_cat
            )
            gap_res = await db.execute(gap_stmt)
            existing_gap = gap_res.scalar_one_or_none()
            if existing_gap:
                existing_gap.miss_count += 1
                existing_gap.last_seen_at = datetime.now(timezone.utc)
                db.add(existing_gap)
            else:
                new_gap = UserConceptGap(
                    user_id=user_uuid,
                    concept_category=q_concept_cat,
                    miss_count=1
                )
                db.add(new_gap)

    score = round(correct_count / len(questions) * 100.0, 1)
    passed = score >= 70.0
    next_unlocked = None

    if passed:
        updated_progress = dict(progress)
        if phase == 1:
            updated_progress["phase1_passed"] = True
            updated_progress["current_phase"] = max(updated_progress.get("current_phase", 1), 2)
            next_unlocked = 2
        elif phase == 2:
            updated_progress["phase2_passed"] = True
            updated_progress["current_phase"] = max(updated_progress.get("current_phase", 1), 3)
            next_unlocked = 3
        elif phase == 3:
            updated_progress["phase3_passed"] = True
            updated_progress["is_completed"] = True
        
        session.user_progress = updated_progress
        flag_modified(session, "user_progress")
        db.add(session)

    await db.commit()
    await db.refresh(session)

    # Automatically update persistent StudentLearningProfile
    await update_profile_on_quiz_submission(
        db=db,
        user_id=user_uuid,
        score_percent=score,
        phase=phase,
        passed=passed,
        is_session_completed=bool(session.user_progress.get("is_completed"))
    )

    # Automatically update UserLearningMemory with latest quiz performance & mastery
    await create_or_update_memory_from_session(db=db, session=session)

    chunks = session.explanation_chunks.get("chunks", [])

    for q in questions:
        q_chunk_id = q.get("chunk_id", "chunk_0")
        q_concept_cat = q.get("concept_category", "General Concept")
        concept_title = q_concept_cat
        if q_chunk_id.startswith("chunk_"):
            try:
                c_idx = int(q_chunk_id.replace("chunk_", ""))
                if 0 <= c_idx < len(chunks):
                    concept_title = chunks[c_idx].get("title", q_concept_cat)
            except ValueError:
                pass

        user_idx = payload.answers.get(q["id"], -1)
        details.append(QuestionResultDetail(
            question_id=q["id"],
            user_index=user_idx,
            correct_index=q["correct_index"],
            is_correct=(user_idx == q["correct_index"]),
            explanation=q.get("explanation", ""),
            chunk_id=q_chunk_id,
            concept_title=concept_title,
            concept_category=q_concept_cat
        ))

    return QuizSubmitResponse(
        phase=phase, passed=passed, score_percent=score,
        correct_count=correct_count, total_questions=len(questions),
        passing_threshold_percent=70.0, next_phase_unlocked=next_unlocked,
        is_session_completed=bool(session.user_progress.get("is_completed")),
        details=details,
        failed_chunk_ids=list(failed_chunk_set)
    )


@router.post("/{session_id}/remediate", response_model=RemediateResponse, status_code=200, summary="Generate targeted concept micro-explanation")
async def remediate_concept_chunk(
    session_id: str,
    payload: RemediateRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(404, "Learning session not found.")

    res = await db.execute(select(LearningSession).where(LearningSession.id == session_uuid))
    session = res.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Learning session not found.")

    lang_name = SUPPORTED_LANGUAGES.get(session.language, "English")
    chunks = session.explanation_chunks.get("chunks", [])
    if not chunks:
        raise HTTPException(400, "No explanation chunks available.")

    target_chunk = None
    target_chunk_id = payload.chunk_id.strip()

    if target_chunk_id.startswith("chunk_"):
        try:
            idx = int(target_chunk_id.replace("chunk_", ""))
            if 0 <= idx < len(chunks):
                target_chunk = chunks[idx]
        except ValueError:
            pass

    if not target_chunk:
        for idx, c in enumerate(chunks):
            if c.get("title", "").strip().lower() == target_chunk_id.lower():
                target_chunk = c
                target_chunk_id = f"chunk_{idx}"
                break

    if not target_chunk:
        target_chunk = chunks[0]
        target_chunk_id = "chunk_0"

    concept_title = target_chunk.get("title", "Concept Remediation")
    original_exp = target_chunk.get("explanation", "")

    remediation_cache = session.remediation_data or {}
    if target_chunk_id in remediation_cache:
        cached_item = remediation_cache[target_chunk_id]
        return RemediateResponse(
            session_id=str(session.id),
            chunk_id=target_chunk_id,
            concept_title=concept_title,
            re_explanation=cached_item.get("re_explanation", ""),
            analogy=cached_item.get("analogy"),
            is_cached=True,
        )

    remediation_result = await call_groq_api_for_remediation(
        session.video_title, concept_title, original_exp, language_name=lang_name
    )

    remediation_cache[target_chunk_id] = remediation_result
    session.remediation_data = dict(remediation_cache)
    flag_modified(session, "remediation_data")
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return RemediateResponse(
        session_id=str(session.id),
        chunk_id=target_chunk_id,
        concept_title=concept_title,
        re_explanation=remediation_result["re_explanation"],
        analogy=remediation_result.get("analogy"),
        is_cached=False,
    )


@router.get("/me/gaps", response_model=UserGapsResponse, status_code=200, summary="Get student's recurring weak concept areas")
async def get_user_concept_gaps(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = uuid.UUID(current_user["user_id"])
    stmt = (
        select(UserConceptGap)
        .where(UserConceptGap.user_id == user_uuid)
        .order_by(UserConceptGap.miss_count.desc(), UserConceptGap.last_seen_at.desc())
    )
    res = await db.execute(stmt)
    gaps = res.scalars().all()

    gap_models = [
        UserConceptGapOut(
            concept_category=g.concept_category,
            miss_count=g.miss_count,
            last_seen_at=g.last_seen_at
        )
        for g in gaps
    ]

    return UserGapsResponse(
        total_gaps_count=len(gap_models),
        gaps=gap_models
    )


@router.get(
    "/me/profile",
    response_model=StudentLearningProfileOut,
    status_code=status.HTTP_200_OK,
    summary="Get current student's persistent learning profile and long-term statistics"
)
async def get_my_learning_profile(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = uuid.UUID(current_user["user_id"])
    profile = await get_or_create_learning_profile(db=db, user_id=user_uuid)
    return profile


@router.patch(
    "/me/career-goal",
    response_model=StudentLearningProfileOut,
    status_code=status.HTTP_200_OK,
    summary="Update current student's primary career learning goal"
)
async def patch_my_career_goal(
    payload: CareerGoalUpdatePayload,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = uuid.UUID(current_user["user_id"])
    profile = await update_career_goal(db=db, user_id=user_uuid, career_goal=payload.career_goal)
    return profile


@router.get(
    "/me/mentor/pre-session",
    response_model=PreSessionMentorOut,
    status_code=status.HTTP_200_OK,
    summary="Get personalized pre-session guidance from Reva AI Mentor"
)
async def get_presession_mentor_guidance(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = uuid.UUID(current_user["user_id"])
    return await generate_presession_mentor_guidance(db=db, user_id=user_uuid)


@router.post(
    "/{session_id}/mentor/post-session",
    response_model=PostSessionMentorOut,
    status_code=status.HTTP_200_OK,
    summary="Get personalized post-session feedback summary from Reva AI Mentor"
)
async def get_postsession_mentor_summary(
    session_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = uuid.UUID(current_user["user_id"])
    return await generate_postsession_mentor_summary(db=db, user_id=user_uuid, session_id=session_id)


@router.get(
    "/me/dashboard",
    response_model=LearningDashboardOut,
    status_code=status.HTTP_200_OK,
    summary="Get aggregated learning dashboard for the current student",
)
async def get_learning_dashboard_endpoint(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns a full learning dashboard aggregated from:
    - StudentLearningProfile (stats, concepts)
    - UserLearningMemory (subject mastery, recent activity)
    - UserConceptGap (top gaps)
    No AI calls are made — safe to call on every page load.
    """
    user_uuid = uuid.UUID(current_user["user_id"])
    return await get_learning_dashboard(db=db, user_id=user_uuid)


# ── Weekly Learning Report endpoints ────────────────────────────────────────

@router.get(
    "/me/reports",
    response_model=List[WeeklyLearningReportOut],
    status_code=status.HTTP_200_OK,
    summary="List all weekly learning reports for the current student",
)
async def list_my_reports(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns all stored weekly reports, newest first (max 12 = 3 months)."""
    user_uuid = uuid.UUID(current_user["user_id"])
    return await list_reports_for_user(db=db, user_id=user_uuid)


@router.get(
    "/me/reports/current",
    response_model=WeeklyLearningReportOut,
    status_code=status.HTTP_200_OK,
    summary="Get or generate the current week's learning report",
)
async def get_current_week_report(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the current week's report if it exists, otherwise generates it
    by aggregating this week's learning data and (optionally) calling Groq
    for a personalized narrative. Safe to call repeatedly — generates once.
    """
    user_uuid = uuid.UUID(current_user["user_id"])
    return await get_or_generate_current_week_report(db=db, user_id=user_uuid)


@router.get(
    "/me/reports/{report_id}",
    response_model=WeeklyLearningReportOut,
    status_code=status.HTTP_200_OK,
    summary="Get a specific weekly learning report",
)
async def get_specific_report(
    report_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_uuid = uuid.UUID(current_user["user_id"])
    report = await get_report_by_id(db=db, user_id=user_uuid, report_id=report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    return report


@router.get(
    "/{session_id}/chat/messages",
    response_model=List[LessonChatMessageOut],
    status_code=status.HTTP_200_OK,
    summary="Get chat history for active lesson"
)
async def get_lesson_chat_history(
    session_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    from src.services.lesson_chat_service import get_lesson_chat_messages
    try:
        return await get_lesson_chat_messages(db=db, session_id=session_id, user_id=user_uuid)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post(
    "/{session_id}/chat/messages",
    response_model=LessonChatMessageOut,
    status_code=status.HTTP_200_OK,
    summary="Send follow-up question in active lesson chat"
)
async def send_lesson_chat_followup(
    session_id: uuid.UUID,
    payload: LessonChatSendIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_uuid = uuid.UUID(current_user["user_id"])
    from src.services.lesson_chat_service import post_lesson_chat_message
    try:
        return await post_lesson_chat_message(
            db=db,
            session_id=session_id,
            user_id=user_uuid,
            user_text=payload.message
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ── Socratic Discussion endpoints ───────────────────────────────────────────

from src.services.socratic_discussion_service import (
    get_socratic_messages,
    start_socratic_discussion,
    respond_to_socratic,
)


@router.get(
    "/{session_id}/socratic/messages",
    response_model=SocraticStatusOut,
    status_code=status.HTTP_200_OK,
    summary="Get Socratic discussion status and message history for a session",
)
async def get_socratic_status(
    session_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns all Socratic discussion messages and whether the discussion has concluded."""
    user_uuid = uuid.UUID(current_user["user_id"])
    from sqlalchemy import select as sa_select
    from src.models.learning_session import LearningSession
    try:
        messages = await get_socratic_messages(db=db, session_id=session_id, user_id=user_uuid)
        # Fetch session for conclusion status
        sess_res = await db.execute(
            sa_select(LearningSession).where(
                LearningSession.id == session_id,
                LearningSession.user_id == user_uuid
            )
        )
        sess = sess_res.scalar_one_or_none()
        return SocraticStatusOut(
            session_id=session_id,
            is_concluded=sess.socratic_concluded if sess else False,
            understanding_level=sess.socratic_understanding_level if sess else None,
            exchange_count=sum(1 for m in messages if m.sender == "user"),
            messages=messages,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post(
    "/{session_id}/socratic/start",
    response_model=SocraticMessageOut,
    status_code=status.HTTP_201_CREATED,
    summary="Start the Socratic discussion — Reva generates the first question",
)
async def start_socratic(
    session_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generates and stores Reva's first Socratic question for this session.
    Idempotent — calling it again returns the existing first message.
    """
    user_uuid = uuid.UUID(current_user["user_id"])
    try:
        msg = await start_socratic_discussion(db=db, session_id=session_id, user_id=user_uuid)
        return msg
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post(
    "/{session_id}/socratic/respond",
    response_model=SocraticRespondOut,
    status_code=status.HTTP_200_OK,
    summary="Send student response in Socratic discussion",
)
async def respond_socratic(
    session_id: uuid.UUID,
    payload: SocraticRespondIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Processes the student's reply. Reva evaluates understanding, may ask a
    follow-up question or conclude naturally. On conclusion, updates
    StudentLearningProfile and UserLearningMemory.
    """
    user_uuid = uuid.UUID(current_user["user_id"])
    try:
        result = await respond_to_socratic(
            db=db,
            session_id=session_id,
            user_id=user_uuid,
            student_text=payload.student_text,
        )
        return SocraticRespondOut(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
