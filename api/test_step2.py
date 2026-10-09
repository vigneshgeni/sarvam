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


# --- Step 5b-4 Tests (Items 3-6) ---

# Item 3: Tail-Latency Hedge Orchestrator Tests with Fake Slow Client
@pytest.mark.anyio
async def test_execute_with_hedge_fast_no_hedge():
    import asyncio
    import time
    from reader import execute_with_hedge

    sem = asyncio.Semaphore(2)
    call_counts = []

    def fast_fn(deadline, timeout, attempt_idx):
        call_counts.append(attempt_idx)
        return f"result-{attempt_idx}"

    res = await execute_with_hedge(
        fn=fast_fn,
        args=(),
        per_attempt_timeout=1.0,
        hedge_delay=0.2,
        can_hedge=True,
        deadline=time.time() + 10.0,
        semaphore=sem,
        endpoint="test_fast",
    )
    assert res == "result-1"
    assert call_counts == [1]


@pytest.mark.anyio
async def test_execute_with_hedge_slow_first_hedge_wins():
    import asyncio
    import time
    from reader import execute_with_hedge

    sem = asyncio.Semaphore(2)

    def slow_first_fn(deadline, timeout, attempt_idx):
        if attempt_idx == 1:
            time.sleep(0.5)
            return "slow-1"
        return "fast-hedge-2"

    res = await execute_with_hedge(
        fn=slow_first_fn,
        args=(),
        per_attempt_timeout=2.0,
        hedge_delay=0.05,
        can_hedge=True,
        deadline=time.time() + 10.0,
        semaphore=sem,
        endpoint="test_hedge_wins",
    )
    assert res == "fast-hedge-2"


@pytest.mark.anyio
async def test_execute_with_hedge_semaphore_busy_skips_hedge():
    import asyncio
    import time
    from reader import execute_with_hedge

    # Semaphore has 0 available permits for the hedge attempt
    sem = asyncio.Semaphore(0)

    def slow_fn(deadline, timeout, attempt_idx):
        time.sleep(0.15)
        return f"result-{attempt_idx}"

    with patch("reader.HEDGE_SEMAPHORE_TIMEOUT", 0.02):
        res = await execute_with_hedge(
            fn=slow_fn,
            args=(),
            per_attempt_timeout=2.0,
            hedge_delay=0.03,
            can_hedge=True,
            deadline=time.time() + 10.0,
            semaphore=sem,
            endpoint="test_sem_busy",
        )
        assert res == "result-1"


@pytest.mark.anyio
async def test_execute_with_hedge_deadline_enforced():
    import asyncio
    import time
    from reader import GeminiTimeoutError, execute_with_hedge

    sem = asyncio.Semaphore(2)

    def dummy_fn(deadline, timeout, attempt_idx):
        return "ok"

    # Deadline already in the past
    with pytest.raises(GeminiTimeoutError) as exc_info:
        await execute_with_hedge(
            fn=dummy_fn,
            args=(),
            per_attempt_timeout=2.0,
            hedge_delay=0.05,
            can_hedge=True,
            deadline=time.time() - 1.0,
            semaphore=sem,
            endpoint="test_deadline",
        )
    assert exc_info.value.status_code == 504


# Item 4: lang=auto Tests on /api/explain
def test_explain_lang_auto_hindi_doc(client):
    from main import IP_REQUESTS
    IP_REQUESTS.clear()

    files = [("files", ("notice.jpg", b"fake-jpg-content", "image/jpeg"))]
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="government_notice",
            document_language="hi",
            language="hi",
            title="पेंशन सूचना",
            summary=["जीवन प्रमाण पत्र जमा करें।"],
        )
        res = client.post("/api/explain", files=files, data={"lang": "auto"})
        assert res.status_code == 200
        body = res.json()
        assert body["document_language"] == "hi"
        assert body["language"] == "hi"
        assert body["title"] == "पेंशन सूचना"


def test_explain_lang_auto_tamil_doc(client):
    from main import IP_REQUESTS
    IP_REQUESTS.clear()

    files = [("files", ("notice.jpg", b"fake-jpg-content", "image/jpeg"))]
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="government_notice",
            document_language="ta",
            language="ta",
            title="ஓய்வூதிய அறிவிப்பு",
            summary=["வாழ்வுச் சான்றிதழை சமர்ப்பிக்கவும்."],
        )
        res = client.post("/api/explain", files=files, data={"lang": "auto"})
        assert res.status_code == 200
        body = res.json()
        assert body["document_language"] == "ta"
        assert body["language"] == "ta"
        assert body["title"] == "ஓய்வூதிய அறிவிப்பு"


