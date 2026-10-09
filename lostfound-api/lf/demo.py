"""Seeded fictional posts and a labelled Demo finder who answers claims."""

from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from typing import Any

from lf.config import get_settings
from lf.dicts import tokens_from
from lf.geo import city_centre, geohash_encode
from lf.ids import last4_masked, match_key, name_keys, normalize_id, validate_id
from lf.store import get_store, iso, utcnow

log = logging.getLogger("lf.demo")

DEMO_FINDER_UID = "demo-finder"
DEMO_OWNER_UID = "demo-owner"

# TEST passport used in the 2-minute judge path. Never a real document.
DEMO_PASSPORT_FOUND = "Z1234567"
DEMO_PASSPORT_LOST = "Z7654321"

EXPECTED_KEYWORDS = {
    "seed-found-passport": (["maroon", "plastic", "cover", "clear"], ["chennai", "adyar", "singapore", "stamp"]),
    "seed-found-wallet": (["hdfc", "sbi", "front", "bus"], ["ticket", "note", "receipt", "photo"]),
    "seed-found-phone": (["wallpaper", "photo", "family", "dog"], ["blue", "case"]),
}


def _days_ago(n: int) -> str:
    return (date.today() - timedelta(days=n)).isoformat()


def _geo(city_key: str, lat: float | None = None, lng: float | None = None) -> dict[str, Any]:
    centre = city_centre(city_key)
    la = lat if lat is not None else (centre[0] if centre else None)
    ln = lng if lng is not None else (centre[1] if centre else None)
    geo7 = geohash_encode(la, ln) if la is not None and ln is not None else None
    return {"city": city_key, "lat": la, "lng": ln, "geo7": geo7}


def _ident(id_type: str, raw: str) -> dict[str, Any]:
    settings = get_settings()
    normalised = validate_id(id_type, raw)
    return {
        "idType": id_type,
        "matchKey": match_key(settings.id_pepper, id_type, normalised),
        "pv": settings.pepper_version,
        "last4Masked": last4_masked(id_type, normalised),
    }


