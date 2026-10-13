import io
import logging
from pathlib import Path

import pypdf
import pytest
from fastapi.testclient import TestClient

from filecheck import classify_upload
from main import IP_REQUESTS, app
from models import ReaderAction, ReaderResponse
from unittest.mock import patch

JPEG_BYTES = b"\xff\xd8\xff" + b"jpeg"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"png"


def _tiny_pdf() -> bytes:
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=72, height=72)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


@pytest.fixture
def client():
    IP_REQUESTS.clear()
    return TestClient(app)


def test_classify_empty_bad_magic_and_closed_pdf():
    assert classify_upload(b"", "application/pdf") == "empty"
    assert classify_upload(None, "image/jpeg") == "empty"
    assert classify_upload(b"MZ\x00\x00", "application/pdf") == "bad_magic"
    assert classify_upload(b"not-a-jpeg", "image/jpeg") == "bad_magic"
    assert classify_upload(b"not-a-png", "image/png") == "bad_magic"
    assert classify_upload(JPEG_BYTES, "image/jpeg") == "ok"
    assert classify_upload(PNG_BYTES, "image/png") == "ok"
    assert classify_upload(_tiny_pdf(), "application/pdf") == "ok"
    assert classify_upload(b"%PDF-1.4\nnot a real pdf", "application/pdf") == "pdf_unopenable"


def test_pdf_header_anywhere_in_first_1024_bytes():
    pdf = _tiny_pdf()
    assert pdf.startswith(b"%PDF-")
    assert classify_upload(b"\xef\xbb\xbf" + pdf, "application/pdf") == "ok"
    offset = b"\r\n" + b"%PDF-1.4\nnot a real pdf"
    assert classify_upload(offset, "application/pdf") == "pdf_unopenable"
    assert classify_upload(b"x" * 1024 + pdf, "application/pdf") == "bad_magic"


def test_txt_still_rejected_as_wrong_type(client):
    res = client.post(
        "/api/explain",
        files=[("files", ("note.txt", b"hello", "text/plain"))],
        data={"lang": "en"},
    )
    assert res.status_code == 400
    assert "Invalid file type" in res.json()["message"]


def test_empty_pdf_is_400(client):
    res = client.post(
        "/api/explain",
        files=[("files", ("empty.pdf", b"", "application/pdf"))],
        data={"lang": "ta"},
    )
    body = res.json()
    assert res.status_code == 400
    assert body["error"] == "file_cannot_open"
    assert body["message"] == "This file can't be opened. Please choose another file."
    assert body["message_local"] != body["message"]
    assert "empty.pdf" not in body["message"]
    assert "empty.pdf" not in body["message_local"]


def test_renamed_exe_is_400(client):
    res = client.post(
        "/api/explain",
        files=[("files", ("run.pdf", b"MZ\x90\x00" + b"\x00" * 32, "application/pdf"))],
        data={"lang": "hi"},
    )
    body = res.json()
    assert res.status_code == 400
    assert body["error"] == "file_cannot_open"
    assert "MZ" not in body["message"]


def test_corrupt_pdf_is_422(client):
    res = client.post(
        "/api/explain",
        files=[("files", ("broken.pdf", b"%PDF-1.4\nnot a real pdf", "application/pdf"))],
        data={"lang": "bn"},
    )
    body = res.json()
    assert res.status_code == 422
    assert body["error"] == "file_cannot_open"
    assert body["message_local"] != body["message"]


def test_warranty_sample_48_hours_is_calculated(client):
    """Invoice sample: 08 Oct 2026 plus the out-of-box 48-hour quote."""
    quote = (
        "Out-of-box defect: report to the store within 48 hours of purchase "
        "with this invoice and the original packing."
    )
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="receipt",
            title="Phone invoice",
            language="en",
            letter_date="08 Oct 2026",
            summary=["Invoice for a phone."],
            actions=[
                ReaderAction(
                    text="Report an out-of-box defect within 48 hours of purchase.",
                    quote=quote,
                    page=1,
                )
            ],
        )
        res = client.post(
            "/api/explain",
            files=[("files", ("invoice.jpg", JPEG_BYTES, "image/jpeg"))],
            data={"lang": "en"},
        )
    assert res.status_code == 200
    action = res.json()["actions"][0]
    assert action["due_date"] == "2026-10-10"
    assert action["date_status"] == "calculated"
    assert action["evidence"] == "calculated"
    assert action["deadline_days"] == 2

    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="receipt",
            title="Phone invoice",
            language="en",
            letter_date=None,
            summary=["Invoice for a phone."],
            actions=[
                ReaderAction(
                    text="Report an out-of-box defect within 48 hours of purchase.",
                    quote=quote,
                    page=1,
                )
            ],
        )
        res = client.post(
            "/api/explain",
            files=[("files", ("invoice.jpg", JPEG_BYTES, "image/jpeg"))],
            data={"lang": "en"},
        )
    assert res.status_code == 200
    action = res.json()["actions"][0]
    assert action["due_date"] is None
    assert action["date_status"] != "calculated"