def test_explain_lang_auto_foreign_doc_defaults_to_english(client):
    from main import IP_REQUESTS
    IP_REQUESTS.clear()

    files = [("files", ("notice.jpg", b"fake-jpg-content", "image/jpeg"))]
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="other",
            document_language="fr",
            language="en",
            title="Official Notice",
            summary=["Please find the document summary."],
        )
        res = client.post("/api/explain", files=files, data={"lang": "auto"})
        assert res.status_code == 200
        body = res.json()
        assert body["document_language"] == "fr"
        assert body["language"] == "en"


def test_explain_explicit_lang_preserved(client):
    from main import IP_REQUESTS
    IP_REQUESTS.clear()

    files = [("files", ("notice.jpg", b"fake-jpg-content", "image/jpeg"))]
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="insurance",
            document_language="en",
            language="ta",
            title="காப்பீட்டு கடிதம்",
            summary=["விவரங்கள் உள்ளே."],
        )
        res = client.post("/api/explain", files=files, data={"lang": "ta"})
        assert res.status_code == 200
        body = res.json()
        assert body["document_language"] == "en"
        assert body["language"] == "ta"


# Item 5: Document Types + Key Details + Glance Tests
def test_document_types_enum_all_supported():
    from models import DOCUMENT_TYPES
    expected_types = (
        "utility_bill",
        "telecom_bill",
        "tax_receipt",
        "insurance",
        "bank",
        "government_notice",
        "court_legal",
        "challan",
        "medical",
        "receipt",
        "agreement",
        "corporate",
        "other",
    )
    for t in expected_types:
        assert t in DOCUMENT_TYPES
    assert len(DOCUMENT_TYPES) == 13


def test_report_date_iso_and_glance_integration(client):
    from main import IP_REQUESTS
    from models import ReaderGlance, ReaderGlanceKeyValue
    IP_REQUESTS.clear()

    files = [("files", ("doc.pdf", b"%PDF-1.4...", "application/pdf"))]
    with patch("main.read_document") as mock_read, patch("main.extract_pdf_pages") as mock_pages:
        mock_pages.return_value = [
            "Electricity Department. Bill Date: 01 October 2026. Total Due: Rs. 1,450. Due Date: 25.10.2026."
        ]
        mock_read.return_value = ReaderResponse(
            document_type="utility_bill",
            doc_type="utility_bill",
            title="Electricity Bill",
            report_title="Monthly Power Bill",
            report_date="01 October 2026",
            language="en",
            summary=["Pay bill on time."],
            glance=ReaderGlance(
                headline="Electricity bill for October with due date on 25th",
                key_values=[
                    ReaderGlanceKeyValue(label="Total Amount", value="Rs. 1,450", kind="amount"),
                    ReaderGlanceKeyValue(label="Due Date", value="25.10.2026", kind="date"),
                ],
            ),
        )
        res = client.post("/api/explain", files=files, data={"lang": "en"})
        assert res.status_code == 200
        body = res.json()
        assert body["document_type"] == "utility_bill"
        assert body["report_date"] == "01 October 2026"
        assert body["report_date_iso"] == "2026-10-01"
        assert body["source_kind"] == "text_pdf"
        assert body["glance"] is not None
        assert body["glance"]["headline"] == "Electricity bill for October with due date on 25th"
        kvs = body["glance"]["key_values"]
        assert len(kvs) == 2
        assert kvs[0]["label"] == "Total Amount"
        assert kvs[0]["value"] == "Rs. 1,450"
        assert kvs[0]["evidence"] == "matched"
        assert kvs[1]["label"] == "Due Date"
        assert kvs[1]["value"] == "25.10.2026"
        assert kvs[1]["evidence"] == "matched"


# Item 6: Places, Contacts, source_kind Tests
def test_source_kind_determination_modes():
    from evidence import determine_source_kind

    # 1. Images only -> photo
    assert determine_source_kind([(b"img", "image/jpeg")], None) == "photo"

    # 2. PDF with legible text -> text_pdf
    pdf_text = ["This is a legal document from the court with detailed directions and orders."]
    assert determine_source_kind([(b"pdf", "application/pdf")], pdf_text) == "text_pdf"

    # 3. PDF with almost no text (<50 chars) -> scanned_pdf
    scanned_text = ["   \n  \t  1  "]
    assert determine_source_kind([(b"pdf", "application/pdf")], scanned_text) == "scanned_pdf"


