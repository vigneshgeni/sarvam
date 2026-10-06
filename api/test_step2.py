import datetime
import pytest
from fastapi.testclient import TestClient

from dates import (
    compute_relative_deadline,
    detect_date_conflicts,
    evaluate_date_status,
    format_date_human,
    parse_date,
    parse_deadline_rule,
)
from evidence import (
    collapse_whitespace,
    compute_evidence_summary,
    extract_critical_tokens,
    verify_evidence,
)
from main import app, IP_REQUESTS


# --- Dates Tests ---

def test_parse_date():
    assert parse_date("2026-10-01") == datetime.date(2026, 10, 1)
    assert parse_date("30.11.2026") == datetime.date(2026, 11, 30)
    assert parse_date("12-09-2026") == datetime.date(2026, 9, 12)
    assert parse_date("01 October 2026") == datetime.date(2026, 10, 1)
    assert parse_date("1 Oct 2026") == datetime.date(2026, 10, 1)
    assert parse_date("October 1, 2026") == datetime.date(2026, 10, 1)
    assert parse_date("invalid-date") is None
    assert parse_date(None) is None


def test_parse_deadline_rule():
    assert parse_deadline_rule("within 30 days of this letter") == 30
    assert parse_deadline_rule("within 7 working days") == 7
    assert parse_deadline_rule("15 days") == 15
    assert parse_deadline_rule("no deadline") is None
    assert parse_deadline_rule(None) is None


def test_compute_relative_deadline():
    # 01 Oct 2026 + 30 days = 31 Oct 2026
    computed = compute_relative_deadline("within 30 days of this letter", "2026-10-01")
    assert computed == datetime.date(2026, 10, 31)

    # Missing anchor date or missing rule
    assert compute_relative_deadline(None, "2026-10-01") is None
    assert compute_relative_deadline("within 30 days", None) is None


def test_evaluate_date_status():
    today = datetime.date(2026, 10, 6)

    # Calculated date
    assert evaluate_date_status("2026-10-31", is_calculated=True, today=today) == "calculated"

    # Future / upcoming date
    assert evaluate_date_status("2026-11-30", is_calculated=False, today=today) == "upcoming"

    # Past date
    assert evaluate_date_status("2026-09-01", is_calculated=False, today=today) == "passed"

    # None / empty
    assert evaluate_date_status(None, is_calculated=False, today=today) == "none"


def test_detect_date_conflicts():
    text = (
        "Please pay the amount on or before 15.10.2026 to avoid disconnection. "
        "Last date for payment: 25.10.2026."
    )
    conflicts = detect_date_conflicts(text)
    assert len(conflicts) == 1
    assert "15 Oct" in conflicts[0]
    assert "25 Oct" in conflicts[0]


# --- Evidence Tests ---

def test_collapse_whitespace():
    assert collapse_whitespace("  hello   world \n test  ") == "hello world test"


def test_extract_critical_tokens():
    text = "Amount approved: Rs. 31,200. Review within 30 days. Contact Ph: +91 80 4000 5678."
    tokens = extract_critical_tokens(text)
    assert "Rs. 31,200" in tokens
    assert "+91 80 4000 5678" in tokens


def test_verify_evidence_pdf():
    page_text = [
        "Shield Health Insurance. Amount approved for payment: Rs. 31,200. Date: 01 October 2026."
    ]

    # Exact match with amount present
    ev1 = verify_evidence(
        quote="Amount approved for payment: Rs. 31,200.",
        item_text="Approved amount is Rs. 31,200",
        page=1,
        pages_text=page_text,
    )
    assert ev1 == "matched"

    # Quote not found
    ev2 = verify_evidence(
        quote="Nonexistent clause in document",
        item_text="Some text",
        page=1,
        pages_text=page_text,
    )
    assert ev2 == "check_original"

    # Amount mismatch (amount in item text does not appear in document)
    ev3 = verify_evidence(
        quote="Shield Health Insurance.",
        item_text="Different amount Rs. 99,999",
        page=1,
        pages_text=page_text,
    )
    assert ev3 == "check_original"


def test_verify_evidence_image_always_check_original():
    # When pages_text is None (images / photos)
    ev = verify_evidence(
        quote="Pensioners must submit Life Certificate",
        item_text="Submit life certificate",
        page=1,
        pages_text=None,
    )
    assert ev == "check_original"


def test_compute_evidence_summary():
    actions = [{"evidence": "calculated"}, {"evidence": "matched"}]
    warnings = [{"evidence": "matched"}]
    facts = [{"evidence": "check_original"}, {"evidence": "matched"}]

    summary = compute_evidence_summary(actions, warnings, facts)
    assert summary == {
        "matched": 3,
        "check_original": 1,
        "calculated": 1,
    }


# --- API Endpoint & Middleware Tests ---

@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_cors_headers(client):
    res = client.options(
        "/api/explain",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_rate_limit(client):
    IP_REQUESTS.clear()
    # Perform 10 requests from client IP
    for i in range(10):
        res = client.post(
            "/api/explain",
            files=[("files", ("test.docx", b"dummy", "application/vnd.openxmlformats"))],
        )
        assert res.status_code == 400

    # 11th request should hit rate limit (429)
    res_limited = client.post(
        "/api/explain",
        files=[("files", ("test.docx", b"dummy", "application/vnd.openxmlformats"))],
    )
    assert res_limited.status_code == 429
    assert "Too many requests" in res_limited.json()["message"]
    IP_REQUESTS.clear()
