"""Assistive Gemini read of a document photo. Never stored. Never used to score matches."""

from __future__ import annotations

import logging
import re
from typing import Any

from lf.config import get_settings

log = logging.getLogger("lf.extract")

AADHAAR_12 = re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b")


def strip_aadhaar(text: str) -> tuple[str, str | None]:
    last4 = None

    def repl(match: re.Match[str]) -> str:
        nonlocal last4
        digits = re.sub(r"\D", "", match.group(0))
        last4 = digits[-4:]
        return "[hidden]"

    return AADHAAR_12.sub(repl, text or ""), last4


def reduce_aadhaar_fields(fields: dict[str, Any]) -> dict[str, Any]:
    out = dict(fields)
    number = str(out.get("idNumber") or "")
    digits = re.sub(r"\D", "", number)
    if len(digits) == 12 or out.get("idType") == "aadhaar_card":
        out.pop("idNumber", None)
        if digits:
            out["last4"] = digits[-4:]
        elif out.get("last4"):
            pass
        out["idType"] = "aadhaar_card"
    cleaned = {}
    for key, value in out.items():
        if isinstance(value, str):
            text, last4 = strip_aadhaar(value)
            cleaned[key] = text
            if last4 and key != "last4":
                cleaned.setdefault("last4", last4)
        else:
            cleaned[key] = value
    cleaned.pop("idNumber", None) if cleaned.get("idType") == "aadhaar_card" else None
    if cleaned.get("idType") == "aadhaar_card":
        cleaned.pop("idNumber", None)
    return cleaned


async def extract_from_image(image_bytes: bytes, mime: str = "image/jpeg") -> dict[str, Any]:
    del mime
    settings = get_settings()
    if not image_bytes:
        return {
            "categoryGuess": None,
            "fields": {},
            "evidence": "check_original",
            "note": "Empty image",
        }
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(vertexai=True, project=settings.project, location=settings.vertex_location)
        prompt = (
            "Read this identity or lost-item document photo. Return JSON only with keys "
            "categoryGuess (wallet|phone|bag|keys|passport|driving_licence|aadhaar_card|pan_card|"
            "voter_id|other_id|certificate|bank_card|laptop_tablet|jewellery|vehicle_rc|other), "
            "fields: {name, idType, idNumber, last4, dob, authority, address}. "
            "If this is an Aadhaar card, never return the full 12-digit number; return last4 and name only. "
            "This is assistive OCR. A human will check every field."
        )
        response = client.models.generate_content(
            model=settings.model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                prompt,
            ],
        )
        text = getattr(response, "text", None) or ""
        import json

        start = text.find("{")
        end = text.rfind("}")
        data = json.loads(text[start : end + 1]) if start >= 0 and end > start else {}
        fields = reduce_aadhaar_fields(data.get("fields") or {})
        return {
            "categoryGuess": data.get("categoryGuess"),
            "fields": fields,
            "evidence": "check_original",
        }
    except Exception:
        log.info("extract_unavailable reason=no_gemini")
        return {
            "categoryGuess": None,
            "fields": {},
            "evidence": "check_original",
            "note": "Scan assist is unavailable in this local demo. Fill the form yourself and check the original.",
        }


def extract_with_client(fake_json: dict[str, Any]) -> dict[str, Any]:
    """Test helper: run Aadhaar reduction on a fake Gemini payload."""
    fields = reduce_aadhaar_fields(fake_json.get("fields") or {})
    return {
        "categoryGuess": fake_json.get("categoryGuess"),
        "fields": fields,
        "evidence": "check_original",
    }
