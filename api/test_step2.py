import datetime
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from dates import (
    compute_relative_deadline,
    detect_date_conflicts,
    evaluate_date_status,
    format_date_human,
    parse_date,
)
from evidence import (
    GENERIC_OFFICE_WORDS,
    collapse_whitespace,
    compute_evidence_summary,
    extract_critical_tokens,
    extract_digit_sequences,
    filter_protected_terms,
    is_generic_office_term,
    normalize_digits,
    normalize_text_for_guard,
    verify_evidence,
    verify_protected_terms_guard,
    verify_translation_guard,
)
from main import (
    app,
    get_client_ip,
    IP_REQUESTS,
    MAX_IMAGES,
    MAX_PDF_MB,
    MAX_TOTAL_MB,
)
from models import (
    EvidenceSummary,
    ExplainAction,
    ExplainFact,
    ExplainResponse,
    ExplainWarning,
    ReaderAction,
    ReaderResponse,
    TranslateActionText,
    TranslateFactText,
    TranslatePayload,
    TranslateWarningText,
)


# --- 1) Dates & Deadlines Tests ---

def test_parse_date():
    assert parse_date("2026-10-01") == datetime.date(2026, 10, 1)
    assert parse_date("30.11.2026") == datetime.date(2026, 11, 30)
    assert parse_date("12-09-2026") == datetime.date(2026, 9, 12)
    assert parse_date("01 October 2026") == datetime.date(2026, 10, 1)
    assert parse_date("1 Oct 2026") == datetime.date(2026, 10, 1)
    assert parse_date("October 1, 2026") == datetime.date(2026, 10, 1)
    assert parse_date("invalid-date") is None
    assert parse_date(None) is None


def test_compute_relative_deadline():
    # 01 Oct 2026 + 30 days = 31 Oct 2026
    computed = compute_relative_deadline(30, "2026-10-01", deadline_anchor="letter_date")
    assert computed == datetime.date(2026, 10, 31)

    # Missing anchor date or missing days
    assert compute_relative_deadline(None, "2026-10-01") is None
    assert compute_relative_deadline(30, None) is None
    # Invalid anchor
    assert compute_relative_deadline(30, "2026-10-01", deadline_anchor="other_anchor") is None


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


# --- 2) Recurring Obligations Tests ---

def test_evaluate_date_status_recurring():
    today = datetime.date(2026, 10, 6)

    # Recurring obligation should return "recurring" and NEVER "passed"
    assert evaluate_date_status("2026-09-01", is_recurring=True, today=today) == "recurring"
    assert evaluate_date_status(None, is_recurring=True, today=today) == "recurring"
    assert evaluate_date_status("31st of every month", is_recurring=True, today=today) == "recurring"


def test_recurring_action_explain_due_date_null(client):
    IP_REQUESTS.clear()
    files = [("files", ("page.jpg", b"fake-jpg-content", "image/jpeg"))]
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="insurance",
            title="Premium Notice",
            language="en",
            summary=["Pay premium monthly."],
            actions=[
                ReaderAction(
                    text="Pay monthly premium of Rs. 1,200",
                    due_date="2026-09-30",  # Receipt past date in doc
                    recurrence="31st of every month",  # Recurring schedule rule
                    quote="Pay by 31st of every month.",
                    page=1,
                )
            ],
        )
        res = client.post("/api/explain", files=files, data={"lang": "en"})
        assert res.status_code == 200
        action = res.json()["actions"][0]
        # due_date must be null!
        assert action["due_date"] is None
        # recurrence carries display text
        assert action["recurrence"] == "31st of every month"
        # date_status is "recurring", never "passed"
        assert action["date_status"] == "recurring"


def test_detect_date_conflicts():
    text = (
        "Please pay the amount on or before 15.10.2026 to avoid disconnection. "
        "Last date for payment: 25.10.2026."
    )
    conflicts = detect_date_conflicts(text)
    assert len(conflicts) == 1
    assert "15 Oct" in conflicts[0]
    assert "25 Oct" in conflicts[0]


# --- Evidence & Translation Guard Tests ---

def test_collapse_whitespace():
    assert collapse_whitespace("  hello   world \n test  ") == "hello world test"


def test_normalize_digits():
    # Tamil: ௦-௯ -> 0-9
    assert normalize_digits("௩௧,௨௦௦") == "31,200"
    # Devanagari: ०-९ -> 0-9
    assert normalize_digits("३१,२००") == "31,200"


def test_normalize_text_for_guard():
    # Currency equivalence: Rs. / INR / ₹ / ரூ / रु all become ₹
    assert normalize_text_for_guard("Rs. 31,200") == "₹ 31200"
    assert normalize_text_for_guard("INR 31,200") == "₹ 31200"
    assert normalize_text_for_guard("₹ 31,200") == "₹ 31200"
    assert normalize_text_for_guard("ரூ. ௩௧,௨௦௦") == "₹ 31200"
    assert normalize_text_for_guard("रु. ३१,२००") == "₹ 31200"
    # Indian grouping 1,23,456
    assert normalize_text_for_guard("1,23,456") == "123456"


