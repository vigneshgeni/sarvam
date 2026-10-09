from datetime import date, timedelta

from lf.ids import match_key
from lf.matching import decide, match_id, score_pair

PEPPER = "test-pepper-one"
TODAY = date.today()


def lost(**kw):
    base = {
        "id": "L1",
        "type": "lost",
        "status": "open",
        "ownerUid": "u1",
        "category": "wallet",
        "title": "Brown leather wallet",
        "publicDescription": "brown leather wallet with a bus pass",
        "privateDescription": "",
        "city": "chennai",
        "lat": 13.0418,
        "lng": 80.2341,
        "geo7": "tf3x1uc",
        "radiusKm": 5,
        "dateFrom": (TODAY - timedelta(days=3)).isoformat(),
        "dateTo": TODAY.isoformat(),
        "identifiers": [],
        "nameKeys": [],
        "keywords": ["brown", "leather", "wallet", "bus"],
    }
    base.update(kw)
    return base


def found(**kw):
    base = {
        "id": "F1",
        "type": "found",
        "status": "open",
        "ownerUid": "u2",
        "category": "wallet",
        "title": "Brown leather wallet",
        "publicDescription": "brown leather wallet with a bus pass",
        "privateDescription": "",
        "city": "chennai",
        "lat": 13.0418,
        "lng": 80.2341,
        "geo7": "tf3x1uc",
        "foundAt": (TODAY - timedelta(days=1)).isoformat(),
        "identifiers": [],
        "nameKeys": [],
        "keywords": ["brown", "leather", "wallet", "bus"],
    }
    base.update(kw)
    return base


def test_obvious_match():
    r = score_pair(lost(), found())
    assert r["score"] >= 45
    assert any(x["code"] == "SAME_CATEGORY" for x in r["reasons"])


def test_wrong_category():
    other = found(
        category="phone",
        title="black phone",
        publicDescription="black phone cracked",
        keywords=["black", "phone"],
    )
    r = score_pair(lost(), other)
    assert r["parts"]["category"] == 0
    assert decide(lost(), other, 45) is None


def test_too_far():
    r = score_pair(lost(radiusKm=1), found(lat=19.07, lng=72.87, city="mumbai"))
    assert r["parts"]["proximity"] == 0


def test_too_late():
    r = score_pair(
        lost(dateFrom=(TODAY - timedelta(days=120)).isoformat(), dateTo=(TODAY - timedelta(days=100)).isoformat()),
        found(foundAt=TODAY.isoformat()),
    )
    assert r["parts"]["date"] == 0


def test_id_match_strong():
    key = match_key(PEPPER, "passport", "Z1234567")
    ident = [{"idType": "passport", "matchKey": key, "pv": 1}]
    r = score_pair(lost(category="passport", identifiers=ident), found(category="passport", identifiers=ident))
    assert r["strong"] and r["score"] == 100
    assert r["reasons"][0]["code"] == "ID_MATCH"


def test_name_only_below_threshold():
    r = score_pair(
        lost(category="bag", title="bag", publicDescription="item", keywords=[], nameKeys=["aaa"]),
        found(category="keys", title="keys", publicDescription="other", keywords=[], nameKeys=["aaa"]),
    )
    assert r["parts"]["name"] == 4
    assert r["score"] < 45


def test_city_wide():
    r = score_pair(lost(radiusKm=None), found())
    assert r["parts"]["proximity"] == 10


def test_other_category():
    r = score_pair(lost(category="other"), found(category="bag"))
    assert r["parts"]["category"] == 10


def test_colour_and_brand():
    r = score_pair(
        lost(title="black samsung phone", publicDescription="black samsung phone", keywords=["black", "samsung", "phone"]),
        found(
            category="phone",
            title="black samsung",
            publicDescription="black samsung phone cracked",
            keywords=["black", "samsung", "phone"],
        ),
    )
    codes = {x["code"] for x in r["reasons"]}
    assert "COLOUR" in codes and "BRAND" in codes


def test_idempotent_ids():
    assert match_id("L1", "F1") == match_id("L1", "F1")
    a = decide(lost(), found(), 45)
    b = decide(lost(), found(), 45)
    assert a["id"] == b["id"]


def test_threshold():
    weak = found(
        title="item",
        publicDescription="something else",
        keywords=["else"],
        lat=19.0,
        lng=73.0,
        city="mumbai",
        foundAt=(TODAY - timedelta(days=80)).isoformat(),
    )
    assert decide(lost(radiusKm=1, dateFrom=(TODAY - timedelta(days=3)).isoformat()), weak, 45) is None


def test_aadhaar_no_id_match_without_lite():
    r = score_pair(lost(category="aadhaar_card", identifiers=[]), found(category="aadhaar_card", identifiers=[]))
    assert not r["strong"]
