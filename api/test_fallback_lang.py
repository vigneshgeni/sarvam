"""The backup model answers in the selected language, on its own clock."""
import json
from unittest.mock import MagicMock, patch

import pytest

from reader import (
    FALLBACK_MODEL_ID,
    FALLBACK_TIMEOUT,
    MODEL_ID,
    READER_PROMPT_TEMPLATE,
    backup_language_prompt,
    call_gemini_with_retry,
    read_document_single_attempt,
)


def _response(title: str, summary: str, language: str):
    resp = MagicMock()
    resp.parsed = None
    resp.usage_metadata = None
    resp.text = json.dumps({
        "title": title,
        "summary": [summary],
        "language": language,
        "document_type": "government_notice",
        "document_language": "ta",
    })
    return resp


def _prompt_text(contents):
    return contents[-1] if contents else ""


def test_backup_prompt_names_the_target_language():
    base = "Read this notice."
    hindi = backup_language_prompt(base, "Hindi")
    assert "Hindi" in hindi
    assert "Do not answer in English." in hindi
    assert backup_language_prompt(base, "English") is None
    assert backup_language_prompt(base, "auto") is None


def test_reader_prompt_is_back_near_its_old_length():
    # The kind rules had grown the prompt by about a thousand tokens.
    assert len(READER_PROMPT_TEMPLATE) < 9000


def test_a_slow_primary_still_asks_the_backup(monkeypatch):
    clock = {"t": 0.0}

    def fake_time():
        return clock["t"]

    models = []

    def generate(*_args, **kwargs):
        models.append(kwargs["model"])
        if kwargs["model"] == MODEL_ID:
            clock["t"] = 38.0
            raise TimeoutError("primary timed out")
        return MagicMock()

    client = MagicMock()
    client.models.generate_content.side_effect = generate
    monkeypatch.setattr("reader.time.time", fake_time)

    call_gemini_with_retry(
        client=client,
        model=MODEL_ID,
        contents=["Read this in Hindi."],
        config=MagicMock(),
        endpoint="explain",
        deadline=40,
        fallback_contents=["Write every user-facing sentence in Hindi. Do not answer in English."],
    )

    assert models == [MODEL_ID, FALLBACK_MODEL_ID]
    sent = client.models.generate_content.call_args_list[1].kwargs["contents"][0]
    assert "Do not answer in English." in sent
    timeout_ms = client.models.generate_content.call_args_list[1].kwargs["config"].http_options.timeout
    assert timeout_ms >= int(FALLBACK_TIMEOUT * 1000) - 1000


def test_language_check_retries_on_the_backup_not_the_primary():
    client = MagicMock()
    client.models.generate_content.side_effect = [
        _response("Pension notice", "Your pension continues.", "en"),
        _response("पेंशन सूचना", "आपकी पेंशन जारी है और कुछ करना है।", "hi"),
    ]
    with patch("reader.get_client", return_value=client):
        result = read_document_single_attempt([(b"%PDF-1.4", "application/pdf")], "hi", deadline=10**12)

    models = [call.kwargs["model"] for call in client.models.generate_content.call_args_list]
    assert models == [MODEL_ID, FALLBACK_MODEL_ID]
    first = _prompt_text(client.models.generate_content.call_args_list[0].kwargs["contents"])
    second = _prompt_text(client.models.generate_content.call_args_list[1].kwargs["contents"])
    assert "Do not answer in English." not in first
    assert "Hindi" in second
    assert "Do not answer in English." in second
    assert result.language == "hi"


def test_backup_timeout_uses_the_language_prompt_on_the_first_try():
    client = MagicMock()
    client.models.generate_content.side_effect = [
        TimeoutError("primary timed out"),
        _response("படிவம்", "இந்த அறிவிப்பை தமிழில் படிக்கவும்.", "ta"),
    ]
    with patch("reader.get_client", return_value=client):
        read_document_single_attempt([(b"%PDF-1.4", "application/pdf")], "ta")

    models = [call.kwargs["model"] for call in client.models.generate_content.call_args_list]
    assert models[0] == MODEL_ID
    assert FALLBACK_MODEL_ID in models
    assert models.count(MODEL_ID) == 1
    backup = next(
        call.kwargs for call in client.models.generate_content.call_args_list
        if call.kwargs["model"] == FALLBACK_MODEL_ID
    )
    assert "Tamil" in _prompt_text(backup["contents"])
    assert "Do not answer in English." in _prompt_text(backup["contents"])