def test_places_and_contacts_validation_and_deduplication():
    from evidence import process_contacts, process_places
    from models import ReaderContact, ReaderPlace

    pdf_text = [
        "Reach us at support@sarvam.ai or call 044-24356789. Office: 12 Anna Salai, Chennai."
    ]

    raw_places = [
        ReaderPlace(label="Main Office", address="12 Anna Salai, Chennai", quote="Office: 12 Anna Salai, Chennai", page=1),
        ReaderPlace(label="Main Office Duplicate", address="12 Anna Salai,   Chennai", quote="Office: 12 Anna Salai", page=1),
        ReaderPlace(label="Branch", address="Nonexistent Street, Madurai", quote="Madurai branch", page=1),
    ]
    places = process_places(raw_places, pdf_text)
    # Deduplication drops duplicate
    assert len(places) == 2
    assert places[0]["address"] == "12 Anna Salai, Chennai"
    assert places[0]["evidence"] == "matched"
    assert places[1]["evidence"] == "check_original"

    raw_contacts = [
        ReaderContact(label="Support Email", value="support@sarvam.ai", quote="support@sarvam.ai", page=1),
        ReaderContact(label="Office Phone", value="044-24356789", quote="call 044-24356789", page=1),
        ReaderContact(label="Invalid Phone", value="123", quote="123", page=1),  # < 7 digits -> dropped
        ReaderContact(label="Invalid Email", value="not-an-email", quote="not-an-email", page=1),  # invalid -> dropped
        ReaderContact(label="Duplicate Phone", value="044 2435 6789", quote="call", page=1),  # duplicate digits -> dropped
    ]
    contacts = process_contacts(raw_contacts, pdf_text)
    assert len(contacts) == 2
    assert contacts[0]["value"] == "support@sarvam.ai"
    assert contacts[0]["evidence"] == "matched"
    assert contacts[1]["value"] == "044-24356789"
    assert contacts[1]["evidence"] == "matched"


