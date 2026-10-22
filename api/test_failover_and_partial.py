"""Tests verifying Ask 10s failover, backup model 429 single retry,
Explain concurrency limits with partial results kept, and 'Busy. Try again.' error messaging.
"""

import json
import time
from unittest.mock import MagicMock, patch
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from google.genai import errors

from main import app, IP_REQUESTS
from models import ReaderResponse, ReaderSection, ReaderSectionValue, AskResponse
from errors import make_error_response, ERROR_MESSAGES
from reader import (
    call_gemini_with_retry,
    read_document,
    ask_document,
    GeminiServiceError,
    ASK_TIMEOUT,
    ASK_FALLBACK_TIMEOUT,
    FALLBACK_MODEL_ID,
    EXPLAIN_CHUNK_WORKERS,
    is_busy_error,
)


@pytest.fixture
def client():
    IP_REQUESTS.clear()
    return TestClient(app)


# ---------------------------------------------------------------------------
# 1. Ask switching to gemini-2.5-flash after about 10 seconds (slow model)
# ---------------------------------------------------------------------------

def test_ask_timeout_constants():
    """Verify ASK_TIMEOUT is configured to ~10s and backup timeout to ~14s."""
    assert 8.0 <= ASK_TIMEOUT <= 12.0
    assert 12.0 <= ASK_FALLBACK_TIMEOUT <= 18.0
    assert ASK_TIMEOUT + ASK_FALLBACK_TIMEOUT <= 30.0


def test_ask_failover_after_10s_slow_primary():
    """Simulate a slow primary model that times out after 10s.
    Verify fast failover to gemini-2.5-flash with proper timeout configuration.
    """
    mock_client = MagicMock()
    recorded_calls = []

    def mock_generate_content(model, contents, config=None):
        timeout_ms = None
        if config and hasattr(config, "http_options") and config.http_options:
            timeout_ms = config.http_options.timeout
        recorded_calls.append({"model": model, "timeout_ms": timeout_ms})

        if model != FALLBACK_MODEL_ID:
            # Simulate primary model slow / timeout
            raise errors.ClientError(408, {"error": {"message": "Request timed out after 10000ms"}})

        # Fallback model succeeds
        resp = MagicMock()
        resp.text = json.dumps({
            "answer": "Life certificate is due by 30 November.",
            "points": ["Submit online or at bank"],
            "answered_from": "document",
            "quote": "Due date: 30 November 2026",
            "page": 1,
            "evidence": "found",
            "language": "en",
        })
        resp.parsed = None
        resp.usage_metadata = MagicMock(prompt_token_count=100, candidates_token_count=50)
        return resp

    mock_client.models.generate_content.side_effect = mock_generate_content

    with patch("reader.get_client", return_value=mock_client), \
         patch("time.sleep", return_value=None):
        result = ask_document(
            question="When is my certificate due?",
            lang="en",
            result_json='{"title": "Pension Notice"}',
            pdf_pages_text=["Due date: 30 November 2026"],
            deadline=time.time() + 30.0,
        )

    assert len(recorded_calls) == 2
    # First call was to primary model with ~10s timeout (10000 ms)
    assert recorded_calls[0]["model"] != FALLBACK_MODEL_ID
    assert recorded_calls[0]["timeout_ms"] == int(ASK_TIMEOUT * 1000)

    # Second call was to fallback model with ~14s timeout (14000 ms)
    assert recorded_calls[1]["model"] == FALLBACK_MODEL_ID
    assert recorded_calls[1]["timeout_ms"] == int(ASK_FALLBACK_TIMEOUT * 1000)

    # Result returned is from fallback model
    assert "30 November" in result.answer
    assert result.answered_from == "document"


def test_ask_endpoint_failover_on_slow_primary(client):
    """Integration test: /api/ask fails over to backup model when primary is slow."""
    mock_client = MagicMock()
    models_called = []

    def mock_generate(model, contents, config=None):
        models_called.append(model)
        if len(models_called) == 1:
            # Slow primary model times out
            raise errors.ClientError(408, {"error": {"message": "Deadline exceeded"}})
        # Backup model succeeds
        resp = MagicMock()
        resp.text = json.dumps({
            "answer": "Your fine is 500 rupees.",
            "points": [],
            "answered_from": "document",
            "quote": "Fine: Rs 500",
            "page": 1,
            "evidence": "found",
            "language": "en",
        })
        resp.parsed = None
        resp.usage_metadata = MagicMock(prompt_token_count=100, candidates_token_count=20)
        return resp

    mock_client.models.generate_content.side_effect = mock_generate

    with patch("reader.get_client", return_value=mock_client), \
         patch("time.sleep", return_value=None):
        res = client.post(
            "/api/ask",
            data={
                "question": "What is the fine?",
                "lang": "en",
                "result": json.dumps({"title": "E-Challan"}),
            },
        )

    assert res.status_code == 200, res.text
    data = res.json()
    assert "500" in data["answer"]
    assert models_called == ["gemini-3.7-flash", "gemini-2.5-flash"]


