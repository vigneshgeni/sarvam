"""Fake-synthesiser proof for the speak pool. Does not call Google."""

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import IP_REQUESTS, app
from models import ExplainResponse, TranslatePayload
from tts import _SEGMENT_WORKERS, synthesize_speech


class _Audio:
    def __init__(self, content: bytes):
        self.audio_content = content


class FakeSynth:
    def __init__(self, fail_first: bool = False):
        self.fail_first = fail_first
        self.calls = 0
        self.retries_after_429 = 0
        self.inflight = 0
        self.peak = 0
        self._lock = threading.Lock()
        self._failed = False

    def synthesize_speech(self, **_kwargs):
        with self._lock:
            self.calls += 1
            first_failure = self.fail_first and not self._failed
            if first_failure:
                self._failed = True
            else:
                self.inflight += 1
                self.peak = max(self.peak, self.inflight)
        if first_failure:
            error = Exception("429 resource exhausted")
            error.code = 429
            raise error
        try:
            time.sleep(0.2)
            return _Audio(b"ok")
        finally:
            with self._lock:
                self.inflight -= 1


def _eight_sentences() -> str:
    return " ".join(f"Sentence number {i} is ready." for i in range(_SEGMENT_WORKERS))


def test_eight_workers_and_one_429_retry_finish_within_30s():
    fake = FakeSynth(fail_first=True)
    pool = ThreadPoolExecutor(max_workers=1)
    started = time.perf_counter()
    future = pool.submit(synthesize_speech, _eight_sentences(), "en", "female", 1.0, fake)
    try:
        audio = future.result(timeout=30)
    finally:
        pool.shutdown(wait=False)
    elapsed = time.perf_counter() - started
    assert elapsed < 30
    assert audio
    assert fake.peak == _SEGMENT_WORKERS
    assert fake.calls == _SEGMENT_WORKERS + 1


def test_process_cap_stays_at_twelve_under_eight_requests():
    fake = FakeSynth(fail_first=False)
    text = _eight_sentences()
    pool = ThreadPoolExecutor(max_workers=8)
    started = time.perf_counter()
    futures = [
        pool.submit(synthesize_speech, text, "en", "female", 1.0, fake)
        for _ in range(8)
    ]
    try:
        for future in futures:
            assert future.result(timeout=30)
    finally:
        pool.shutdown(wait=False)
    assert time.perf_counter() - started < 30
    assert fake.peak <= 12
    assert fake.calls == 64


def test_odia_speak_returns_400_without_audio():
    IP_REQUESTS.clear()
    client = TestClient(app)
    with patch("main.synthesize_speech") as mock_synth:
        res = client.post(
            "/api/speak",
            json={"text": "Hello.", "lang": "or", "voice": "female"},
        )
    assert res.status_code == 400
    assert res.json().get("message") == "Audio playback is not available for Odia yet."
    assert mock_synth.called is False
    assert not res.content.startswith(b"RIFF")
    assert not res.content.startswith(b"ID3")


def test_guard_log_names_the_check_without_document_text(caplog):
    import logging

    orig = ExplainResponse(
        doc_type="insurance",
        title="City Clinic amount Rs. 31,200",
        language="en",
        summary=["Pay on 30.11.2026."],
        protected_terms=["City Clinic"],
    )
    trans = TranslatePayload(
        title="Amount missing",
        summary=["Pay on 30.11.2026."],
    )
    from main import check_translation_guard

    with caplog.at_level(logging.INFO, logger="sarvam-api"):
        assert check_translation_guard(orig, trans) is False
    assert "translation_guard: kind=digit field=title" in caplog.text
    assert "31200" not in caplog.text
    assert "City Clinic" not in caplog.text

    passed = TranslatePayload(
        title="Amount ₹ 31200",
        summary=["Pay on 30.11.2026."],
    )
    caplog.clear()
    with caplog.at_level(logging.INFO, logger="sarvam-api"):
        assert check_translation_guard(orig, passed) is False
    assert "translation_guard: kind=protected_terms field=protected_terms" in caplog.text
    assert "City Clinic" not in caplog.text
    assert "31200" not in caplog.text