def test_translate_shrunk_input_and_copies_glance_places_contacts(client):
    from main import IP_REQUESTS
    from models import ContactInfo, GlanceKeyValue, GlanceSummary, PlaceInfo
    IP_REQUESTS.clear()

    orig = ExplainResponse(
        doc_type="utility_bill",
        document_type="utility_bill",
        document_language="en",
        source_kind="text_pdf",
        title="Electricity Bill",
        report_title="Consumer Power Bill",
        report_date="01 October 2026",
        report_date_iso="2026-10-01",
        language="en",
        letter_date="2026-10-01",
        summary=["Please pay the total amount of Rs. 1,450."],
        actions=[
            ExplainAction(
                text="Pay electricity bill Rs. 1,450",
                due_date="2026-10-25",
                quote="Pay total amount by 25.10.2026.",
                page=1,
                evidence="matched",
            )
        ],
        warnings=[],
        facts=[],
        glance=GlanceSummary(
            headline="Electricity bill for October with due date",
            key_values=[
                GlanceKeyValue(label="Total Due", value="Rs. 1,450", kind="amount", evidence="matched")
            ],
        ),
        places=[
            PlaceInfo(label="Bill Desk", address="12 Anna Salai, Chennai", quote="12 Anna Salai", page=1, evidence="matched")
        ],
        contacts=[
            ContactInfo(label="Helpline", value="044-24356789", quote="call 044-24356789", page=1, evidence="matched")
        ],
        protected_terms=["12 Anna Salai, Chennai", "044-24356789"],
    )

    with patch("main.translate_keyed_strings") as mock_keyed:
        mock_keyed.return_value = {
            "title": "மின் கட்டண அறிக்கை",
            "report_title": "நுகர்வோர் மின் கட்டணம்",
            "summary_0": "தயவுசெய்து மொத்தத் தொகையான ரூ. 1,450 ஐ செலுத்தவும்.",
            "action_0_text": "மின் கட்டணம் ரூ. 1,450 ஐ செலுத்தவும்",
            "glance_headline": "அக்டோபர் மாத மின் கட்டண அறிக்கை",
            "glance_kv_0_label": "செலுத்த வேண்டிய தொகை",
            "place_0_label": "கட்டண மையம்",
            "contact_0_label": "உதவி எண்",
        }

        res = client.post(
            "/api/translate",
            json={"result": orig.model_dump(), "lang": "ta"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["language"] == "ta"
        assert body["title"] == "மின் கட்டண அறிக்கை"
        assert body["report_title"] == "நுகர்வோர் மின் கட்டணம்"
        assert body["report_date"] == "01 October 2026"
        assert body["report_date_iso"] == "2026-10-01"
        assert body["source_kind"] == "text_pdf"

        # Glance: label translated, value and evidence preserved by code
        assert body["glance"]["headline"] == "அக்டோபர் மாத மின் கட்டண அறிக்கை"
        assert body["glance"]["key_values"][0]["label"] == "செலுத்த வேண்டிய தொகை"
        assert body["glance"]["key_values"][0]["value"] == "Rs. 1,450"
        assert body["glance"]["key_values"][0]["evidence"] == "matched"

        # Places: label translated, address/quote/page/evidence copied by code
        assert body["places"][0]["label"] == "கட்டண மையம்"
        assert body["places"][0]["address"] == "12 Anna Salai, Chennai"
        assert body["places"][0]["quote"] == "12 Anna Salai"
        assert body["places"][0]["evidence"] == "matched"

        # Contacts: label translated, value/quote/page/evidence copied by code
        assert body["contacts"][0]["label"] == "உதவி எண்"
        assert body["contacts"][0]["value"] == "044-24356789"
        assert body["contacts"][0]["quote"] == "call 044-24356789"
        assert body["contacts"][0]["evidence"] == "matched"


# =========================================================================
# SARVAM API MASTER PROMPT (v3) - Unit Tests for API-1 through API-12
# =========================================================================

def test_script_guard_thresholds():
    from evidence import check_script_guard

    # 1. Indic scripts passing (>= 40% Indic letters)
    ta_text = ["இது ஒரு அதிகாரப்பூர்வ அறிவிப்பு. மின் கட்டணம் ரூ. 1,450 செலுத்தவும்."]
    passed, ratio = check_script_guard(ta_text, "ta")
    assert passed is True
    assert ratio >= 0.40

    hi_text = ["यह एक आधिकारिक नोटिस है. कृपया अपनी पेंशन राशि का सत्यापन करें."]
    passed, ratio = check_script_guard(hi_text, "hi")
    assert passed is True
    assert ratio >= 0.40

    te_text = ["ఇది అధికారిక నోటీసు. దయచేసి వివరాలను ధృవీకరించండి."]
    passed, ratio = check_script_guard(te_text, "te")
    assert passed is True
    assert ratio >= 0.40

    ml_text = ["ഇതൊരു ഔദ്യോഗിക അറിയിപ്പാണ്. ദയവായി വിവരങ്ങൾ പരിശോധിക്കുക."]
    passed, ratio = check_script_guard(ml_text, "ml")
    assert passed is True
    assert ratio >= 0.40

    kn_text = ["ಇದು ಅಧಿಕೃತ ಸೂಚನೆಯಾಗಿದೆ. ದಯವಿಟ್ಟು ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ."]
    passed, ratio = check_script_guard(kn_text, "kn")
    assert passed is True
    assert ratio >= 0.40

    # 2. English passthrough in Indic target fails script guard (< 40%)
    en_text = ["This is an official electricity bill statement. Please pay on time."]
    passed, ratio = check_script_guard(en_text, "ta")
    assert passed is False
    assert ratio < 0.40

    passed, ratio = check_script_guard(en_text, "hi")
    assert passed is False

    # 3. Target language English always passes
    passed, ratio = check_script_guard(en_text, "en")
    assert passed is True


def test_evidence_normalization_adversarial():
    from evidence import normalize_text_for_evidence, verify_evidence

    # 1. Ligatures and line break hyphenation
    norm = normalize_text_for_evidence("con\ufb01rmation of the de-\npartment")
    assert "confirmation" in norm
    assert "department" in norm

    # 2. Currency and Lac vs Lakh equivalence
    page_text = "Sunrise Insurance Co. Policy CLM-101. Total Coverage: Rs. 5 Lacs. Premium Due: ₹ 1,00,000 on 30.11.2026."
    pages = [page_text]

    # Valid matches with variations
    assert verify_evidence("Total Coverage: ₹ 5 Lakh", "", 1, pages) == "matched"
    assert verify_evidence("Premium Due: INR 100000 on 30.11.2026", "", 1, pages) == "matched"
    assert verify_evidence("Total Coverage: Rs. 5 Lacs", "", 1, pages) == "matched"

    # ADVERSARIAL: Different numbers must NEVER match
    # Rs 2,00,000 instead of 1,00,000
    assert verify_evidence("Premium Due: ₹ 2,00,000 on 30.11.2026", "", 1, pages) == "check_original"
    # Different date
    assert verify_evidence("Premium Due: ₹ 1,00,000 on 29.11.2026", "", 1, pages) == "check_original"
    # Non-existent policy number
    assert verify_evidence("Policy CLM-999", "", 1, pages) == "check_original"


def test_password_pdf_handling(client):
    import io
    import pypdf
    from main import IP_REQUESTS
    IP_REQUESTS.clear()

    # Create an encrypted PDF in memory
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.encrypt("correct_pass_123")
    buf = io.BytesIO()
    writer.write(buf)
    encrypted_pdf_bytes = buf.getvalue()

    # 1. Missing password -> 422 pdf_password_required
    files = [("files", ("secure.pdf", encrypted_pdf_bytes, "application/pdf"))]
    res = client.post("/api/explain", files=files, data={"lang": "en"})
    assert res.status_code == 422
    assert res.json().get("error") == "pdf_password_required"

    # 2. Wrong password -> 422 pdf_password_wrong
    files = [("files", ("secure.pdf", encrypted_pdf_bytes, "application/pdf"))]
    res = client.post("/api/explain", files=files, data={"lang": "en", "password": "wrong_pass_999"})
    assert res.status_code == 422
    assert res.json().get("error") == "pdf_password_wrong"

    # 3. Correct password -> decrypts and succeeds
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            document_type="other",
            title="Decrypted Document",
            language="en",
            summary=["Decrypted successfully."],
        )
        files = [("files", ("secure.pdf", encrypted_pdf_bytes, "application/pdf"))]
        res = client.post("/api/explain", files=files, data={"lang": "en", "password": "correct_pass_123"})
        assert res.status_code == 200
        assert res.json()["title"] == "Decrypted Document"


def test_telugu_malayalam_kannada_digit_normalization():
    from evidence import normalize_digits, verify_translation_guard

    # Telugu digits
    te_str = "మొత్తం: ౧,౨౦౦ రూపాయలు"  # 1,200
    assert "1,200" in normalize_digits(te_str)

    # Kannada digits
    kn_str = "ಒಟ್ಟು: ೩೧,೨೦೦ ರೂಪಾಯಿ"  # 31,200
    assert "31,200" in normalize_digits(kn_str)

    # Malayalam digits
    ml_str = "ആകെ: ൧,൦൦,൦൦൦ രൂപ"  # 1,00,000
    assert "1,00,000" in normalize_digits(ml_str)

    # Guard verification across scripts
    orig = "Amount: Rs. 1,200 due on 30.11.2026"
    trans_te = "మొత్తం: ₹ ౧,౨౦౦ తేదీ 30.11.2026"
    assert verify_translation_guard(orig, trans_te) is True

    trans_kn = "ಮೊತ್ತ: ₹ ೧,೨೦೦ ದಿನಾಂಕ 30.11.2026"
    assert verify_translation_guard(orig, trans_kn) is True


def test_medicine_frequency_decoding_15_patterns():
    from medicines import decode_medicine_frequency

    # 1. 1-0-1
    code, slots, food, dur, dec = decode_medicine_frequency("1-0-1")
    assert code == "1-0-1"
    assert slots == ["morning", "night"]
    assert dec is True

    # 2. 1-1-1
    code, slots, food, dur, dec = decode_medicine_frequency("1-1-1")
    assert code == "1-1-1"
    assert slots == ["morning", "afternoon", "night"]
    assert dec is True

    # 3. 0-0-1
    code, slots, food, dur, dec = decode_medicine_frequency("0-0-1")
    assert code == "0-0-1"
    assert slots == ["night"]
    assert dec is True

    # 4. 1-1-1-1
    code, slots, food, dur, dec = decode_medicine_frequency("1-1-1-1")
    assert code == "1-1-1-1"
    assert slots == ["morning", "afternoon", "evening", "night"]
    assert dec is True

    # 5. 0-1-0
    code, slots, food, dur, dec = decode_medicine_frequency("0-1-0")
    assert code == "0-1-0"
    assert slots == ["afternoon"]
    assert dec is True

    # 6. 1-0-0
    code, slots, food, dur, dec = decode_medicine_frequency("1-0-0")
    assert code == "1-0-0"
    assert slots == ["morning"]
    assert dec is True

    # 7. OD
    code, slots, food, dur, dec = decode_medicine_frequency("OD")
    assert code == "OD"
    assert slots == ["morning"]
    assert dec is True

    # 8. BD
    code, slots, food, dur, dec = decode_medicine_frequency("BD")
    assert code == "BD"
    assert slots == ["morning", "night"]
    assert dec is True

    # 9. TDS
    code, slots, food, dur, dec = decode_medicine_frequency("TDS")
    assert code == "TDS"
    assert slots == ["morning", "afternoon", "night"]
    assert dec is True

    # 10. QID
    code, slots, food, dur, dec = decode_medicine_frequency("QID")
    assert code == "QID"
    assert slots == ["morning", "afternoon", "evening", "night"]
    assert dec is True

    # 11. HS
    code, slots, food, dur, dec = decode_medicine_frequency("HS")
    assert code == "HS"
    assert slots == ["bedtime"]
    assert dec is True

    # 12. SOS
    code, slots, food, dur, dec = decode_medicine_frequency("SOS")
    assert code == "SOS"
    assert dec is True

    # 13. PRN
    code, slots, food, dur, dec = decode_medicine_frequency("PRN")
    assert code == "SOS"
    assert dec is True

    # 14. 1 tab BD PC x 5 days
    code, slots, food, dur, dec = decode_medicine_frequency("1 tab BD PC x 5 days")
    assert code == "BD"
    assert food == "after_food"
    assert dur == 5
    assert dec is True

    # 15. 2 caps TDS AC for 2 weeks
    code, slots, food, dur, dec = decode_medicine_frequency("2 caps TDS AC for 2 weeks")
    assert code == "TDS"
    assert food == "before_food"
    assert dur == 14
    assert dec is True

    # 16. HS after food
    code, slots, food, dur, dec = decode_medicine_frequency("HS after food")
    assert code == "HS"
    assert food == "after_food"
    assert slots == ["bedtime"]
    assert dec is True


def test_to_speech_15_patterns():
    from tts import to_speech

    # 1. Rs. 1,200 in ta -> ரூபாய்
    res1 = to_speech("Rs. 1,200", "ta")
    assert "1,200 ரூபாய்" in res1

    # 2. ₹500 in hi -> रुपये
    res2 = to_speech("₹500", "hi")
    assert "500 रुपये" in res2

    # 3. INR 10,000 in en -> rupees
    res3 = to_speech("INR 10,000", "en")
    assert "10,000 rupees" in res3

    # 4. Rs. 5 Lac in en -> 5 lakh rupees
    res4 = to_speech("Rs. 5 Lac", "en")
    assert "5 lakh rupees" in res4

    # 5. 5 Lakh in ta -> 5 லட்சம் ரூபாய்
    res5 = to_speech("5 Lakh", "ta")
    assert "5 லட்சம் ரூபாய்" in res5

    # 6. ₹ 10 Crore in hi -> 10 करोड़ रुपये
    res6 = to_speech("₹ 10 Crore", "hi")
    assert "10 करोड़ रुपये" in res6

    # 7. 30.11.2026 in ta -> நவம்பர்
    res7 = to_speech("30.11.2026", "ta")
    assert "30 நவம்பர் 2026" in res7

    # 8. 02-10-2026 in hi -> अक्टूबर
    res8 = to_speech("02-10-2026", "hi")
    assert "2 अक्टूबर 2026" in res8

    # 9. 01/01/2026 in en -> January
    res9 = to_speech("01/01/2026", "en")
    assert "1 January 2026" in res9

    # 10. 12-09-2026 in te -> digits preserved
    res10 = to_speech("12-09-2026", "te")
    assert "12-09-2026" in res10

    # 11. 15-08-2026 in ml -> digits preserved
    res11 = to_speech("15-08-2026", "ml")
    assert "15-08-2026" in res11

    # 12. 25-12-2026 in kn -> digits preserved
    res12 = to_speech("25-12-2026", "kn")
    assert "25-12-2026" in res12

    # 13. 1,200 Rs in en
    res13 = to_speech("1,200 Rs", "en")
    assert "1,200 rupees" in res13

    # 14. 5000 INR in hi
    res14 = to_speech("5000 INR", "hi")
    assert "5000 रुपये" in res14

    # 15. ₹31,200 in te
    res15 = to_speech("₹31,200", "te")
    assert "31,200 రూపాయలు" in res15


def test_speak_endpoint(client):
    from main import IP_REQUESTS
    IP_REQUESTS.clear()

    # 1. Text > 1200 characters returns 422
    long_text = "a" * 1201
    res = client.post("/api/speak", json={"text": long_text, "lang": "en"})
    assert res.status_code == 422
    assert res.json().get("error") == "text_too_long"

    # 2. Successful synthesis
    with patch("main.synthesize_speech") as mock_synth:
        mock_synth.return_value = b"\xff\xfb\x90\x44"  # Fake MP3 bytes
        res = client.post("/api/speak", json={"text": "Please pay Rs. 500.", "lang": "en", "voice": "female"})
        assert res.status_code == 200
        assert res.headers["content-type"] == "audio/mpeg"
        assert res.headers["cache-control"] == "no-store"
        assert res.content == b"\xff\xfb\x90\x44"

    # 3. TTS service failure returns 503
    with patch("main.synthesize_speech", side_effect=RuntimeError("TTS failure")):
        res = client.post("/api/speak", json={"text": "Hello", "lang": "en"})
        assert res.status_code == 503
        assert res.json().get("error") == "tts_unavailable"


def test_ask_endpoint(client):
    from main import IP_REQUESTS
    from models import AskResponse
    IP_REQUESTS.clear()

    # 1. Question > 500 chars returns 400
    long_q = "q" * 501
    res = client.post("/api/ask", data={"question": long_q, "lang": "en", "result": "{}"})
    assert res.status_code == 400

    # 2. Result > 200 KB returns 400
    huge_result = "{" + "a" * (205 * 1024) + "}"
    res = client.post("/api/ask", data={"question": "What is the fee?", "lang": "en", "result": huge_result})
    assert res.status_code == 400

    # 3. Unverified answer numbers returns 422 ask_unverified
    with patch("main.ask_document") as mock_ask:
        from errors import AskUnverifiedError
        mock_ask.side_effect = AskUnverifiedError("Unverified number")
        res = client.post("/api/ask", data={"question": "What is the penalty?", "lang": "en", "result": '{"title": "Test"}'})
        assert res.status_code == 422
        assert res.json().get("error") == "ask_unverified"

    # 4. Verified answer returns 200
    with patch("main.ask_document") as mock_ask:
        mock_ask.return_value = AskResponse(
            answer="The due date is 30.11.2026.",
            quote="Due date: 30.11.2026",
            page=1,
            evidence="matched",
            answered_from="document",
            not_found=False,
            language="en",
        )
        res = client.post("/api/ask", data={"question": "When is the due date?", "lang": "en", "result": '{"title": "Test"}'})
        assert res.status_code == 200
        body = res.json()
        assert body["answer"] == "The due date is 30.11.2026."
        assert body["evidence"] == "matched"
        assert body["not_found"] is False

def test_spoken_summary_digit_guard():
    from evidence import verify_spoken_summary_digit_guard

    doc_text = "Notice: Submit Life Certificate by 30.11.2026. Monthly pension amount is Rs. 1,200. Ref: OAP/2019/4417."
    allowed_nums = {"1200", "30", "11", "2026", "2019", "4417"}

    # 1. Valid spoken summary with matching numbers
    valid_summary = "Please submit your life certificate by 30.11.2026 to continue receiving your monthly pension of Rs. 1200."
    is_valid, unverified = verify_spoken_summary_digit_guard(valid_summary, doc_text, allowed_numbers=allowed_nums)
    assert is_valid is True
    assert len(unverified) == 0

    # 2. Spoken summary with hallucinated amount (e.g. Rs. 5000 not in document)
    invalid_summary = "Please submit your certificate to receive Rs. 5000 by 30.11.2026."
    is_valid, unverified = verify_spoken_summary_digit_guard(invalid_summary, doc_text, allowed_numbers=allowed_nums)
    assert is_valid is False
    assert "5000" in unverified

    # 3. Spoken summary with Indic digits that match
    indic_summary = "कृपया अपनी ३०.११.२०२६ तक प्रक्रिया पूरी करें।"
    is_valid, unverified = verify_spoken_summary_digit_guard(indic_summary, doc_text, allowed_numbers=allowed_nums)
    assert is_valid is True
    assert len(unverified) == 0


def test_prescription_medicines_mapping_regression(client):
    from models import ReaderMedicine, ReaderResponse, MedicineInfo
    from main import IP_REQUESTS
    IP_REQUESTS.clear()

    # 1. Verify MedicineInfo schema attributes: has strength_text & frequency_raw, NOT dosage
    med = MedicineInfo(
        name="Paracetamol",
        strength_text="500mg",
        frequency_code="1-0-1",
        frequency_raw="1-0-1",
        slots=["morning", "night"],
        food_timing="after_food",
        duration_days=5,
        instruction_text="Take 1 tablet morning and night after food",
        decoded=True,
        quote="Paracetamol 500mg 1-0-1",
        page=1,
        evidence="check_original",
    )
    assert hasattr(med, "strength_text")
    assert hasattr(med, "frequency_raw")
    assert not hasattr(med, "dosage")
    with pytest.raises(AttributeError):
        _ = getattr(med, "dosage")

    # 2. Call /api/explain with mocked ReaderResponse returning medicines
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="medical",
            document_type="medical",
            document_language="en",
            language="en",
            source_kind="text_pdf",
            title="Medical Prescription",
            summary=["Prescription for viral fever with 2 medicines."],
            spoken_summary="This is a medical prescription for fever. Take Paracetamol 500mg twice daily and Cetirizine 10mg at night.",
            actions=[],
            warnings=[],
            facts=[],
            medicines=[
                ReaderMedicine(
                    name="Paracetamol",
                    strength_text="500mg",
                    frequency_raw="1-0-1",
                    food_timing="after_food",
                    duration_days=5,
                    instruction_text="Take 1 tablet in the morning and night after food",
                    quote="Tab Paracetamol 500mg 1-0-1 x 5 days",
                    page=1,
                ),
                ReaderMedicine(
                    name="Cetirizine",
                    strength_text="10mg",
                    frequency_raw="0-0-1",
                    food_timing="after_food",
                    duration_days=3,
                    instruction_text="Take 1 tablet at night",
                    quote="Tab Cetirizine 10mg 0-0-1 x 3 days",
                    page=1,
                ),
            ],
            places=[],
            contacts=[],
            conflicts=[],
            protected_terms=["Dr. Sharma", "Apollo Pharmacy"],
        )

        files = [("files", ("prescription.pdf", b"%PDF-1.4 test", "application/pdf"))]
        res = client.post("/api/explain", files=files, data={"lang": "en"})
        assert res.status_code == 200, f"Expected 200 but got {res.status_code}: {res.text}"
        body = res.json()
        assert len(body["medicines"]) == 2
        m0 = body["medicines"][0]
        assert m0["name"] == "Paracetamol"
        assert m0["strength_text"] == "500mg"
        assert m0["frequency_code"] == "1-0-1"
        assert m0["slots"] == ["morning", "night"]
        assert m0["food_timing"] == "after_food"
        assert m0["duration_days"] == 5
        assert m0["decoded"] is True

        # 3. Test /api/translate preserves medicines mapping and translates instructions
        explain_resp = res.json()
        with patch("main.translate_keyed_strings") as mock_trans:
            mock_trans.return_value = {
                "title": "மருத்துவ மருந்துச்சீட்டு",
                "summary_0": "2 மருந்துகளுடன் காய்ச்சலுக்கான மருந்துச்சீட்டு.",
                "spoken_summary": "இது காய்ச்சலுக்கான மருத்துவ மருந்துச்சீட்டு.",
                "med_0_instruction": "காலை மற்றும் இரவு உணவுக்கு பின் 1 மாத்திரை எடுக்கவும்",
                "med_1_instruction": "இரவு 1 மாத்திரை எடுக்கவும்",
            }
            trans_res = client.post(
                "/api/translate",
                json={"result": explain_resp, "lang": "ta"},
            )
            assert trans_res.status_code == 200, f"Expected 200 but got {trans_res.status_code}: {trans_res.text}"
            trans_body = trans_res.json()
            assert len(trans_body["medicines"]) == 2
            assert trans_body["medicines"][0]["name"] == "Paracetamol"
            assert trans_body["medicines"][0]["strength_text"] == "500mg"
            assert trans_body["medicines"][0]["frequency_code"] == "1-0-1"
            assert trans_body["medicines"][0]["instruction_text"] == "காலை மற்றும் இரவு உணவுக்கு பின் 1 மாத்திரை எடுக்கவும்"