# ---------------------------------------------------------------------------
# 2. Single retry on 429 from the backup model
# ---------------------------------------------------------------------------

def test_is_busy_error_detection():
    """Verify is_busy_error detects 429 status and busy phrases."""
    err_429 = errors.ClientError(429, {"error": {"message": "Quota exceeded"}})
    assert is_busy_error(err_429) is True

    err_exhausted = Exception("Resource exhausted: 429 Quota exceeded")
    assert is_busy_error(err_exhausted) is True

    err_too_many = Exception("Too Many Requests: rate limit exceeded")
    assert is_busy_error(err_too_many) is True

    err_resource_under = Exception("error code resource_exhausted from backend")
    assert is_busy_error(err_resource_under) is True

    err_500 = errors.ServerError(500, {"error": {"message": "Internal error"}})
    assert is_busy_error(err_500) is False


def test_backup_model_single_retry_on_429():
    """When the backup model returns 429, it must be retried exactly ONCE (FALLBACK_BUSY_RETRIES=1).
    Further 429 immediately raises 503 without extra retries.
    """
    mock_client = MagicMock()
    call_log = []
    busy_err = errors.ClientError(429, {"error": {"message": "Too Many Requests"}})

    def mock_generate(model, contents, config=None):
        call_log.append(model)
        raise busy_err

    mock_client.models.generate_content.side_effect = mock_generate

    with patch("time.sleep", return_value=None):
        with pytest.raises(GeminiServiceError) as exc_info:
            call_gemini_with_retry(
                client=mock_client,
                model="gemini-3.7-flash",
                contents=["test prompt"],
                config=MagicMock(),
                endpoint="ask",
                deadline=time.time() + 45.0,
            )

    assert exc_info.value.status_code == 503
    # 1st call: primary model (fails with 429, switches to fallback)
    # 2nd call: fallback model (fails with 429, busy_on_backup=True -> retries 1 time)
    # 3rd call: fallback model retry 1 (fails with 429 -> limit reached, aborts)
    assert call_log == ["gemini-3.7-flash", "gemini-2.5-flash", "gemini-2.5-flash"]


def test_backup_model_succeeds_on_single_retry():
    """If backup model encounters 429 once but succeeds on the retry, it returns successfully."""
    mock_client = MagicMock()
    call_log = []
    busy_err = errors.ClientError(429, {"error": {"message": "Resource exhausted"}})

    success_resp = MagicMock()
    success_resp.text = json.dumps({"status": "ok"})
    success_resp.parsed = None
    success_resp.usage_metadata = MagicMock(prompt_token_count=50, candidates_token_count=10)

    def mock_generate(model, contents, config=None):
        call_log.append(model)
        if len(call_log) < 3:
            raise busy_err
        return success_resp

    mock_client.models.generate_content.side_effect = mock_generate

    with patch("time.sleep", return_value=None):
        res = call_gemini_with_retry(
            client=mock_client,
            model="gemini-3.7-flash",
            contents=["test prompt"],
            config=MagicMock(),
            endpoint="ask",
            deadline=time.time() + 45.0,
        )

    assert res == success_resp
    assert call_log == ["gemini-3.7-flash", "gemini-2.5-flash", "gemini-2.5-flash"]


# ---------------------------------------------------------------------------
# 3. Explain concurrency limit (EXPLAIN_CHUNK_WORKERS = 2) & partial results kept
# ---------------------------------------------------------------------------

def test_explain_concurrency_limit_and_partial_results_kept():
    """Test reading 4 chunks with EXPLAIN_CHUNK_WORKERS = 2:
    - Thread pool max_workers is capped at 2.
    - Chunk 0 and Chunk 2 succeed; Chunk 1 and Chunk 3 fail.
    - The overall read does NOT crash, and successfully returns merged partial results.
    """
    assert EXPLAIN_CHUNK_WORKERS == 2
    seen_workers = []

    class TrackedThreadPool(ThreadPoolExecutor):
        def __init__(self, max_workers=None, **kwargs):
            seen_workers.append(max_workers)
            super().__init__(max_workers=max_workers, **kwargs)

    chunks = [
        (b"page1-2", 1, 2),
        (b"page3-4", 3, 4),
        (b"page5-6", 5, 6),
        (b"page7-8", 7, 8),
    ]

    def mock_read_chunk(files, lang, deadline=None, page_start=None, page_end=None):
        if page_start == 3:
            # Chunk 1 fails with 503
            raise GeminiServiceError("Upstream service busy", 503)
        if page_start == 7:
            # Chunk 3 fails with timeout
            raise TimeoutError("Chunk timed out")

        return ReaderResponse(
            title=f"Chunk {page_start}-{page_end}",
            summary=[f"Fact from pages {page_start}-{page_end}."],
            summary_lines=[f"Fact from pages {page_start}-{page_end}."],
            sections=[
                ReaderSection(
                    heading=f"Section {page_start}",
                    page=page_start,
                    values=[
                        ReaderSectionValue(
                            label=f"Field {page_start}",
                            value="Normal",
                            page=page_start,
                        )
                    ],
                )
            ],
            language="en",
        )

    with patch("reader.pdf_page_chunks", return_value=chunks), \
         patch("reader.read_document_single_attempt", side_effect=mock_read_chunk), \
         patch("reader.ThreadPoolExecutor", TrackedThreadPool):
        result = read_document([(b"%PDF-multi", "application/pdf")], "en")

    # Verify workers capped at EXPLAIN_CHUNK_WORKERS (2)
    assert seen_workers == [2]

    # Partial results from chunk 0 (pages 1-2) and chunk 2 (pages 5-6) are merged
    assert len(result.sections) == 2
    assert result.sections[0].heading == "Section 1"
    assert result.sections[1].heading == "Section 5"
    assert result.sections[0].page == 1
    assert result.sections[1].page == 5


