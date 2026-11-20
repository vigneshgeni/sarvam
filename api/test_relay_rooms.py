"""Pytest suite for /api/relay/* video room endpoints (P2)."""

import importlib
import jwt
import pytest
from fastapi.testclient import TestClient

from main import app
relay_router_mod = importlib.import_module("relay.router")
from relay.rooms import CODE_ALPHABET, RelayRoomStore


class DummyLiveKitService:
    def __init__(self):
        self.created = []
        self.updated = []
        self.deleted = []

    async def ensure_room_metadata(self, room):
        self.created.append(room.code)

    async def update_room_metadata(self, room):
        self.updated.append((room.code, room.allow_guest_camera, room.ended))

    async def delete_room(self, room_name):
        self.deleted.append(room_name)


@pytest.fixture
def relay_client(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "wss://example.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", "APItestkey12345")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "supersecretlivekittestvalue1234567890")

    fake_now = [1_700_000_000.0]
    fresh_store = RelayRoomStore(clock=lambda: fake_now[0])
    dummy_lk = DummyLiveKitService()

    monkeypatch.setattr(relay_router_mod, "store", fresh_store)
    monkeypatch.setattr(relay_router_mod, "lk_service", dummy_lk)

    client = TestClient(app)
    return client, fresh_store, dummy_lk, fake_now


def test_relay_health(relay_client):
    client, _, _, _ = relay_client
    r = client.get("/api/relay/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "livekitConfigured": True}


def test_create_room_code_format_and_host_token_grants(relay_client):
    client, _, dummy_lk, _ = relay_client
    r = client.post(
        "/api/relay/rooms",
        json={"hostName": "Vignesh", "language": "ta"},
        headers={"Origin": "https://sarvam-510715--relay.web.app"},
    )
    assert r.status_code == 200
    data = r.json()
    code = data["code"]
    assert len(code) == 4
    assert all(ch in CODE_ALPHABET for ch in code)
    assert data["joinUrl"] == f"https://sarvam-510715--relay.web.app/r/{code}"
    assert len(data["hostKey"]) >= 32
    assert data["livekitUrl"] == "wss://example.livekit.cloud"
    assert code in dummy_lk.created

    claims = jwt.decode(
        data["token"],
        "supersecretlivekittestvalue1234567890",
        algorithms=["HS256"],
        options={"verify_exp": False},
    )
    video = claims["video"]
    assert video["room"] == f"relay-{code}"
    assert video["roomJoin"] is True
    assert video["canPublish"] is True
    assert video["canSubscribe"] is True
    assert video["canPublishData"] is True
    assert "canPublishSources" not in video or not video["canPublishSources"]


def test_join_guest_grants_and_full_room_limit(relay_client):
    client, _, _, _ = relay_client
    created = client.post("/api/relay/rooms", json={"hostName": "Vignesh", "language": "en"}).json()
    code = created["code"]

    # Up to 3 guests allowed
    for i in range(1, 4):
        res = client.post("/api/relay/join", json={"code": code.lower(), "name": f"Guest {i}", "language": "ta"})
        assert res.status_code == 200
        body = res.json()
        assert body["code"] == code
        assert body["allowGuestCamera"] is False
        claims = jwt.decode(
            body["token"],
            "supersecretlivekittestvalue1234567890",
            algorithms=["HS256"],
            options={"verify_exp": False},
        )
        assert claims["video"]["canPublishSources"] == ["microphone"]
        assert claims["video"]["canPublishData"] is True
        assert claims["video"]["canSubscribe"] is True

    # 4th guest gets 409 full
    full_res = client.post("/api/relay/join", json={"code": code, "name": "Guest 4", "language": "en"})
    assert full_res.status_code == 409
    assert full_res.json()["detail"]["code"] == "full"


def test_join_not_found_expired_and_ended(relay_client):
    client, _, _, fake_now = relay_client

    # Not found
    nf = client.post("/api/relay/join", json={"code": "ZZZZ", "name": "Amma", "language": "ta"})
    assert nf.status_code == 404
    assert nf.json()["detail"]["code"] == "not_found"

    # Expired after 30 minutes of inactivity
    created = client.post("/api/relay/rooms", json={"hostName": "Vignesh", "language": "en"}).json()
    fake_now[0] += 31 * 60
    exp = client.post("/api/relay/join", json={"code": created["code"], "name": "Amma", "language": "ta"})
    assert exp.status_code == 410
    assert exp.json()["detail"]["code"] == "expired"

    # Ended by host
    created2 = client.post("/api/relay/rooms", json={"hostName": "Vignesh", "language": "en"}).json()
    end_res = client.post("/api/relay/end", headers={"X-Host-Key": created2["hostKey"]})
    assert end_res.status_code == 200
    ended_join = client.post("/api/relay/join", json={"code": created2["code"], "name": "Amma", "language": "ta"})
    assert ended_join.status_code == 410
    assert ended_join.json()["detail"]["code"] == "ended"


def test_host_key_required_for_settings_and_end(relay_client):
    client, _, dummy_lk, _ = relay_client
    created = client.post("/api/relay/rooms", json={"hostName": "Vignesh", "language": "en"}).json()

    assert client.post("/api/relay/settings", json={"allowGuestCamera": True}).status_code == 401
    assert client.post(
        "/api/relay/settings",
        json={"allowGuestCamera": True},
        headers={"X-Host-Key": "wrong-key"},
    ).status_code == 403

    ok = client.post(
        "/api/relay/settings",
        json={"allowGuestCamera": True},
        headers={"X-Host-Key": created["hostKey"]},
    )
    assert ok.status_code == 200
    assert ok.json()["allowGuestCamera"] is True

    assert client.post("/api/relay/end").status_code == 401
    assert client.post("/api/relay/end", headers={"X-Host-Key": "wrong-key"}).status_code == 403
    end_ok = client.post("/api/relay/end", headers={"X-Host-Key": created["hostKey"]})
    assert end_ok.status_code == 200
    assert f"relay-{created['code']}" in dummy_lk.deleted


def test_room_creation_rate_limit_30_per_hour(relay_client):
    client, _, _, _ = relay_client
    for _ in range(30):
        res = client.post("/api/relay/rooms", json={"hostName": "Vignesh", "language": "en"})
        assert res.status_code == 200
    blocked = client.post("/api/relay/rooms", json={"hostName": "Vignesh", "language": "en"})
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "rate_limited"
