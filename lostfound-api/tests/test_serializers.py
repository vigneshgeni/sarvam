from lf.serializers import FORBIDDEN_ANYWHERE_PUBLIC, assert_no_leak, match_view, public_card


def messy_post():
    return {
        "id": "p1",
        "type": "found",
        "category": "passport",
        "title": "Maroon passport",
        "publicDescription": "passport booklet",
        "privateDescription": "TEST Z1234567 inside",
        "city": "chennai",
        "area": "Adyar",
        "lat": 13.0,
        "lng": 80.2,
        "geo7": "tf3x1uc",
        "foundAt": "2026-10-07",
        "heldAt": "with_me",
        "status": "open",
        "createdAt": "2026-10-07T00:00:00+00:00",
        "policeReport": None,
        "demo": True,
        "guest": False,
        "ownerUid": "secret-uid-other",
        "matchKey": "should-not-leak",
        "nameKeys": ["abc"],
        "identifiers": [{"idType": "passport", "matchKey": "deadbeef", "pv": 1}],
        "verification": {"questions": ["secret question"]},
        "contactEnc": {"phone": "enc"},
        "upiVpa": "hide@upi",
        "photoCount": 0,
        "publicPhoto": False,
        "lang": "en",
    }


def test_public_card_allowlist_and_id_hidden():
    card = public_card(messy_post())
    assert_no_leak(card)
    assert "privateDescription" not in card
    assert "matchKey" not in card
    assert card["publicDescription"] in {"", None}
    assert card["publicPhotoUrl"] is None
    for key in card:
        assert key not in FORBIDDEN_ANYWHERE_PUBLIC


def test_match_view_no_questions():
    match = {
        "id": "L_F",
        "kind": "possible",
        "score": 62,
        "reasons": [{"code": "SAME_CATEGORY", "text": "Same type of item"}],
        "state": "suggested",
        "createdAt": "x",
        "lostOwnerUid": "u1",
        "foundOwnerUid": "u2",
    }
    view = match_view(match, messy_post(), "u1")
    assert_no_leak(view)
    blob = str(view)
    assert "secret question" not in blob
    assert "deadbeef" not in blob
    assert "secret-uid-other" not in blob


def test_fuzz_extra_fields():
    post = messy_post()
    post["idNumber"] = "Z1234567"
    post["phone"] = "9876543210"
    card = public_card(post)
    assert_no_leak(card)
    assert "Z1234567" not in str(card)
    assert "9876543210" not in str(card)
