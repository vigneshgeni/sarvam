import logging

from fastapi.testclient import TestClient

from main import IP_REQUESTS, app
from models import RedactModel, RedactSpan
from redact import MODEL_ID, keep_verbatim_spans, redact_personal

TENANT = "கவிதா மணி"


def test_only_verbatim_spans_are_kept():
    text = f"வாடகை நினைவூட்டல். வாடகைதாரர் {TENANT}. தொகை ₹12000."
    kept = keep_verbatim_spans(
        text,
        [
            {"text": TENANT, "type": "person"},
            {"text": TENANT, "type": "person"},
            {"text": "Not in the letter", "type": "person"},
            {"text": "x", "type": "phone"},
            {"text": TENANT, "type": "passport"},
            {"text": "   ", "type": "address"},
        ],
    )
    assert kept == [{"text": TENANT, "type": "person"}]


def test_redact_call_uses_flash_with_no_thinking(monkeypatch, caplog):
    seen = {}

    class FakeResponse:
        parsed = RedactModel(
            spans=[
                RedactSpan(text=TENANT, type="person"),
                RedactSpan(text="ghost name", type="person"),
            ]
        )
        text = ""

    def fake_call(**kwargs):
        seen.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr("redact.call_gemini_with_retry", fake_call)
    monkeypatch.setattr("redact.get_client", lambda: object())
    text = f"The tenant is {TENANT}."
    with caplog.at_level(logging.INFO):
        kept = redact_personal(text, "ta")
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "redact counts found=2 kept=1" in logged
    assert TENANT not in logged
    assert kept == [{"text": TENANT, "type": "person"}]
    assert seen["model"] == MODEL_ID
    assert seen["endpoint"] == "redact"
    assert seen["deadline"] == 15.0
    assert seen["attempt_timeout_sec"] == 10.0
    assert seen["fallback_timeout_sec"] == 5.0
    assert seen["fallback_model"] == "gemini-2.5-flash"
    assert seen["config"].temperature == 0.0
    assert seen["config"].thinking_config.thinking_budget == 0


def test_redact_endpoint_returns_verified_spans_and_logs_counts_only(monkeypatch, caplog):
    def fake(text, lang):
        assert TENANT in text
        return keep_verbatim_spans(text, [{"text": TENANT, "type": "person"}, {"text": "ghost", "type": "person"}])

    monkeypatch.setattr("main.redact_personal", fake)
    client = TestClient(app)
    IP_REQUESTS.clear()
    with caplog.at_level(logging.INFO):
        res = client.post("/api/redact", json={"text": f"வாடகைதாரர் {TENANT}", "lang": "ta"})
    assert res.status_code == 200
    assert res.json() == {"spans": [{"text": TENANT, "type": "person"}]}
    joined = "\n".join(record.getMessage() for record in caplog.records)
    assert TENANT not in joined
    assert "வாடகை" not in joined


def test_redact_endpoint_returns_500_without_the_text(monkeypatch, caplog):
    def boom(text, lang):
        raise RuntimeError("model failed")

    monkeypatch.setattr("main.redact_personal", boom)
    client = TestClient(app)
    IP_REQUESTS.clear()
    secret = f"letter for {TENANT}"
    with caplog.at_level(logging.INFO):
        res = client.post("/api/redact", json={"text": secret, "lang": "ta"})
    assert res.status_code == 500
    assert TENANT not in res.text
    assert "letter for" not in res.text
    joined = "\n".join(record.getMessage() for record in caplog.records)
    assert TENANT not in joined
    assert "redact status=error" in joined


def test_redact_uses_the_same_cors_and_rate_limit(monkeypatch):
    monkeypatch.setattr("main.redact_personal", lambda text, lang: [])
    client = TestClient(app)
    IP_REQUESTS.clear()
    preflight = client.options(
        "/api/redact",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert preflight.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"
    last = None
    for _ in range(21):
        last = client.post("/api/redact", json={"text": "no personal detail", "lang": "en"})
    assert last is not None
    assert last.status_code == 429
