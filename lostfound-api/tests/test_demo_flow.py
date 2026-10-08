"""Scripted end-to-end against the in-memory store. No network."""

from __future__ import annotations

import io
import logging

from fastapi.testclient import TestClient
from PIL import Image

from lf.store import reset_store_for_tests


def _client():
    reset_store_for_tests()
    import main as mainmod

    mainmod.settings = mainmod.get_settings()
    from lf.demo import seed_demo

    seed_demo()
    return TestClient(mainmod.app)


def _guest(client: TestClient) -> str:
    res = client.post("/lf/demo/guest")
    assert res.status_code == 200
    return res.json()["token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _post_payload(**kw):
    import json

    body = {
        "type": "lost",
        "category": "passport",
        "title": "Lost maroon passport",
        "publicDescription": "Maroon passport booklet in a plastic cover",
        "privateDescription": "TEST",
        "city": "Chennai",
        "area": "Adyar",
        "radiusKm": 5,
        "dateFrom": "2026-10-06",
        "dateTo": "2026-10-08",
        "identifiers": [{"idType": "passport", "idNumber": "Z1234567"}],
        "questions": [],
        "consent": True,
        "ageConfirmed": True,
        "autoMatchIds": True,
        "lang": "en",
        **kw,
    }
    return json.dumps(body)


def test_health():
    client = _client()
    res = client.get("/lf/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["demoMode"] is True
    assert body["aadhaarLite"] is False


def test_feed_public():
    client = _client()
    res = client.get("/lf/feed", params={"city": "chennai"})
    assert res.status_code == 200
    posts = res.json()["posts"]
    assert len(posts) >= 1
    blob = str(posts)
    assert "Z1234567" not in blob
    assert "matchKey" not in blob
    assert "privateDescription" not in blob


def test_strong_match_claim_approve_share_return_delete():
    client = _client()
    token = _guest(client)
    headers = _auth(token)
    client.put(
        "/lf/me",
        headers=headers,
        json={"phone": "+91 00000 11111", "displayName": "Asha", "consent": True, "ageConfirmed": True},
    )
    created = client.post("/lf/posts", headers=headers, data={"data": _post_payload()})
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["matches"], body
    strong = [m for m in body["matches"] if m["kind"] == "strong"]
    assert strong, body["matches"]
    match_id = strong[0]["matchId"]
    qs = client.get("/lf/found/seed-found-passport/questions", headers=headers)
    assert qs.status_code == 200
    claim = client.post(
        "/lf/claims",
        headers=headers,
        json={
            "matchId": match_id,
            "answers": ["Maroon plastic cover", "Chennai stamp"],
        },
    )
    assert claim.status_code == 200, claim.text
    claim_id = claim.json()["id"]

    # Finder (demo) decides immediately in this test (skip the 8s bot).
    finder = _auth("demo-finder")
    decided = client.post(
        f"/lf/claims/{claim_id}/decision",
        headers=finder,
        json={"decision": "approve"},
    )
    assert decided.status_code == 200, decided.text
    shared = client.post(
        f"/lf/claims/{claim_id}/share",
        headers=headers,
        json={"channels": ["phone"]},
    )
    assert shared.status_code == 200, shared.text
    contact = client.get(f"/lf/claims/{claim_id}/contact", headers=headers)
    assert contact.status_code == 200
    ret = client.post(f"/lf/matches/{match_id}/returned", headers=headers)
    assert ret.status_code == 200
    conf = client.post(f"/lf/matches/{match_id}/returned/confirm", headers=finder)
    assert conf.status_code == 200
    thanks = client.get(f"/lf/thanks/{match_id}", headers=headers)
    assert thanks.status_code == 200
    assert thanks.json()["upiVpa"] == "demo.finder@upi"
    deleted = client.delete("/lf/me", headers=headers)
    assert deleted.status_code == 200
    mine = client.get("/lf/posts/mine", headers=headers)
    # user is gone; a later get_me recreates empty profile, posts should be empty
    assert mine.status_code == 200
    assert mine.json()["posts"] == []


def test_possible_match_wallet():
    client = _client()
    token = _guest(client)
    payload = _post_payload(
        type="lost",
        category="wallet",
        title="Brown leather wallet",
        publicDescription="brown leather wallet with a bus pass",
        identifiers=[],
        area="T. Nagar",
        radiusKm=5,
    )
    created = client.post("/lf/posts", headers=_auth(token), data={"data": payload})
    assert created.status_code == 200, created.text
    matches = created.json()["matches"]
    assert matches
    assert matches[0]["kind"] in {"possible", "strong"}
    assert matches[0]["reasons"]


def test_cannot_read_others_owner_view():
    client = _client()
    token = _guest(client)
    res = client.get("/lf/posts/seed-found-passport", headers=_auth(token))
    assert res.status_code in {403, 404}


def test_no_logging_of_id_or_phone(caplog):
    client = _client()
    token = _guest(client)
    with caplog.at_level(logging.INFO):
        client.post(
            "/lf/posts",
            headers=_auth(token),
            data={"data": _post_payload(publicDescription="call 9876543210 about Z1234567")},
        )
    joined = " ".join(r.getMessage() for r in caplog.records)
    assert "9876543210" not in joined
    assert "Z1234567" not in joined


def test_card_number_rejected():
    client = _client()
    token = _guest(client)
    payload = _post_payload(publicDescription="my visa 4111111111111111", identifiers=[])
    res = client.post("/lf/posts", headers=_auth(token), data={"data": payload})
    assert res.status_code == 400
    assert res.json()["error"] == "card_number_forbidden"


def test_photo_roundtrip_non_id():
    client = _client()
    token = _guest(client)
    img = Image.new("RGB", (1200, 800), color=(20, 80, 40))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    payload = _post_payload(
        type="found",
        category="wallet",
        title="Brown leather wallet",
        publicDescription="brown leather wallet",
        identifiers=[],
        questions=["What is in the front pocket?", "What paper is folded inside?"],
        foundAt="2026-10-07",
        heldAt="with_me",
    )
    res = client.post(
        "/lf/posts",
        headers=_auth(token),
        data={"data": payload},
        files={"photos": ("w.jpg", buf, "image/jpeg")},
    )
    assert res.status_code == 200, res.text
    post = res.json()["post"]
    assert post["photoCount"] == 1
    assert post["publicPhoto"] is True
