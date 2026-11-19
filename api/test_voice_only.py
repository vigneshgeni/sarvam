"""Voice-only server mode (SARVAM_VOICE_ONLY=1) and the daily speak cap. No network calls."""

import io
import wave
from unittest.mock import patch

from fastapi.testclient import TestClient

import main
from main import IP_REQUESTS, app


def _wav() -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(b"\x01\x00" * 240)
    return buf.getvalue()


def test_default_server_is_unchanged():
    IP_REQUESTS.clear()
    client = TestClient(app)
    assert main.VOICE_ONLY is False
    assert main.SPEAK_DAILY_CAP == 0
    # Explain still routes (fails validation without files, but it is not a 404)
    assert client.post("/api/explain").status_code != 404


def test_voice_only_answers_only_health_and_speak(monkeypatch):
    IP_REQUESTS.clear()
    monkeypatch.setattr(main, "VOICE_ONLY", True)
    client = TestClient(app)
    assert client.get("/health").status_code == 200
    for path in ["/api/explain", "/api/translate", "/api/ask", "/api/redact", "/api/extract-text", "/docs", "/openapi.json"]:
        res = client.post(path) if path.startswith("/api/") else client.get(path)
        assert res.status_code == 404, path
    with patch("main.synthesize_speech", return_value=_wav()):
        res = client.post("/api/speak", json={"text": "Hello.", "lang": "ta", "voice": "female", "voice_index": 1})
    assert res.status_code == 200 and res.content[:4] == b"RIFF"


def test_daily_cap_stops_speech_after_the_limit(monkeypatch):
    IP_REQUESTS.clear()
    monkeypatch.setattr(main, "SPEAK_DAILY_CAP", 2)
    monkeypatch.setitem(main._SPEAK_DAY, "day", "")
    monkeypatch.setitem(main._SPEAK_DAY, "count", 0)
    client = TestClient(app)
    with patch("main.synthesize_speech", return_value=_wav()) as synth:
        codes = [client.post("/api/speak", json={"text": "Hi.", "lang": "en", "voice": "male"}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    assert synth.call_count == 2


def test_speak_returns_exact_sentence_timings(monkeypatch):
    """/api/speak sends each sentence's start/end (base64 JSON header) for captions."""
    import base64
    import json

    IP_REQUESTS.clear()
    monkeypatch.setattr(main, "SPEAK_DAILY_CAP", 0)

    def fake_synth(text, lang, voice, rate, client, voice_index, timings_out=None):
        if timings_out is not None:
            timings_out.extend([
                {"text": "நீங்கள் மூன்று மருந்துகள்.", "start": 0.0, "end": 2.1},
                {"text": "Second line.", "start": 2.35, "end": 4.0},
            ])
        return _wav()

    client = TestClient(app)
    with patch("main.synthesize_speech", side_effect=fake_synth):
        res = client.post("/api/speak", json={"text": "a. b.", "lang": "ta", "voice": "female"})
    assert res.status_code == 200
    segs = json.loads(base64.b64decode(res.headers["X-Sarvam-Segments"]).decode("utf-8"))
    assert [s["start"] for s in segs] == [0.0, 2.35]
    assert segs[0]["text"].startswith("நீங்கள்")


def test_sentence_timings_follow_stitch_gaps():
    import tts

    def wav_of(seconds):
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)
            wf.writeframes(b"\x00\x00" * int(24000 * seconds))
        return buf.getvalue()

    segs = tts.sentence_timings([wav_of(1.0), b"", wav_of(2.0)], ["One.", "Skipped.", "Three."], gap_s=0.25)
    assert segs == [
        {"text": "One.", "start": 0.0, "end": 1.0},
        {"text": "Three.", "start": 1.25, "end": 3.25},
    ]
    # Same length as the real stitched audio
    stitched = tts.stitch_wavs([wav_of(1.0), wav_of(2.0)], silence_ms=250, rate=24000)
    assert abs(tts.wav_seconds(stitched) - 3.25) < 0.01
