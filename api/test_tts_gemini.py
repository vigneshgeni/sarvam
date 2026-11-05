"""Gemini TTS voice path. A recording fake stands in for Google, so nothing here makes a network call."""

import io
import threading
import wave

import pytest

import tts
from tts import (
    DEFAULT_GEMINI_TTS_MODEL,
    DEFAULT_VOICE_POOLS,
    GEMINI_FEMALE_VOICES,
    GEMINI_MALE_VOICES,
    SPEAK_LANG_CODES,
    choose_voice,
    ensure_wav,
    gemini_tts_model,
    neutralise_markup,
    split_to_byte_limit,
    style_prompt,
    synthesize_speech,
    voice_pool,
)


def _wav(frames: int = 240) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(b"\x01\x00" * frames)
    return buf.getvalue()


class _Audio:
    def __init__(self, content: bytes):
        self.audio_content = content


class Recorder:
    """Records every synthesize_speech request the way the Google client would receive it."""

    def __init__(self, audio: bytes = b""):
        self.audio = audio or _wav()
        self.requests = []
        self._lock = threading.Lock()

    def synthesize_speech(self, input, voice, audio_config):  # noqa: A002 - mirrors the client
        with self._lock:
            self.requests.append((input, voice, audio_config))
        return _Audio(self.audio)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for name in ("GEMINI_TTS_MODEL", "SARVAM_TTS_FEMALE_VOICES", "SARVAM_TTS_MALE_VOICES"):
        monkeypatch.delenv(name, raising=False)


THREE_SENTENCES = "Your policy renews soon. Please pay Rs. 31,200 by 30.11.2026. Keep the receipt."


def test_request_uses_gemini_model_voice_and_style_prompt():
    rec = Recorder()
    synthesize_speech(THREE_SENTENCES, "en", "female", 1.0, rec, voice_index=0)
    assert rec.requests
    for synthesis_input, voice, audio_config in rec.requests:
        assert voice.model_name == DEFAULT_GEMINI_TTS_MODEL
        assert voice.name == "Sulafat"
        assert voice.language_code == "en-IN"
        assert synthesis_input.prompt  # style direction goes in the prompt field
        assert "warm" in synthesis_input.prompt
        assert synthesis_input.prompt not in synthesis_input.text  # never spoken
        assert audio_config.sample_rate_hertz == 24000
    # The Chirp-only knobs are gone
    assert not rec.requests[0][2].speaking_rate
    assert not rec.requests[0][2].effects_profile_id
    assert not rec.requests[0][2].volume_gain_db


def test_no_chirp_voice_name_is_ever_sent():
    rec = Recorder()
    for lang in SPEAK_LANG_CODES:
        for gender in ("female", "male"):
            synthesize_speech("Hello there. Thank you.", lang, gender, 1.0, rec, voice_index=1)
    assert rec.requests
    for _inp, voice, _cfg in rec.requests:
        assert "chirp" not in voice.name.lower()
        assert "-" not in voice.name  # bare Gemini voice names, not "xx-IN-Chirp3-HD-..."
        assert voice.name in GEMINI_FEMALE_VOICES + GEMINI_MALE_VOICES


def test_one_voice_for_every_sentence_of_a_read():
    rec = Recorder()
    synthesize_speech(THREE_SENTENCES, "en", "male", 1.0, rec, voice_index=2)
    names = {voice.name for _i, voice, _c in rec.requests}
    assert names == {DEFAULT_VOICE_POOLS["male"][2]}
    assert len(rec.requests) == 3


def test_same_index_same_voice_different_index_rotates():
    for gender in ("female", "male"):
        pool = DEFAULT_VOICE_POOLS[gender]
        assert 2 <= len(pool) <= 3
        picked = [choose_voice(gender, i) for i in range(len(pool))]
        assert picked == list(pool)
        assert len(set(picked)) == len(pool)
        # Stable for a session (replay / seek reuse the same index)
        assert choose_voice(gender, 5) == choose_voice(gender, 5)
        # Wraps around
        assert choose_voice(gender, len(pool)) == pool[0]


def test_no_index_picks_from_the_pool_and_eventually_varies():
    seen = {choose_voice("female") for _ in range(200)}
    assert seen <= set(DEFAULT_VOICE_POOLS["female"])
    assert len(seen) >= 2