def test_translation_guard_ta_digits_pass():
    orig = "Amount approved: Rs. 31,200 on 30.11.2026."
    # Tamil translation using Tamil digits
    trans = "ஒப்புதல் அளிக்கப்பட்ட தொகை: ரூ. ௩௧,௨௦௦ தேதி ௩௦.௧௧.௨௦௨௬."
    assert verify_translation_guard(orig, trans) is True


def test_translation_guard_hi_digits_pass():
    orig = "Amount approved: Rs. 31,200 on 30.11.2026."
    # Hindi translation using Devanagari digits
    trans = "स्वीकृत राशि: ₹ ३१,२०० दिनांक ३०.११.२०२६."
    assert verify_translation_guard(orig, trans) is True


def test_translation_guard_month_name_translation_passes():
    orig = "Date of letter: 01 October 2026."
    # English month name is translated to Tamil and Hindi; digit sequences match
    trans_ta = "கடிதத்தின் தேதி: 01 அக்டோபர் 2026."
    trans_hi = "पत्र की तारीख: 01 अक्टूबर 2026."
    assert verify_translation_guard(orig, trans_ta) is True
    assert verify_translation_guard(orig, trans_hi) is True


def test_translation_guard_indian_number_grouping():
    orig = "Claim amount is Rs. 1,23,456."
    trans = "கோரிக்கை தொகை ரூ. 1,23,456."
    assert verify_translation_guard(orig, trans) is True


def test_verify_translation_guard_changed_amount_fails():
    orig = "Amount approved: Rs. 31,200."
    # Changed from 31,200 to 31,000
    trans = "ஒப்புதல் அளிக்கப்பட்ட தொகை: ரூ. 31,000."
    assert verify_translation_guard(orig, trans) is False


def test_verify_translation_guard_missing_date_fails():
    orig = "Amount approved: Rs. 31,200 on 30.11.2026."
    # Missing date
    trans = "ஒப்புதல் அளிக்கப்பட்ட தொகை: ரூ. 31,200."
    assert verify_translation_guard(orig, trans) is False


def test_verify_evidence_pdf():
    page_text = [
        "Shield Health Insurance. Amount approved for payment: Rs. 31,200. Date: 01 October 2026."
    ]

    ev1 = verify_evidence(
        quote="Amount approved for payment: Rs. 31,200.",
        item_text="Approved amount is Rs. 31,200",
        page=1,
        pages_text=page_text,
    )
    assert ev1 == "matched"

    ev2 = verify_evidence(
        quote="Nonexistent clause in document",
        item_text="Some text",
        page=1,
        pages_text=page_text,
    )
    assert ev2 == "check_original"

    ev3 = verify_evidence(
        quote="Shield Health Insurance.",
        item_text="Different amount Rs. 99,999",
        page=1,
        pages_text=page_text,
    )
    assert ev3 == "check_original"


def test_verify_evidence_image_always_check_original():
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


# --- API Endpoint & Rate Limit Tests ---

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


# --- Rate Limit & X-Forwarded-For Tests ---

def test_rate_limit_x_forwarded_for(client):
    IP_REQUESTS.clear()

    # User 1 behind Cloud Run proxy: X-Forwarded-For has client IP as first entry
    headers_user1 = {"X-Forwarded-For": "203.0.113.195, 70.41.3.18, 150.172.238.178"}
    for i in range(20):
        res = client.post(
            "/api/explain",
            files=[("files", ("test.docx", b"dummy", "application/vnd.openxmlformats"))],
            headers=headers_user1,
        )
        assert res.status_code == 400  # docx rejected

    # User 1 hits 429
    res_limited = client.post(
        "/api/explain",
        files=[("files", ("test.docx", b"dummy", "application/vnd.openxmlformats"))],
        headers=headers_user1,
    )
    assert res_limited.status_code == 429
    assert "Retry-After" in res_limited.headers

    # User 2 with a different client IP in X-Forwarded-For is NOT throttled!
    headers_user2 = {"X-Forwarded-For": "198.51.100.42, 70.41.3.18"}
    res_user2 = client.post(
        "/api/explain",
        files=[("files", ("test.docx", b"dummy", "application/vnd.openxmlformats"))],
        headers=headers_user2,
    )
    assert res_user2.status_code == 400  # rejected docx, but NOT 429!
    IP_REQUESTS.clear()


def test_translate_rate_limit(client):
    IP_REQUESTS.clear()
    sample_explain = ExplainResponse(
        doc_type="insurance",
        title="Insurance Letter",
        language="en",
        summary=["Summary text."],
        actions=[],
        warnings=[],
        facts=[],
    )
    payload = {"result": sample_explain.model_dump(), "lang": "ta"}
    headers = {"X-Forwarded-For": "192.0.2.1"}

    with patch("main.translate_result_text") as mock_trans:
        mock_trans.return_value = TranslatePayload(
            title="காப்பீட்டு கடிதம்",
            summary=["சுருக்கம்."],
        )
        for i in range(30):
            res = client.post("/api/translate", json=payload, headers=headers)
            assert res.status_code == 200

    # 31st request hits 429
    res_limited = client.post("/api/translate", json=payload, headers=headers)
    assert res_limited.status_code == 429
    assert "Retry-After" in res_limited.headers
    IP_REQUESTS.clear()


# --- Multi-File Limits Tests ---