def test_spoken_summary_natural_date_rendering_hi_ta(client):
    from tts import render_iso_dates_natural
    from main import IP_REQUESTS
    IP_REQUESTS.clear()

    # 1. Direct function tests for hi and ta
    hi_rendered = render_iso_dates_natural("Submit your life certificate by 2026-11-30.", "hi")
    assert "30 नवंबर 2026" in hi_rendered
    assert "2026-11-30" not in hi_rendered

    ta_rendered = render_iso_dates_natural("Submit your life certificate by 2026-11-30.", "ta")
    assert "30 நவம்பர் 2026" in ta_rendered
    assert "2026-11-30" not in ta_rendered

    # Also test month with single digit day e.g. 2026-05-04
    assert "4 मई 2026" in render_iso_dates_natural("Event on 2026-05-04.", "hi")
    assert "4 மே 2026" in render_iso_dates_natural("Event on 2026-05-04.", "ta")

    # 2. Test in /api/translate endpoint for both hi and ta
    sample_result = {
        "title": "Pension Notice",
        "language": "en",
        "summary": ["Submit life certificate by 30 November 2026."],
        "spoken_summary": "Please submit your life certificate by 2026-11-30 to receive your pension.",
        "actions": [{
            "text": "Submit certificate",
            "due_date": "30.11.2026",
            "quote": "Submit by 30.11.2026",
            "page": 1,
            "evidence": "check_original",
        }],
        "warnings": [],
        "facts": [],
        "places": [],
        "contacts": [],
        "medicines": [],
        "conflicts": [],
        "protected_terms": [],
        "evidence_summary": {"total_items": 1, "matched": 0, "check_original": 1, "calculated": 0},
    }

    # Translate to hi: model returns translated text that may retain or contain ISO date
    with patch("main.translate_keyed_strings") as mock_trans:
        mock_trans.return_value = {
            "title": "पेंशन सूचना",
            "summary_0": "30 नवंबर 2026 तक जीवन प्रमाण पत्र जमा करें।",
            "action_0_text": "प्रमाण पत्र जमा करें",
            "spoken_summary": "कृपया अपनी पेंशन प्राप्त करने के लिए 2026-11-30 तक अपना जीवन प्रमाण पत्र जमा करें।",
        }
        res_hi = client.post("/api/translate", json={"result": sample_result, "lang": "hi"})
        assert res_hi.status_code == 200, res_hi.text
        hi_body = res_hi.json()
        assert "30 नवंबर 2026" in hi_body["spoken_summary"]
        assert "2026-11-30" not in hi_body["spoken_summary"]

    # Translate to ta: model returns translated text that retains or contains ISO date
    with patch("main.translate_keyed_strings") as mock_trans:
        mock_trans.return_value = {
            "title": "ஓய்வூதிய அறிவிப்பு",
            "summary_0": "30 நவம்பர் 2026க்குள் வாழ்வுச் சான்றிதழை சமர்ப்பிக்கவும்.",
            "action_0_text": "சான்றிதழை சமர்ப்பிக்கவும்",
            "spoken_summary": "உங்கள் ஓய்வூதியத்தைப் பெற 2026-11-30க்குள் உங்கள் வாழ்வுச் சான்றிதழை சமர்ப்பிக்கவும்.",
        }
        res_ta = client.post("/api/translate", json={"result": sample_result, "lang": "ta"})
        assert res_ta.status_code == 200, res_ta.text
        ta_body = res_ta.json()
        assert "30 நவம்பர் 2026" in ta_body["spoken_summary"]
        assert "2026-11-30" not in ta_body["spoken_summary"]