def test_default_pools_use_real_voices_of_the_right_gender():
    assert set(DEFAULT_VOICE_POOLS["female"]) <= set(GEMINI_FEMALE_VOICES)
    assert set(DEFAULT_VOICE_POOLS["male"]) <= set(GEMINI_MALE_VOICES)


def test_unknown_gender_falls_back_to_female_like_before():
    assert choose_voice("other", 0) in DEFAULT_VOICE_POOLS["female"]


def test_voice_pool_env_override_ignores_unknown_and_wrong_gender(monkeypatch):
    monkeypatch.setenv("SARVAM_TTS_FEMALE_VOICES", "kore, LEDA, NotAVoice, Charon")
    assert voice_pool("female") == ("Kore", "Leda")  # Charon is a male voice
    monkeypatch.setenv("SARVAM_TTS_MALE_VOICES", "nonsense")
    assert voice_pool("male") == DEFAULT_VOICE_POOLS["male"]


def test_model_env_override(monkeypatch):
    assert gemini_tts_model() == DEFAULT_GEMINI_TTS_MODEL
    monkeypatch.setenv("GEMINI_TTS_MODEL", "gemini-2.5-flash-tts")
    rec = Recorder()
    synthesize_speech("Hello.", "en", "female", 1.0, rec, voice_index=0)
    assert rec.requests[0][1].model_name == "gemini-2.5-flash-tts"


def test_language_codes():
    rec = Recorder()
    for lang, code in SPEAK_LANG_CODES.items():
        rec.requests.clear()
        synthesize_speech("Hello.", lang, "female", 1.0, rec, voice_index=0)
        assert rec.requests[0][1].language_code == code
    assert SPEAK_LANG_CODES["bn"] == "bn-BD"  # Google lists Bengali only as bn-BD


def test_odia_and_unknown_languages_raise_without_calling_google():
    rec = Recorder()
    for lang in ("or", "or-IN", "xx"):
        with pytest.raises(ValueError):
            synthesize_speech("Hello.", lang, "female", 1.0, rec)
    assert rec.requests == []


def test_auto_language_uses_english():
    rec = Recorder()
    synthesize_speech("Hello.", "auto", "female", 1.0, rec, voice_index=0)
    assert rec.requests[0][1].language_code == "en-IN"


def test_empty_text_returns_no_audio_and_no_call():
    rec = Recorder()
    assert synthesize_speech("   ", "en", "female", 1.0, rec) == b""
    assert rec.requests == []


def test_square_brackets_in_a_document_cannot_become_style_tags():
    rec = Recorder()
    synthesize_speech("Ref [whispering] 12 applies. [sigh] Thanks.", "en", "female", 1.0, rec, voice_index=0)
    spoken = " ".join(inp.text for inp, _v, _c in rec.requests)
    assert "[" not in spoken and "]" not in spoken
    assert "whispering" in spoken  # the words still read, they just are not tags
    assert neutralise_markup("plain text") == "plain text"


def test_style_prompt_is_language_aware_and_within_limits():
    for lang in SPEAK_LANG_CODES:
        prompt = style_prompt(lang)
        assert len(prompt.encode("utf-8")) < 1000
    assert "Tamil" in style_prompt("ta")
    assert "Hindi" in style_prompt("hi")
    assert "slower" in style_prompt("en", 0.8)
    assert "faster" in style_prompt("en", 1.3)
    assert "unhurried" in style_prompt("en", 1.0)


def test_long_indic_sentence_is_split_under_the_byte_limit():
    # Tamil uses 3 bytes per character. One 1,200-character sentence is about 3,600 bytes.
    sentence = ("இது ஒரு நீண்ட வாக்கியம் " * 60).strip()
    assert len(sentence.encode("utf-8")) > 3000
    parts = split_to_byte_limit(sentence)
    assert len(parts) >= 2
    assert all(len(p.encode("utf-8")) <= 3000 for p in parts)
    assert " ".join(parts).split() == sentence.split()  # nothing lost, cut at spaces

    rec = Recorder()
    synthesize_speech(sentence, "ta", "female", 1.0, rec, voice_index=0)
    assert len(rec.requests) == len(parts)
    for inp, _v, _c in rec.requests:
        assert len(inp.text.encode("utf-8")) <= 3000
        assert len(inp.text.encode("utf-8")) + len(inp.prompt.encode("utf-8")) < 8000