def test_multi_file_10_images_ok(client):
    IP_REQUESTS.clear()
    files = [("files", (f"page{i}.jpg", b"fake-jpg-content", "image/jpeg")) for i in range(10)]
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="pension",
            title="Pension Notice",
            language="en",
            summary=["Please submit life certificate."],
        )
        res = client.post("/api/explain", files=files, data={"lang": "en"})
        assert res.status_code == 200
        assert res.json()["title"] == "Pension Notice"


def test_multi_file_11_images_rejected(client):
    IP_REQUESTS.clear()
    files = [("files", (f"page{i}.jpg", b"fake-jpg-content", "image/jpeg")) for i in range(11)]
    res = client.post("/api/explain", files=files, data={"lang": "en"})
    assert res.status_code == 400
    assert "10 images" in res.json()["message"]


def test_multi_file_mixed_rejected(client):
    IP_REQUESTS.clear()
    files = [
        ("files", ("doc.pdf", b"%PDF-1.4...", "application/pdf")),
        ("files", ("page1.jpg", b"fake-jpg-content", "image/jpeg")),
    ]
    res = client.post("/api/explain", files=files, data={"lang": "en"})
    assert res.status_code == 400
    assert "Cannot mix" in res.json()["message"]


def test_pdf_20mb_boundary(client):
    IP_REQUESTS.clear()
    # 20 MB + 1 byte
    oversized_pdf = b"0" * (20 * 1024 * 1024 + 1)
    files = [("files", ("doc.pdf", oversized_pdf, "application/pdf"))]
    res = client.post("/api/explain", files=files, data={"lang": "en"})
    assert res.status_code == 400
    assert "20 MB" in res.json()["message"]


def test_report_title_null_when_not_printed(client):
    IP_REQUESTS.clear()
    files = [("files", ("page.jpg", b"fake-jpg-content", "image/jpeg"))]
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="insurance",
            title="Insurance Letter",
            report_title=None,
            report_date=None,
            language="en",
            summary=["Insurance claim status."],
        )
        res = client.post("/api/explain", files=files, data={"lang": "en"})
        assert res.status_code == 200
        data = res.json()
        assert data["report_title"] is None
        assert data["report_date"] is None


# --- Translation Endpoint & Guard Integration Tests ---

def test_translate_endpoint_success(client):
    IP_REQUESTS.clear()
    sample_explain = ExplainResponse(
        doc_type="insurance",
        title="Claim Approval Notice",
        report_title="Health Claim Settlement",
        report_date="01 October 2026",
        language="en",
        letter_date="2026-10-01",
        summary=["Your claim of Rs. 31,200 has been approved."],
        actions=[
            ExplainAction(
                text="Submit your bank details for Rs. 31,200 within 30 days.",
                due_date="2026-10-31",
                deadline_rule="within 30 days of this letter",
                deadline_days=30,
                deadline_anchor="letter_date",
                recurrence=None,
                date_status="calculated",
                quote="Submit bank details within 30 days for payment.",
                page=1,
                evidence="matched",
            ),
            ExplainAction(
                text="Pay recurring maintenance charge",
                due_date=None,
                deadline_rule=None,
                recurrence="31st of every month",
                date_status="recurring",
                quote="Pay maintenance by 31st of every month.",
                page=1,
                evidence="matched",
            ),
        ],
        warnings=[
            ExplainWarning(
                text="Account details must match the policyholder name.",
                quote="Name must match policyholder exactly.",
                page=1,
                evidence="matched",
            )
        ],
        facts=[
            ExplainFact(
                text="Approved amount: Rs. 31,200.",
                quote="Amount approved: Rs. 31,200.",
                page=1,
                evidence="matched",
            )
        ],
        conflicts=[],
        evidence_summary=EvidenceSummary(matched=4, check_original=0, calculated=0),
    )

    with patch("main.translate_result_text") as mock_trans:
        mock_trans.return_value = TranslatePayload(
            title="கோரிக்கை ஒப்புதல் அறிவிப்பு",
            report_title="சுகாதார கோரிக்கை தீர்வு",
            summary=["உங்கள் கோரிக்கை தொகை ரூ. 31,200 அங்கீகரிக்கப்பட்டுள்ளது."],
            actions=[
                TranslateActionText(
                    text="30 நாட்களுக்குள் ரூ. 31,200 பெற உங்கள் வங்கி விவரங்களை சமர்ப்பிக்கவும்.",
                    deadline_rule="இந்தக் கடிதம் வந்த 30 நாட்களுக்குள்",
                ),
                TranslateActionText(
                    text="மாதாந்திர பராமரிப்பு கட்டணத்தை செலுத்தவும்",
                    recurrence="ஒவ்வொரு மாதமும் 31ஆம் தேதி",
                ),
            ],
            warnings=[
                TranslateWarningText(text="வங்கி கணக்கு விவரங்கள் பாலிசிதாரர் பெயருடன் பொருந்த வேண்டும்.")
            ],
            facts=[
                TranslateFactText(text="ஒப்புதல் அளிக்கப்பட்ட தொகை: ரூ. 31,200.")
            ],
        )

        res = client.post(
            "/api/translate",
            json={"result": sample_explain.model_dump(), "lang": "ta"},
        )
        assert res.status_code == 200
        data = res.json()

        # Translated text fields
        assert data["title"] == "கோரிக்கை ஒப்புதல் அறிவிப்பு"
        assert data["report_title"] == "சுகாதார கோரிக்கை தீர்வு"
        assert "ரூ. 31,200" in data["summary"][0]
        assert data["language"] == "ta"

        # Quotes, page numbers, dates, evidence labels copied by CODE from original
        action1 = data["actions"][0]
        assert action1["quote"] == "Submit bank details within 30 days for payment."
        assert action1["page"] == 1
        assert action1["evidence"] == "matched"
        assert action1["due_date"] == "2026-10-31"
        assert action1["date_status"] == "calculated"
        assert action1["deadline_days"] == 30

        # Recurring action: due_date remains null, recurrence is display text, date_status is "recurring"
        action2 = data["actions"][1]
        assert action2["due_date"] is None
        assert action2["recurrence"] == "ஒவ்வொரு மாதமும் 31ஆம் தேதி"
        assert action2["date_status"] == "recurring"

        warning = data["warnings"][0]
        assert warning["quote"] == "Name must match policyholder exactly."
        assert warning["page"] == 1
        assert warning["evidence"] == "matched"

        fact = data["facts"][0]
        assert fact["quote"] == "Amount approved: Rs. 31,200."
        assert fact["page"] == 1
        assert fact["evidence"] == "matched"

        assert data["report_date"] == "01 October 2026"
        assert data["letter_date"] == "2026-10-01"


