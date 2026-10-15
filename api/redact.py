"""Find personal details for the share check. The text is not stored or logged."""

import json
import logging

from google.genai import types

from models import RedactModel, RedactSpan
from reader import FALLBACK_MODEL_ID, MODEL_ID, call_gemini_with_retry, get_client

logger = logging.getLogger("sarvam-api")

SPAN_TYPES = frozenset({"person", "phone", "id", "address", "dob", "email"})
REDACT_DEADLINE = 15.0
REDACT_PRIMARY_TIMEOUT = 10.0
REDACT_FALLBACK_TIMEOUT = 5.0

_PROMPT = """Find every personal detail in the text below.
Personal details are a person's name, a phone number, an identity or account number, a home address, a date of birth, or an email address.
Look in every script.
Return JSON {"spans":[{"text":"...","type":"person|phone|id|address|dob|email"}]}.
Copy each span exactly as it appears in the text. Do not translate, shorten, or add characters.
Skip office names, hospitals, courts, banks, and a city or street name that is not part of a home address.
If there is no personal detail, return {"spans":[]}.

Text:
"""


def keep_verbatim_spans(text: str, spans) -> list:
    """Drop any span that is not copied exactly from the text."""
    kept = []
    seen = set()
    source = text if isinstance(text, str) else ""
    for item in spans or []:
        if isinstance(item, RedactSpan):
            piece, kind = item.text, item.type
        elif isinstance(item, dict):
            piece, kind = item.get("text"), item.get("type")
        else:
            continue
        if not isinstance(piece, str) or kind not in SPAN_TYPES:
            continue
        if len(piece.strip()) < 2 or piece not in source:
            continue
        key = (piece, kind)
        if key in seen:
            continue
        seen.add(key)
        kept.append({"text": piece, "type": kind})
    return kept


def redact_personal(text: str, lang: str = "en") -> list:
    """Ask Gemini for spans, then keep only the ones that appear verbatim."""
    prompt = f"{_PROMPT}{text}"
    client = get_client()
    config = types.GenerateContentConfig(
        temperature=0.0,
        response_mime_type="application/json",
        response_schema=RedactModel,
        max_output_tokens=1024,
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )
    response = call_gemini_with_retry(
        client=client,
        model=MODEL_ID,
        contents=[prompt],
        config=config,
        endpoint="redact",
        deadline=REDACT_DEADLINE,
        attempt_timeout_sec=REDACT_PRIMARY_TIMEOUT,
        fallback_timeout_sec=REDACT_FALLBACK_TIMEOUT,
        fallback_model=FALLBACK_MODEL_ID,
        max_retries=1,
        retry_budget=REDACT_DEADLINE,
    )
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, RedactModel):
        raw = list(parsed.spans)
    else:
        data = json.loads(getattr(response, "text", None) or "{}")
        raw = data.get("spans") if isinstance(data, dict) else []
    found = len(raw) if isinstance(raw, list) else 0
    kept = keep_verbatim_spans(text, raw if isinstance(raw, list) else [])
    logger.info("redact counts found=%d kept=%d", found, len(kept))
    return kept