def test_split_to_byte_limit_handles_text_without_spaces():
    blob = "a" * 7000
    parts = split_to_byte_limit(blob, 3000)
    assert [len(p) for p in parts] == [3000, 3000, 1000]


def test_bare_pcm_gets_a_wav_header():
    pcm = b"\x01\x00" * 100
    wrapped = ensure_wav(pcm)
    assert wrapped[:4] == b"RIFF"
    with wave.open(io.BytesIO(wrapped), "rb") as wf:
        assert wf.getframerate() == 24000 and wf.getnchannels() == 1 and wf.getsampwidth() == 2
    assert ensure_wav(_wav())[:4] == b"RIFF"


def test_empty_audio_from_google_is_an_error_not_silent_success():
    class Empty:
        def synthesize_speech(self, **_kw):
            return _Audio(b"")

    with pytest.raises(RuntimeError):
        synthesize_speech("Hello there.", "en", "female", 1.0, Empty(), voice_index=0)


def test_failure_is_raised_not_swallowed_and_no_second_engine_is_tried():
    calls = []

    class Boom:
        def synthesize_speech(self, **kw):
            calls.append(kw["voice"].name)
            raise PermissionError("403 aiplatform.endpoints.predict denied")

    with pytest.raises(PermissionError):
        synthesize_speech("Hello there.", "en", "female", 1.0, Boom(), voice_index=0)
    assert calls == ["Sulafat"]  # one attempt, one voice, no fallback


def test_stitched_output_is_one_valid_wav():
    rec = Recorder(_wav(2400))
    out = synthesize_speech(THREE_SENTENCES, "en", "female", 1.0, rec, voice_index=1)
    with wave.open(io.BytesIO(out), "rb") as wf:
        assert wf.getframerate() == 24000
        assert wf.getnframes() > 3 * 2400  # three segments plus the silence between them


def test_log_line_names_model_and_voice_but_not_the_document(caplog):
    import logging

    rec = Recorder()
    with caplog.at_level(logging.INFO, logger="sarvam-api"):
        synthesize_speech("Pay Rs. 31,200 to City Clinic.", "en", "female", 1.0, rec, voice_index=0)
    assert "tts_synth ok" in caplog.text
    assert "Sulafat" in caplog.text and DEFAULT_GEMINI_TTS_MODEL in caplog.text
    assert "31,200" not in caplog.text and "City Clinic" not in caplog.text


def test_source_has_no_chirp_voice_names_left():
    import inspect

    assert "Chirp3" not in inspect.getsource(tts)


def test_speak_endpoint_passes_voice_index_and_old_clients_still_work():
    from unittest.mock import patch

    from fastapi.testclient import TestClient

    from main import IP_REQUESTS, app

    IP_REQUESTS.clear()
    client = TestClient(app)
    with patch("main.synthesize_speech", return_value=_wav()) as mock_synth:
        new = client.post(
            "/api/speak",
            json={"text": "Hello.", "lang": "en", "voice": "male", "rate": 1.0, "voice_index": 2},
        )
        old = client.post("/api/speak", json={"text": "Hello.", "lang": "en", "voice": "female"})
    assert new.status_code == 200 and old.status_code == 200
    assert new.content[:4] == b"RIFF"
    first, second = mock_synth.call_args_list
    assert first.args[2] == "male" and first.args[-1] == 2
    assert second.args[2] == "female" and second.args[-1] is None


def test_speak_endpoint_rejects_a_bad_voice_index_and_odia_still_has_no_audio():
    from unittest.mock import patch

    from fastapi.testclient import TestClient

    from main import IP_REQUESTS, app

    IP_REQUESTS.clear()
    client = TestClient(app)
    with patch("main.synthesize_speech") as mock_synth:
        bad = client.post(
            "/api/speak", json={"text": "Hi.", "lang": "en", "voice": "female", "voice_index": -1}
        )
        odia = client.post("/api/speak", json={"text": "Hi.", "lang": "or", "voice": "female"})
    assert bad.status_code == 422
    assert odia.status_code == 400
    assert mock_synth.called is False