def test_explain_all_chunks_fail_raises_exception():
    """If all chunks fail, read_document raises the error from the chunks."""
    chunks = [(b"page1-2", 1, 2), (b"page3-4", 3, 4)]

    def mock_fail_chunk(*args, **kwargs):
        raise GeminiServiceError("All chunks busy", 503)

    with patch("reader.pdf_page_chunks", return_value=chunks), \
         patch("reader.read_document_single_attempt", side_effect=mock_fail_chunk):
        with pytest.raises(GeminiServiceError) as exc_info:
            read_document([(b"%PDF-multi", "application/pdf")], "en")

    assert exc_info.value.status_code == 503


# ---------------------------------------------------------------------------
# 4. "Busy. Try again." message across all 9 languages and endpoints
# ---------------------------------------------------------------------------

def test_busy_messages_all_9_languages():
    """Verify gemini_busy and service_busy error dictionaries match 'Busy. Try again.' in all 9 languages."""
    expected_busy = {
        "en": "Busy. Try again.",
        "ta": "இப்போது பிஸி. மீண்டும் முயற்சிக்கவும்.",
        "hi": "अभी व्यस्त है. फिर कोशिश करें.",
        "te": "ఇప్పుడు బిజీ. మళ్లీ ప్రయత్నించండి.",
        "ml": "ഇപ്പോൾ തിരക്കാണ്. വീണ്ടും ശ്രമിക്കുക.",
        "kn": "ಈಗ ನಿರತ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
        "mr": "आता गर्दी आहे. पुन्हा प्रयत्न करा.",
        "bn": "এখন ব্যস্ত. আবার চেষ্টা করুন.",
        "or": "ଏବେ ବ୍ୟସ୍ତ. ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ.",
    }

    for lang, expected_text in expected_busy.items():
        assert ERROR_MESSAGES["gemini_busy"][lang] == expected_text
        assert ERROR_MESSAGES["service_busy"][lang] == expected_text
        res = make_error_response(503, "gemini_busy", lang=lang)
        body = json.loads(res.body.decode("utf-8"))
        assert body["message"] == "Busy. Try again."
        assert body["message_local"] == expected_text


def test_ask_endpoint_busy_message_english_and_tamil(client):
    """When Ask exhausts retries due to 429, /api/ask returns 503 with 'Busy. Try again.'"""
    busy_err = errors.ClientError(429, {"error": {"message": "Resource exhausted"}})
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = busy_err

    # Test English
    with patch("reader.get_client", return_value=mock_client), \
         patch("time.sleep", return_value=None):
        res_en = client.post(
            "/api/ask",
            data={
                "question": "What is my pension?",
                "lang": "en",
                "result": json.dumps({"title": "Pension"}),
            },
        )
    assert res_en.status_code == 503
    body_en = res_en.json()
    assert body_en["message"] == "Busy. Try again."
    assert body_en["message_local"] == "Busy. Try again."

    # Test Tamil
    with patch("reader.get_client", return_value=mock_client), \
         patch("time.sleep", return_value=None):
        res_ta = client.post(
            "/api/ask",
            data={
                "question": "என்னுடைய ஓய்வூதியம் எவ்வளவு?",
                "lang": "ta",
                "result": json.dumps({"title": "Pension"}),
            },
        )
    assert res_ta.status_code == 503
    body_ta = res_ta.json()
    assert body_ta["message"] == "Busy. Try again."
    assert body_ta["message_local"] == "இப்போது பிஸி. மீண்டும் முயற்சிக்கவும்."


def test_explain_endpoint_busy_message(client):
    """When /api/explain encounters a busy service, it returns 503 with 'Busy. Try again.' in Hindi."""
    JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00" + b"\x00" * 64 + b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
    files = [("files", ("photo.jpg", JPEG_BYTES, "image/jpeg"))]

    with patch("main.read_document", side_effect=GeminiServiceError("Resource exhausted", status_code=503)):
        res = client.post("/api/explain", files=files, data={"lang": "hi"})
        assert res.status_code == 503
        body = res.json()
        assert body["message"] == "Busy. Try again."
        assert body["message_local"] == "अभी व्यस्त है. फिर कोशिश करें."
