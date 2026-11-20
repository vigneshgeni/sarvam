import base64
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from formfill.router import (
    ExtractedPair,
    GeminiDetectField,
    GeminiDetectResponse,
    GeminiExtractResponse,
    clamp_box,
)
from main import app

client = TestClient(app)

TINY_JPEG_B64 = base64.b64encode(b"\xff\xd8\xff\xe0\x00\x10JFIF\xff\xd9").decode("ascii")


def test_clamp_box_bounds_and_order():
    assert clamp_box([-20, 1200, 500, 100]) == [0.0, 100.0, 500.0, 1000.0]
    assert clamp_box([600, 400, 200, 100]) == [200.0, 100.0, 600.0, 400.0]
    # Degenerate zero-width box gets minimum 4-unit span within 0..1000
    assert clamp_box([999, 999, 999, 999]) == [995.0, 995.0, 999.0, 999.0]


def test_detect_validates_clamps_and_blocks_signature_photo_profile_keys():
    fake_parsed = GeminiDetectResponse(
        formTitle="KYC Update Form",
        fields=[
            GeminiDetectField(
                id="full_name",
                label="Full Name",
                type="text",
                box=[320, 140, 920, 195],
                page=0,
                profileKey="fullName",
                required=True,
            ),
            GeminiDetectField(
                id="pan",
                label="PAN",
                type="charGrid",
                box=[-10, 420, 1050, 470],
                page=5,  # out of range, must clamp to 0
                profileKey="pan",
                cells=10,
                required=True,
            ),
            GeminiDetectField(
                id="signature",
                label="Applicant Signature",
                type="signature",
                box=[600, 860, 920, 940],
                page=0,
                profileKey="fullName",  # must be stripped!
                required=True,  # must be forced False!
            ),
            GeminiDetectField(
                id="photo",
                label="Passport Photo",
                type="photo",
                box=[780, 60, 950, 220],
                page=0,
                profileKey="fullName",  # must be stripped!
                required=True,
            ),
        ],
    )
    fake_resp = SimpleNamespace(parsed=fake_parsed, text="", usage_metadata=None)
    mock_genai = MagicMock()
    mock_genai.models.generate_content.return_value = fake_resp

    with patch("reader.get_client", return_value=mock_genai):
        res = client.post(
            "/api/formfill/detect",
            json={"images": [f"data:image/jpeg;base64,{TINY_JPEG_B64}"]},
        )

    assert res.status_code == 200
    data = res.json()
    assert data["formTitle"] == "KYC Update Form"
    assert len(data["fields"]) == 4

    pan = data["fields"][1]
    assert pan["box"] == [0.0, 420.0, 1000.0, 470.0]
    assert pan["page"] == 0
    assert pan["cells"] == 10

    sig = data["fields"][2]
    assert sig["type"] == "signature"
    assert sig["profileKey"] is None
    assert sig["required"] is False

    photo = data["fields"][3]
    assert photo["type"] == "photo"
    assert photo["profileKey"] is None
    assert photo["required"] is False


def test_detect_rejects_bad_base64():
    res = client.post("/api/formfill/detect", json={"images": ["not-valid-base64!!!"]})
    assert res.status_code == 400


def test_extract_returns_null_for_unknown_and_skips_signature():
    fake_parsed = GeminiExtractResponse(
        items=[
            ExtractedPair(id="nominee_name", value="Priya S"),
            ExtractedPair(id="nominee_relation", value="Spouse"),
            ExtractedPair(id="occupation", value=None),
            ExtractedPair(id="invented_field", value="ShouldNotAppear"),
            ExtractedPair(id="signature", value="Signed"),
        ]
    )
    fake_resp = SimpleNamespace(parsed=fake_parsed, text="", usage_metadata=None)
    mock_genai = MagicMock()
    mock_genai.models.generate_content.return_value = fake_resp

    with patch("reader.get_client", return_value=mock_genai):
        res = client.post(
            "/api/formfill/extract",
            json={
                "fields": [
                    {"id": "nominee_name", "label": "Nominee", "type": "text"},
                    {"id": "nominee_relation", "label": "Relation", "type": "text"},
                    {"id": "occupation", "label": "Occupation", "type": "text"},
                    {"id": "signature", "label": "Signature", "type": "signature"},
                ],
                "transcript": "Priya S, my spouse.",
            },
        )

    assert res.status_code == 200
    data = res.json()
    assert data == {
        "nominee_name": "Priya S",
        "nominee_relation": "Spouse",
        "occupation": None,
    }
    assert "signature" not in data
    assert "invented_field" not in data


def test_extract_empty_transcript_never_calls_gemini():
    mock_genai = MagicMock()
    with patch("reader.get_client", return_value=mock_genai):
        res = client.post(
            "/api/formfill/extract",
            json={
                "fields": [{"id": "nominee_name", "label": "Nominee", "type": "text"}],
                "transcript": "   ",
            },
        )
    assert res.status_code == 200
    assert res.json() == {"nominee_name": None}
    mock_genai.models.generate_content.assert_not_called()