def test_explain_infers_warranty_hours_from_quote(client):
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="receipt",
            title="Phone invoice",
            language="en",
            letter_date="2026-10-08",
            summary=["Invoice for a phone."],
            actions=[
                ReaderAction(
                    text="Report a defect within 48 hours of purchase.",
                    quote="Report a defect within 48 hours of purchase.",
                    page=1,
                )
            ],
        )
        res = client.post(
            "/api/explain",
            files=[("files", ("invoice.jpg", JPEG_BYTES, "image/jpeg"))],
            data={"lang": "en"},
        )
    assert res.status_code == 200
    action = res.json()["actions"][0]
    assert action["due_date"] == "2026-10-10"
    assert action["deadline_days"] == 2
    assert action["date_status"] == "calculated"
    assert action["evidence"] == "calculated"
    assert "is_past" not in action


def test_docs_are_hidden(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404


USER_PASSWORD = "Test1234"
OWNER_PASSWORD = "OwnerOnly99"


def _encrypt_insurance(user_password: str, owner_password: str | None = None) -> bytes:
    sample = Path(__file__).resolve().parents[1] / "samples" / "sample-insurance-letter.pdf"
    reader = pypdf.PdfReader(io.BytesIO(sample.read_bytes()))
    writer = pypdf.PdfWriter()
    writer.append(reader)
    if owner_password is None:
        writer.encrypt(user_password, algorithm="AES-256")
    else:
        writer.encrypt(user_password, owner_password, algorithm="AES-256")
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _assert_secret_absent(text: str) -> None:
    assert USER_PASSWORD not in text
    assert OWNER_PASSWORD not in text


def test_encrypted_insurance_pdf_reaches_password_logic(client, caplog):
    caplog.set_level(logging.DEBUG)
    user_pdf = _encrypt_insurance(USER_PASSWORD)
    owner_pdf = _encrypt_insurance("", OWNER_PASSWORD)
    assert classify_upload(user_pdf, "application/pdf") == "ok"
    assert classify_upload(owner_pdf, "application/pdf") == "ok"

    files = [("files", ("letter.pdf", user_pdf, "application/pdf"))]

    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="insurance",
            title="Insurance letter",
            language="en",
            summary=["Opened."],
        )

        res = client.post("/api/explain", files=files, data={"lang": "en"})
        assert res.status_code == 422
        assert res.json().get("error") == "pdf_password_required"
        _assert_secret_absent(res.text)
        mock_read.assert_not_called()

        res = client.post(
            "/api/explain",
            files=files,
            data={"lang": "en", "password": "not-the-password"},
        )
        assert res.status_code == 422
        assert res.json().get("error") == "pdf_password_wrong"
        _assert_secret_absent(res.text)
        mock_read.assert_not_called()

        res = client.post(
            "/api/explain",
            files=files,
            data={"lang": "en", "password": USER_PASSWORD},
        )
        assert res.status_code == 200
        mock_read.assert_called_once()
        sent = mock_read.call_args[0][0][0][0]
        opened = pypdf.PdfReader(io.BytesIO(sent))
        assert opened.is_encrypted is False
        assert len(opened.pages) >= 1

        mock_read.reset_mock()
        owner_files = [("files", ("letter.pdf", owner_pdf, "application/pdf"))]
        res = client.post("/api/explain", files=owner_files, data={"lang": "en"})
        assert res.status_code == 200
        mock_read.assert_called_once()
        owner_sent = mock_read.call_args[0][0][0][0]
        owner_opened = pypdf.PdfReader(io.BytesIO(owner_sent))
        assert owner_opened.is_encrypted is False

    _assert_secret_absent(caplog.text)
    explain_hits = [len(v) for k, v in IP_REQUESTS.items() if k[0] == "explain"]
    assert explain_hits and explain_hits[0] >= 4


# Invoice date 08 Oct 2026. "Within 48 hours" is 10 Oct 2026.
# The model instead returns today + 2 days (15 Oct) and a wrong day count.
_RELATIVE_QUOTES = {
    "en": "Report a defect within 48 hours of purchase.",
    "hi": "खरीद के 48 घंटे के भीतर दोष बताएं।",
    "ta": "வாங்கிய 48 மணி நேரத்திற்குள் குறை தெரிவிக்கவும்.",
    "te": "కొనుగోలు చేసిన 48 గంటలలోపు లోపం తెలియజేయండి.",
    "ml": "വാങ്ങിയ 48 മണിക്കൂറിനുള്ളിൽ പറയുക.",
    "kn": "ಖರೀದಿಸಿದ 48 ಗಂಟೆಗಳ ಒಳಗೆ ತಿಳಿಸಿ.",
    "mr": "खरेदीच्या 48 तासांच्या आत कळवा.",
    "bn": "কেনার 48 ঘণ্টার মধ্যে জানান।",
    "or": "କିଣିବାର 48 ଘଣ୍ଟା ମଧ୍ୟରେ ଜଣାନ୍ତୁ।",
}