def test_translate_endpoint_guard_failure_changed_amount(client):
    IP_REQUESTS.clear()
    sample_explain = ExplainResponse(
        doc_type="insurance",
        title="Claim Notice",
        language="en",
        summary=["Your claim of Rs. 31,200 has been approved."],
        actions=[
            ExplainAction(
                text="Submit bank details within 30 days.",
                quote="Submit within 30 days.",
                page=1,
            )
        ],
        warnings=[],
        facts=[],
    )

    # Model alters amount from 31,200 to 31,000!
    with patch("main.translate_result_text") as mock_trans:
        mock_trans.return_value = TranslatePayload(
            title="கோரிக்கை அறிவிப்பு",
            summary=["உங்கள் கோரிக்கை தொகை ரூ. 31,000 அங்கீகரிக்கப்பட்டுள்ளது."],
            actions=[
                TranslateActionText(
                    text="30 நாட்களுக்குள் வங்கி விவரங்களை சமர்ப்பிக்கவும்."
                )
            ],
        )

        res = client.post(
            "/api/translate",
            json={"result": sample_explain.model_dump(), "lang": "ta"},
        )
        assert res.status_code == 422
        assert "Translation verification failed" in res.json()["message"]


def test_translate_endpoint_guard_failure_missing_date(client):
    IP_REQUESTS.clear()
    sample_explain = ExplainResponse(
        doc_type="insurance",
        title="Claim Notice",
        language="en",
        summary=["Your claim has been approved on 30.11.2026."],
        actions=[],
        warnings=[],
        facts=[],
    )

    # Model drops the date 30.11.2026 from the translation!
    with patch("main.translate_result_text") as mock_trans:
        mock_trans.return_value = TranslatePayload(
            title="கோரிக்கை அறிவிப்பு",
            summary=["உங்கள் கோரிக்கை அங்கீகரிக்கப்பட்டுள்ளது."],  # Missing 30.11.2026!
        )

        res = client.post(
            "/api/translate",
            json={"result": sample_explain.model_dump(), "lang": "ta"},
        )
        assert res.status_code == 422
        assert "Translation verification failed" in res.json()["message"]


# --- Protected Terms Tests ---

def test_verify_protected_terms_guard_latin_preserved():
    protected = ["Devayalini M", "St. Jude Hospital", "POL-98765"]
    orig_text = "Patient Devayalini M was treated at St. Jude Hospital under policy POL-98765."

    # In Tamil: Latin letters preserved verbatim
    ta_trans = "நோயாளி Devayalini M St. Jude Hospital இல் பாலிசி POL-98765 கீழ் சிகிச்சை பெற்றார்."
    assert verify_protected_terms_guard(protected, orig_text, ta_trans) is True

    # In Hindi: Latin letters preserved verbatim
    hi_trans = "मरीज Devayalini M का इलाज St. Jude Hospital में पॉलिसी POL-98765 के तहत किया गया था।"
    assert verify_protected_terms_guard(protected, orig_text, hi_trans) is True


def test_verify_protected_terms_guard_transliteration_fails():
    protected = ["Devayalini M"]
    orig_text = "Patient Devayalini M admitted for treatment."

    # Transliteration into Tamil letters fails
    ta_transliterated = "நோயாளி தேவயாலினி எம் சிகிச்சைக்காக அனுமதிக்கப்பட்டார்."
    assert verify_protected_terms_guard(protected, orig_text, ta_transliterated) is False

    # Transliteration into Devanagari/Hindi letters fails
    hi_transliterated = "मरीज देवयालिनी एम को इलाज के लिए भर्ती कराया गया।"
    assert verify_protected_terms_guard(protected, orig_text, hi_transliterated) is False

    # Complete omission of the name fails
    omitted = "நோயாளி சிகிச்சைக்காக அனுமதிக்கப்பட்டார்."
    assert verify_protected_terms_guard(protected, orig_text, omitted) is False