def _post(base: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    now = utcnow()
    ttl = 90
    guest = False
    if base.get("guest"):
        ttl = 1
        guest = True
    keywords = sorted(
        tokens_from(base.get("title") or "", base.get("publicDescription") or "", base.get("privateDescription") or "")
    )
    rec = {
        "status": "open",
        "photoCount": 0,
        "publicPhoto": base.get("category")
        not in {
            "passport",
            "driving_licence",
            "aadhaar_card",
            "pan_card",
            "voter_id",
            "other_id",
            "certificate",
            "bank_card",
            "vehicle_rc",
        },
        "identifiers": base.pop("identifiers", []),
        "nameKeys": base.pop("nameKeys", []),
        "keywords": keywords,
        "demo": True,
        "guest": guest,
        "reportCount": 0,
        "createdAt": iso(now),
        "expiresAt": iso(now.replace(microsecond=0) + timedelta(days=ttl)),
        "lang": "en",
        "policeReport": None,
        **base,
    }
    rec.setdefault("radiusKm", None)
    rec.setdefault("ownerUid", DEMO_FINDER_UID)
    del settings
    return rec


def seed_demo() -> None:
    store = get_store()
    if store.get_post("seed-found-passport"):
        return
    settings = get_settings()
    store.upsert_user(
        DEMO_FINDER_UID,
        {
            "guest": False,
            "demo": True,
            "displayName": "Demo",
            "ageConfirmed": True,
            "consentAt": iso(),
            "upiVpa": "demo.finder@upi",
            "contactEnc": {},
            "createdAt": iso(),
        },
    )
    store.upsert_user(
        DEMO_OWNER_UID,
        {
            "guest": False,
            "demo": True,
            "displayName": "Asha",
            "ageConfirmed": True,
            "consentAt": iso(),
            "createdAt": iso(),
        },
    )

    chennai = _geo("chennai")
    bengaluru = _geo("bengaluru")
    hyderabad = _geo("hyderabad")
    delhi = _geo("delhi")
    mumbai = _geo("mumbai")

    found_posts = [
        _post(
            {
                "id": "seed-found-passport",
                "type": "found",
                "category": "passport",
                "title": "Maroon passport booklet",
                "publicDescription": "Passport in a clear plastic cover",
                "privateDescription": "Maroon booklet, recent stamp looks like Chennai airport",
                "area": "Adyar",
                **chennai,
                "lat": 13.0067,
                "lng": 80.2573,
                "geo7": None,
                "foundAt": _days_ago(1),
                "heldAt": "with_me",
                "identifiers": [_ident("passport", DEMO_PASSPORT_FOUND)],
                "nameKeys": name_keys(settings.id_pepper, "Arjun K"),
                "verification": {
                    "questions": [
                        "What colour is the cover and is it in any case?",
                        "Which city is on the most recent stamp inside?",
                    ]
                },
            }
        ),
        _post(
            {
                "id": "seed-found-wallet",
                "type": "found",
                "category": "wallet",
                "title": "Brown leather wallet",
                "publicDescription": "Brown leather wallet with a few cards and a bus pass",
                "privateDescription": "HDFC debit in the front pocket, a folded bus ticket inside",
                "area": "T. Nagar",
                **chennai,
                "lat": 13.0418,
                "lng": 80.2341,
                "foundAt": _days_ago(2),
                "heldAt": "shop_or_office",
                "verification": {
                    "questions": [
                        "Which card is in the front pocket?",
                        "What note or paper is folded inside?",
                    ]
                },
            }
        ),
        _post(
            {
                "id": "seed-found-phone",
                "type": "found",
                "category": "phone",
                "title": "Black phone, cracked screen",
                "publicDescription": "Black phone with a cracked screen and a blue case",
                "privateDescription": "Lock screen is a family photo; blue silicone case",
                "area": "Chennai Central",
                **chennai,
                "foundAt": _days_ago(0),
                "heldAt": "with_me",
                "identifiers": [_ident("imei", "490154203237518")],
                "verification": {
                    "questions": [
                        "What is the lock-screen wallpaper?",
                        "What colour is the case?",
                    ]
                },
            }
        ),
        _post(
            {
                "id": "seed-found-licence",
                "type": "found",
                "category": "driving_licence",
                "title": "Driving licence card",
                "publicDescription": "Driving licence card",
                "privateDescription": "Issued by TN-01 RTO",
                "area": "Guindy",
                **chennai,
                "foundAt": _days_ago(3),
                "heldAt": "police_station",
                "identifiers": [_ident("driving_licence", "TN0120230012345")],
                "nameKeys": name_keys(settings.id_pepper, "Divya R"),
                "verification": {
                    "questions": ["What is the date of birth on it?", "Which RTO issued it?"]
                },
            }
        ),
        _post(
            {
                "id": "seed-found-bag",
                "type": "found",
                "category": "bag",
                "title": "Blue backpack",
                "publicDescription": "Blue backpack with a laptop sleeve and a water bottle",
                "privateDescription": "Wildcraft tag, sticker of a cat on the bottle",
                "area": "Koyambedu",
                **chennai,
                "foundAt": _days_ago(1),
                "heldAt": "with_me",
                "verification": {
                    "questions": [
                        "What is inside the front zip pocket?",
                        "What sticker is on the bottle?",
                    ]
                },
            }
        ),
        _post(
            {
                "id": "seed-found-keys-blr",
                "type": "found",
                "category": "keys",
                "title": "Keys with a blue tag",
                "publicDescription": "Bunch of keys with a blue tag and a small bell",
                "privateDescription": "Three keys plus a cycle lock key",
                "area": "Indiranagar",
                **bengaluru,
                "foundAt": _days_ago(1),
                "heldAt": "with_me",
                "verification": {"questions": ["How many keys are on the ring?", "What is on the tag?"]},
            }
        ),
        _post(
            {
                "id": "seed-found-bag-hyd",
                "type": "found",
                "category": "bag",
                "title": "Black laptop bag",
                "publicDescription": "Black laptop bag found near a metro gate",
                "privateDescription": "Dell charger inside",
                "area": "Banjara Hills",
                **hyderabad,
                "foundAt": _days_ago(2),
                "heldAt": "shop_or_office",
                "verification": {"questions": ["What brand is the charger?", "Is there a name tag?"]},
            }
        ),
        _post(
            {
                "id": "seed-found-wallet-del",
                "type": "found",
                "category": "wallet",
                "title": "Black fabric wallet",
                "publicDescription": "Black fabric wallet, no cards showing",
                "privateDescription": "A metro card and a handwritten note",
                "area": "Connaught Place",
                **delhi,
                "foundAt": _days_ago(1),
                "heldAt": "with_me",
                "verification": {"questions": ["What card is inside?", "What does the note say?"]},
            }
        ),
        _post(
            {
                "id": "seed-found-phone-mum",
                "type": "found",
                "category": "phone",
                "title": "White phone in a clear case",
                "publicDescription": "White phone with a clear case, small crack on the corner",
                "privateDescription": "Wallpaper is a cricket stadium",
                "area": "Bandra",
                **mumbai,
                "foundAt": _days_ago(0),
                "heldAt": "with_me",
                "verification": {"questions": ["What is on the lock screen?", "Any stickers on the case?"]},
            }
        ),
        _post(
            {
                "id": "seed-found-passport-blr",
                "type": "found",
                "category": "passport",
                "title": "Passport in a green cover",
                "publicDescription": "Passport booklet in a green fabric cover",
                "privateDescription": "TEST number only",
                "area": "Koramangala",
                **bengaluru,
                "foundAt": _days_ago(2),
                "heldAt": "police_station",
                "identifiers": [_ident("passport", "A7654321")],
                "verification": {"questions": ["What colour is the extra cover?", "Any stamps visible?"]},
            }
        ),
        _post(
            {
                "id": "seed-found-cert-hyd",
                "type": "found",
                "category": "certificate",
                "title": "Blue certificate folder",
                "publicDescription": "Blue folder with marksheets",
                "privateDescription": "Anna University degree, 2019",
                "area": "Hitech City",
                **hyderabad,
                "foundAt": _days_ago(4),
                "heldAt": "with_me",
                "nameKeys": name_keys(settings.id_pepper, "Karthik R"),
                "verification": {"questions": ["Which university?", "What year is printed?"]},
            }
        ),
        _post(
            {
                "id": "seed-found-rc-del",
                "type": "found",
                "category": "vehicle_rc",
                "title": "Vehicle RC booklet",
                "publicDescription": "Vehicle registration booklet",
                "privateDescription": "TEST plate DL1CAF1234",
                "area": "Karol Bagh",
                **delhi,
                "foundAt": _days_ago(5),
                "heldAt": "handed_to_authority",
                "identifiers": [_ident("vehicle_rc", "DL1CAF1234")],
                "verification": {"questions": ["What colour is the vehicle listed?", "Which RTO?"]},
            }
        ),
    ]
    for post in found_posts:
        if post.get("lat") and post.get("lng") and not post.get("geo7"):
            from lf.geo import geohash_encode as enc

            post["geo7"] = enc(post["lat"], post["lng"])
        store.put_post(post)

    lost_posts = [
        _post(
            {
                "id": "seed-lost-cert",
                "type": "lost",
                "ownerUid": DEMO_OWNER_UID,
                "category": "certificate",
                "title": "Blue folder of certificates",
                "publicDescription": "Blue folder with mark sheets and a degree certificate",
                "privateDescription": "Anna University",
                "area": "Guindy",
                **chennai,
                "dateFrom": _days_ago(4),
                "dateTo": _days_ago(2),
                "nameKeys": name_keys(settings.id_pepper, "Karthik R"),
            }
        ),
        _post(
            {
                "id": "seed-lost-keys",
                "type": "lost",
                "ownerUid": DEMO_OWNER_UID,
                "category": "keys",
                "title": "Keys with a blue tag",
                "publicDescription": "Bunch of keys with a blue tag and a small bell",
                "privateDescription": "House and bike keys",
                "area": "Adyar",
                **chennai,
                "lat": 13.0067,
                "lng": 80.2573,
                "dateFrom": _days_ago(2),
                "dateTo": _days_ago(1),
                "radiusKm": 5,
            }
        ),
        _post(
            {
                "id": "seed-lost-passport",
                "type": "lost",
                "ownerUid": DEMO_OWNER_UID,
                "category": "passport",
                "title": "Passport in a green cover",
                "publicDescription": "Passport in a green cover",
                "privateDescription": "TEST",
                "area": "Koyambedu",
                **chennai,
                "dateFrom": _days_ago(2),
                "dateTo": _days_ago(1),
                "identifiers": [_ident("passport", DEMO_PASSPORT_LOST)],
                "nameKeys": name_keys(settings.id_pepper, "Meera S"),
            }
        ),
    ]
    for post in lost_posts:
        if post.get("lat") and post.get("lng") and not post.get("geo7"):
            from lf.geo import geohash_encode as enc

            post["geo7"] = enc(post["lat"], post["lng"])
        store.put_post(post)

    log.info("demo_seeded found=%s lost=%s", len(found_posts), len(lost_posts))


def answers_match_expected(post_id: str, answers: list[str]) -> bool:
    expected = EXPECTED_KEYWORDS.get(post_id)
    if not expected:
        joined = " ".join(answers).lower()
        return len(joined) >= 8
    for i, words in enumerate(expected):
        text = (answers[i] if i < len(answers) else "").lower()
        if not any(w in text for w in words):
            return False
    return True


async def demo_finder_respond(claim_id: str, found_post_id: str) -> None:
    await asyncio.sleep(8)
    from lf.notify import notify

    store = get_store()
    claim = store.get_claim(claim_id)
    post = store.get_post(found_post_id)
    if not claim or not post or post.get("ownerUid") != DEMO_FINDER_UID:
        return
    if claim.get("state") != "pending":
        return
    approve = answers_match_expected(found_post_id, claim.get("answers") or [])
    claim["state"] = "approved" if approve else "declined"
    claim["decidedAt"] = iso()
    claim["decisionReason"] = None if approve else "answers_did_not_match"
    if approve:
        shared = claim.setdefault("shared", {"lostOwner": [], "finder": []})
        shared["finder"] = ["phone"]
        user = store.get_user(DEMO_FINDER_UID) or {}
        from lf.crypto import encrypt_field

        contact = user.get("contactEnc") or {}
        contact["phone"] = encrypt_field("+91 00000 00000")
        store.upsert_user(DEMO_FINDER_UID, {"contactEnc": contact, "displayName": "Demo"})
        match = store.get_match(claim["matchId"])
        if match:
            match["state"] = "approved"
            store.put_match(match)
        notify(claim["claimerUid"], "claim_approved", claim["id"])
        notify(claim["claimerUid"], "contact_shared", claim["id"])
    else:
        notify(claim["claimerUid"], "claim_declined", claim["id"])
    store.put_claim(claim)
    log.info("demo_finder_decision claim=%s approved=%s", claim_id, approve)