def test_relative_deadline_every_language_overrides_today(client):
    for lang, quote in _RELATIVE_QUOTES.items():
        IP_REQUESTS.clear()
        with patch("main.read_document") as mock_read:
            mock_read.return_value = ReaderResponse(
                doc_type="receipt",
                title="Phone invoice",
                language=lang,
                letter_date="2026-10-08",
                summary=["Invoice for a phone."],
                actions=[
                    ReaderAction(
                        text=quote,
                        due_date="2026-10-15",
                        deadline_days=7,
                        deadline_anchor="letter_date",
                        quote=quote,
                        page=1,
                    )
                ],
            )
            res = client.post(
                "/api/explain",
                files=[("files", ("invoice.jpg", JPEG_BYTES, "image/jpeg"))],
                data={"lang": lang},
            )
        assert res.status_code == 200, lang
        action = res.json()["actions"][0]
        assert action["due_date"] == "2026-10-10", lang
        assert action["date_status"] == "calculated", lang
        assert action["evidence"] == "calculated", lang
        assert action["deadline_days"] == 2, lang
        assert action["text"] == quote


def test_relative_deadline_drops_unparsed_and_keeps_matched_date(client):
    IP_REQUESTS.clear()
    unparsed = "खरीद के कई घंटे के भीतर बताएं।"
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="receipt",
            title="Phone invoice",
            language="hi",
            letter_date="2026-10-13",
            summary=["Invoice for a phone."],
            actions=[
                ReaderAction(
                    text="दोष बताएं।",
                    due_date="2026-10-15",
                    deadline_days=2,
                    deadline_anchor="letter_date",
                    quote=unparsed,
                    page=1,
                )
            ],
        )
        res = client.post(
            "/api/explain",
            files=[("files", ("invoice.jpg", JPEG_BYTES, "image/jpeg"))],
            data={"lang": "hi"},
        )
    assert res.status_code == 200
    action = res.json()["actions"][0]
    assert action["due_date"] is None
    assert action["date_status"] != "calculated"
    assert action["evidence"] != "calculated"
    assert action["text"] == "दोष बताएं।"

    IP_REQUESTS.clear()
    with patch("main.read_document") as mock_read:
        mock_read.return_value = ReaderResponse(
            doc_type="receipt",
            title="Phone invoice",
            language="hi",
            letter_date=None,
            summary=["Invoice for a phone."],
            actions=[
                ReaderAction(
                    text=_RELATIVE_QUOTES["hi"],
                    due_date="2026-10-15",
                    quote=_RELATIVE_QUOTES["hi"],
                    page=1,
                )
            ],
        )
        res = client.post(
            "/api/explain",
            files=[("files", ("invoice.jpg", JPEG_BYTES, "image/jpeg"))],
            data={"lang": "hi"},
        )
    assert res.status_code == 200
    action = res.json()["actions"][0]
    assert action["due_date"] is None
    assert action["date_status"] != "calculated"
    assert action["evidence"] != "calculated"

    IP_REQUESTS.clear()
    matched_quote = "Pay by 30 November 2026."
    with patch("main.read_document") as mock_read, patch("main.extract_pdf_pages") as mock_pages:
        mock_pages.return_value = [
            "Shop invoice. Date: 08 October 2026. Pay by 30 November 2026."
        ]
        mock_read.return_value = ReaderResponse(
            doc_type="receipt",
            title="Phone invoice",
            language="en",
            letter_date="2026-10-08",
            summary=["Invoice for a phone."],
            actions=[
                ReaderAction(
                    text="Pay by 30 November 2026.",
                    due_date="2026-11-30",
                    quote=matched_quote,
                    page=1,
                )
            ],
        )
        res = client.post(
            "/api/explain",
            files=[("files", ("invoice.pdf", _tiny_pdf(), "application/pdf"))],
            data={"lang": "en"},
        )
    assert res.status_code == 200
    action = res.json()["actions"][0]
    assert action["due_date"] == "2026-11-30"
    assert action["date_status"] == "upcoming"
    assert action["evidence"] == "matched"
    assert action["text"] == "Pay by 30 November 2026."


def test_reader_prompt_does_not_give_the_model_today():
    from reader import READER_PROMPT_TEMPLATE

    assert "{TODAY}" not in READER_PROMPT_TEMPLATE
    assert "never from today" in READER_PROMPT_TEMPLATE
    rendered = READER_PROMPT_TEMPLATE.format(LANG="Hindi")
    assert "Today is" not in rendered
    assert "Count a relative deadline from that document date" in rendered
