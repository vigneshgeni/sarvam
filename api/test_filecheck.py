import io

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