def test_translate_endpoint_protected_terms_preserved_ta_and_hi(client):
    IP_REQUESTS.clear()
    fictional_explain = ExplainResponse(
        doc_type="insurance",
        title="Discharge Summary",
        language="en",
        summary=["Patient Devayalini M was treated at Apollo Speciality Hospital."],
        actions=[
            ExplainAction(
                text="Devayalini M must submit claim form.",
                quote="Devayalini M must submit claim form.",
                page=1,
            )
        ],
        warnings=[],
        facts=[
            ExplainFact(
                text="Patient Name: Devayalini M",
                quote="Patient Name: Devayalini M",
                page=1,
            )
        ],
        protected_terms=["Devayalini M", "Apollo Speciality Hospital"],
    )

    # 1. Translate to Tamil: Latin name preserved
    with patch("main.translate_result_text") as mock_trans:
        mock_trans.return_value = TranslatePayload(
            title="வெளியேற்ற சுருக்கம்",
            summary=["நோயாளி Devayalini M Apollo Speciality Hospital இல் சிகிச்சை பெற்றார்."],
            actions=[
                TranslateActionText(
                    text="Devayalini M கோரிக்கை படிவத்தை சமர்ப்பிக்க வேண்டும்."
                )
            ],
            warnings=[],
            facts=[
                TranslateFactText(text="நோயாளி பெயர்: Devayalini M")
            ],
            protected_terms=["Devayalini M", "Apollo Speciality Hospital"],
        )

        res = client.post(
            "/api/translate",
            json={"result": fictional_explain.model_dump(), "lang": "ta"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["language"] == "ta"
        assert "Devayalini M" in data["summary"][0]
        assert "Apollo Speciality Hospital" in data["summary"][0]
        assert data["protected_terms"] == ["Devayalini M", "Apollo Speciality Hospital"]

    # 2. Translate to Hindi: Latin name preserved
    IP_REQUESTS.clear()
    with patch("main.translate_result_text") as mock_trans:
        mock_trans.return_value = TranslatePayload(
            title="डिस्चार्ज सारांश",
            summary=["मरीज Devayalini M का इलाज Apollo Speciality Hospital में हुआ।"],
            actions=[
                TranslateActionText(
                    text="Devayalini M को दावा प्रपत्र जमा करना होगा।"
                )
            ],
            warnings=[],
            facts=[
                TranslateFactText(text="मरीज का नाम: Devayalini M")
            ],
            protected_terms=["Devayalini M", "Apollo Speciality Hospital"],
        )

        res = client.post(
            "/api/translate",
            json={"result": fictional_explain.model_dump(), "lang": "hi"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["language"] == "hi"
        assert "Devayalini M" in data["summary"][0]
        assert "Apollo Speciality Hospital" in data["summary"][0]
        assert data["protected_terms"] == ["Devayalini M", "Apollo Speciality Hospital"]


def test_translate_endpoint_protected_terms_transliterated_fails_422(client):
    IP_REQUESTS.clear()
    fictional_explain = ExplainResponse(
        doc_type="insurance",
        title="Discharge Summary",
        language="en",
        summary=["Patient Devayalini M was treated at Apollo Speciality Hospital."],
        actions=[],
        warnings=[],
        facts=[],
        protected_terms=["Devayalini M", "Apollo Speciality Hospital"],
    )

    # 1. Tamil translation transliterates Devayalini M -> 422
    with patch("main.translate_result_text") as mock_trans:
        mock_trans.return_value = TranslatePayload(
            title="வெளியேற்ற சுருக்கம்",
            summary=["நோயாளி தேவயாலினி எம் Apollo Speciality Hospital இல் சிகிச்சை பெற்றார்."],  # Transliterated!
            actions=[],
            warnings=[],
            facts=[],
        )

        res = client.post(
            "/api/translate",
            json={"result": fictional_explain.model_dump(), "lang": "ta"},
        )
        assert res.status_code == 422
        body = res.json()
        assert "Translation verification failed" in body["message"]
        assert body["message_local"] == "மொழிபெயர்ப்பு சரிபார்ப்பு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்."

    # 2. Hindi translation transliterates Devayalini M -> 422
    IP_REQUESTS.clear()
    with patch("main.translate_result_text") as mock_trans:
        mock_trans.return_value = TranslatePayload(
            title="डिस्चार्ज सारांश",
            summary=["मरीज देवयालिनी एम Apollo Speciality Hospital में इलाज कराया।"],  # Transliterated!
            actions=[],
            warnings=[],
            facts=[],
        )

        res = client.post(
            "/api/translate",
            json={"result": fictional_explain.model_dump(), "lang": "hi"},
        )
        assert res.status_code == 422
        body = res.json()
        assert "Translation verification failed" in body["message"]
        assert body["message_local"] == "अनुवाद सत्यापन विफल रहा. कृपया पुनः प्रयास करें."


def test_verify_protected_terms_guard_case_whitespace_nfc_normalization(client):
    import unicodedata
    protected = ["Devayalini M", "St. Jude Hospital"]
    orig_text = "Patient Devayalini M admitted at St. Jude Hospital."

    # 1. Lowercase in translation passes
    trans_lower = "நோயாளி devayalini m st. jude hospital இல் அனுமதிக்கப்பட்டார்."
    assert verify_protected_terms_guard(protected, orig_text, trans_lower) is True

    # 2. Uppercase in translation passes
    trans_upper = "நோயாளி DEVAYALINI M ST. JUDE HOSPITAL இல் அனுமதிக்கப்பட்டார்."
    assert verify_protected_terms_guard(protected, orig_text, trans_upper) is True

    # 3. Line break and multi-space in translation passes
    trans_whitespace = "நோயாளி Devayalini\n   M   St.\nJude   Hospital இல் அனுமதிக்கப்பட்டார்."
    assert verify_protected_terms_guard(protected, orig_text, trans_whitespace) is True

    # 4. Unicode NFD decomposed form in translation matches NFC
    # e.g. José decomposed into 'Jose' + combining acute accent
    term_accent = "Dr. José Silva"
    orig_accent = "Consultant Dr. José Silva."
    nfd_trans = unicodedata.normalize("NFD", "மருத்துவர் Dr. José Silva ஆலோசனை வழங்கினார்.")
    assert verify_protected_terms_guard([term_accent], orig_accent, nfd_trans) is True

    # 5. Endpoint test: line break or casing difference does NOT trigger false 422
    IP_REQUESTS.clear()
    sample_explain = ExplainResponse(
        doc_type="insurance",
        title="Discharge Summary",
        language="en",
        summary=["Patient Devayalini M admitted."],
        actions=[],
        warnings=[],
        facts=[],
        protected_terms=["Devayalini M"],
    )

    with patch("main.translate_result_text") as mock_trans:
        mock_trans.return_value = TranslatePayload(
            title="வெளியேற்ற சுருக்கம்",
            summary=["நோயாளி devayalini\n  m அனுமதிக்கப்பட்டார்."],  # lowercase + line break
            actions=[],
            warnings=[],
            facts=[],
        )

        res = client.post(
            "/api/translate",
            json={"result": sample_explain.model_dump(), "lang": "ta"},
        )
        assert res.status_code == 200
        assert res.json()["language"] == "ta"


def test_thinking_constants_and_gemini_call_logging(caplog):
    import logging
    from reader import EXPLAIN_THINKING, TRANSLATE_THINKING, call_gemini_with_retry
    from unittest.mock import MagicMock

    # Named constants check
    assert EXPLAIN_THINKING == 0
    assert TRANSLATE_THINKING == 0

    # Test call_gemini_with_retry non-content logging
    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_usage = MagicMock()
    mock_usage.prompt_token_count = 120
    mock_usage.candidates_token_count = 45
    mock_usage.thoughts_token_count = 0
    mock_resp.usage_metadata = mock_usage
    mock_client.models.generate_content.return_value = mock_resp

    with caplog.at_level(logging.INFO, logger="sarvam-reader"):
        res = call_gemini_with_retry(
            client=mock_client,
            model="gemini-3.7-flash",
            contents=["test"],
            config=MagicMock(),
            endpoint="translate",
        )
        assert res == mock_resp

    # Verify log format
    log_records = [r for r in caplog.records if "gemini_call:" in r.message]
    assert len(log_records) == 1
    log_msg = log_records[0].message
    assert "endpoint=translate" in log_msg
    assert "input_tokens=120" in log_msg
    assert "output_tokens=45" in log_msg
    assert "thinking_tokens=0" in log_msg
    assert "attempts=1" in log_msg
    assert "status=200" in log_msg


# --- Per-Instance Semaphore & Retry Tests ---

def test_gemini_semaphore_timeout_returns_503(client):
    from main import GEMINI_SEMAPHORE, IP_REQUESTS
    IP_REQUESTS.clear()

    # Set semaphore to 0 to simulate 2 ongoing slow Gemini requests
    original_value = GEMINI_SEMAPHORE._value
    GEMINI_SEMAPHORE._value = 0

    try:
        # Patch SEMAPHORE_TIMEOUT to 0.1s for fast unit test
        with patch("main.SEMAPHORE_TIMEOUT", 0.1):
            files = [("files", ("page.jpg", b"fake-jpg-content", "image/jpeg"))]
            res = client.post("/api/explain", files=files, data={"lang": "ta"})
            assert res.status_code == 503
            body = res.json()
            assert "Service is busy" in body["message"]
            assert body["message_local"] == "சேவை தற்போது பிஸியாக உள்ளது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்."
    finally:
        # Restore semaphore value
        GEMINI_SEMAPHORE._value = original_value


def test_gemini_retry_jittered_backoff_and_success():
    from unittest.mock import MagicMock
    from google.genai import errors
    from reader import call_gemini_with_retry

    mock_client = MagicMock()
    mock_resp = MagicMock()
    mock_resp.usage_metadata = None
    # Fail on attempt 1 with 503, succeed on attempt 2
    mock_client.models.generate_content.side_effect = [
        errors.ServerError(503, {"error": {"message": "Service Unavailable"}}),
        mock_resp,
    ]

    sleeps = []
    with patch("time.sleep", side_effect=lambda s: sleeps.append(s)):
        res = call_gemini_with_retry(
            client=mock_client,
            model="gemini-3.7-flash",
            contents=["test"],
            config=MagicMock(),
            endpoint="explain",
            max_retries=2,
        )
        assert res == mock_resp
        assert len(sleeps) == 1
        # Jittered backoff on 1st retry: ~2s (2.0 to 2.5)
        assert 2.0 <= sleeps[0] <= 2.5
        assert mock_client.models.generate_content.call_count == 2


def test_gemini_retry_exhaustion_raises_service_error():
    from unittest.mock import MagicMock
    from google.genai import errors
    from reader import call_gemini_with_retry, GeminiServiceError

    mock_client = MagicMock()
    # Always fail with 429
    mock_client.models.generate_content.side_effect = errors.ClientError(
        429, {"error": {"message": "Resource Exhausted"}}
    )

    sleeps = []
    with patch("time.sleep", side_effect=lambda s: sleeps.append(s)):
        with pytest.raises(GeminiServiceError) as exc_info:
            call_gemini_with_retry(
                client=mock_client,
                model="gemini-3.7-flash",
                contents=["test"],
                config=MagicMock(),
                endpoint="explain",
                max_retries=2,
            )
        assert exc_info.value.status_code == 503
        # Total attempts = 3 (1 initial + 2 retries)
        assert mock_client.models.generate_content.call_count == 3
        # First retry sleeps ~2s, second sleeps ~5s
        assert len(sleeps) == 2
        assert 2.0 <= sleeps[0] <= 2.5
        assert 5.0 <= sleeps[1] <= 5.5


def test_gemini_retry_exhaustion_endpoint_returns_503_message_local(client):
    from unittest.mock import patch
    from reader import GeminiServiceError
    from main import IP_REQUESTS
    IP_REQUESTS.clear()

    files = [("files", ("page.jpg", b"fake-jpg-content", "image/jpeg"))]
    with patch("main.read_document", side_effect=GeminiServiceError("Upstream service unavailable", status_code=503)):
        res = client.post("/api/explain", files=files, data={"lang": "hi"})
        assert res.status_code == 503
        body = res.json()
        assert "Service is busy" in body["message"]
        assert body["message_local"] == "सेवा व्यस्त है. कृपया थोड़ी देर बाद पुनः प्रयास करें."


def test_gemini_retry_budget_exceeded():
    from unittest.mock import MagicMock
    from google.genai import errors
    from reader import call_gemini_with_retry, GeminiServiceError

    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = errors.ServerError(
        503, {"error": {"message": "Service Unavailable"}}
    )

    # Simulate start_time at 0 and time advancing beyond 100s budget on retry 1
    times = [0.0, 1.0, 2.0, 105.0, 106.0]
    with patch("time.time", side_effect=times):
        with pytest.raises(GeminiServiceError) as exc_info:
            call_gemini_with_retry(
                client=mock_client,
                model="gemini-3.7-flash",
                contents=["test"],
                config=MagicMock(),
                endpoint="explain",
                max_retries=2,
                deadline=1000.0,  # Ensure overall deadline is far out so retry budget is tested
            )
        assert "budget" in str(exc_info.value).lower()
        assert exc_info.value.status_code == 503


# --- Step 5b-2D: Overall Request Deadline (110s) Tests ---

def test_deadline_hit_while_waiting_for_semaphore(client):
    from main import GEMINI_SEMAPHORE, IP_REQUESTS
    IP_REQUESTS.clear()

    # Saturate semaphore slots
    orig_val = GEMINI_SEMAPHORE._value
    GEMINI_SEMAPHORE._value = 0

    try:
        # Patch REQUEST_DEADLINE to 0.1s so deadline expires while waiting for semaphore
        with patch("main.REQUEST_DEADLINE", 0.1):
            files = [("files", ("page.jpg", b"fake-jpg-content", "image/jpeg"))]
            res = client.post("/api/explain", files=files, data={"lang": "ta"})
            assert res.status_code == 504
            body = res.json()
            assert "Request timed out" in body["message"]
            assert body["message_local"] == "கோரிக்கைக்கான நேரம் முடிந்துவிட்டது. மீண்டும் முயற்சிக்கவும்."
    finally:
        GEMINI_SEMAPHORE._value = orig_val


def test_deadline_hit_during_retry(client):
    from unittest.mock import MagicMock
    from google.genai import errors
    from main import IP_REQUESTS
    IP_REQUESTS.clear()

    # Initial Gemini call fails with retryable 503, but deadline is 1.5s
    # Retry backoff sleeps ~2.2s, so deadline is reached during/before retry
    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = errors.ServerError(
        503, {"error": {"message": "Service Unavailable"}}
    )

    with patch("reader.get_client", return_value=mock_client), patch("main.REQUEST_DEADLINE", 1.5):
        files = [("files", ("page.jpg", b"fake-jpg-content", "image/jpeg"))]
        res = client.post("/api/explain", files=files, data={"lang": "hi"})
        assert res.status_code == 504
        body = res.json()
        assert "Request timed out" in body["message"]
        assert body["message_local"] == "अनुरोध का समय समाप्त हो गया. कृपया पुन: प्रयास करें."


# --- Step 5b-3: Protected Terms Safety Net & Generic Office Words Tests ---

def test_generic_office_words_safety_net():
    # 1. Names and IDs stay protected
    assert not is_generic_office_term("Mr. Ravi Kumar")
    assert not is_generic_office_term("CLM-2026-0884")
    assert not is_generic_office_term("SH/IND/22/559102")
    assert not is_generic_office_term("Devayalini M")
    assert not is_generic_office_term("Sunrise Hospital, Jayanagar")

    # 2. Generic office words with no digits are filtered
    assert is_generic_office_term("Grievance Cell")
    assert is_generic_office_term("Claims Manager")
    assert is_generic_office_term("Claims Department")
    assert is_generic_office_term("Grievance Redressal Cell")
    assert is_generic_office_term("Customer Support Desk")
    assert is_generic_office_term("Head Office")

    # 3. Filter function drops only generic office terms
    raw_terms = [
        "Mr. Ravi Kumar",
        "CLM-2026-0884",
        "Grievance Cell",
        "Claims Manager",
        "Claims Department",
        "Sunrise Hospital",
    ]
    filtered = filter_protected_terms(raw_terms)
    assert filtered == ["Mr. Ravi Kumar", "CLM-2026-0884", "Sunrise Hospital"]


def test_guard_accepts_translated_grievance_cell_and_rejects_transliterated_name():
    orig_text = (
        "Dear Mr. Ravi Kumar, regarding claim CLM-2026-0884. "
        "If you disagree, write to the Grievance Cell."
    )
    terms = ["Mr. Ravi Kumar", "CLM-2026-0884", "Grievance Cell", "Claims Manager"]

    # 1. Tamil translation translates 'Grievance Cell' to Tamil and keeps Mr. Ravi Kumar & CLM-2026-0884
    trans_translated_cell = (
        "அன்புள்ள Mr. Ravi Kumar அவர்களே, கோரிக்கை CLM-2026-0884 தொடர்பாக. "
        "நீங்கள் உடன்படவில்லை என்றால், குறைதீர்க்கும் பிரிவுக்கு எழுதவும்."
    )
    assert verify_protected_terms_guard(terms, orig_text, trans_translated_cell) is True

    # 2. Tamil translation transliterates 'Mr. Ravi Kumar' to Tamil script -> rejected
    trans_transliterated_name = (
        "அன்புள்ள திரு ரவி குமார் அவர்களே, கோரிக்கை CLM-2026-0884 தொடர்பாக. "
        "நீங்கள் உடன்படவில்லை என்றால், குறைதீர்க்கும் பிரிவுக்கு எழுதவும்."
    )
    assert verify_protected_terms_guard(terms, orig_text, trans_transliterated_name) is False


def test_translate_endpoint_accepts_translated_grievance_cell_and_rejects_transliterated_name(client):
    from unittest.mock import patch
    from main import IP_REQUESTS
    IP_REQUESTS.clear()

    orig = ExplainResponse(
        doc_type="insurance",
        title="Insurance Claim Settlement",
        language="en",
        summary=[
            "Dear Mr. Ravi Kumar, your claim CLM-2026-0884 was processed. Write to Grievance Cell if you disagree."
        ],
        actions=[],
        warnings=[],
        facts=[],
        protected_terms=["Mr. Ravi Kumar", "CLM-2026-0884", "Grievance Cell", "Claims Manager"],
    )

    # 1. Grievance Cell is translated to Tamil: passes guard (200), response protected_terms filtered
    with patch("main.translate_result_text") as mock_trans:
        mock_trans.return_value = TranslatePayload(
            title="காப்பீட்டு கோரிக்கை தீர்வு",
            summary=[
                "அன்புள்ள Mr. Ravi Kumar, உங்கள் கோரிக்கை CLM-2026-0884 பரிசீலிக்கப்பட்டது. உடன்படவில்லை என்றால் குறைதீர்க்கும் பிரிவுக்கு எழுதவும்."
            ],
            actions=[],
            warnings=[],
            facts=[],
        )

        res = client.post(
            "/api/translate",
            json={"result": orig.model_dump(), "lang": "ta"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["language"] == "ta"
        # Grievance Cell and Claims Manager should be filtered from response protected_terms
        assert body["protected_terms"] == ["Mr. Ravi Kumar", "CLM-2026-0884"]

    # 2. Real name is transliterated to Tamil: rejected with 422
    IP_REQUESTS.clear()
    with patch("main.translate_result_text") as mock_trans:
        mock_trans.return_value = TranslatePayload(
            title="காப்பீட்டு கோரிக்கை தீர்வு",
            summary=[
                "அன்புள்ள திரு ரவி குமார், உங்கள் கோரிக்கை CLM-2026-0884 பரிசீலிக்கப்பட்டது. உடன்படவில்லை என்றால் குறைதீர்க்கும் பிரிவுக்கு எழுதவும்."
            ],
            actions=[],
            warnings=[],
            facts=[],
        )

        res = client.post(
            "/api/translate",
            json={"result": orig.model_dump(), "lang": "ta"},
        )
        assert res.status_code == 422
        body = res.json()
        assert "Translation verification failed" in body["message"]
        assert body["message_local"] == "மொழிபெயர்ப்பு சரிபார்ப்பு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்."



