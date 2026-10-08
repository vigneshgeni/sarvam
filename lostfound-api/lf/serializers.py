"""The only exit door: allowlisted views. Extra fields never leak."""

from __future__ import annotations

from typing import Any, Iterable

from lf.config import ID_CATEGORIES
from lf.geo import distance_label, haversine_km

PUBLIC_CARD_ALLOWLIST = frozenset(
    {
        "id",
        "type",
        "category",
        "title",
        "publicDescription",
        "city",
        "area",
        "distanceLabel",
        "foundAt",
        "heldAt",
        "status",
        "createdAt",
        "hasPoliceReport",
        "demo",
        "publicPhotoUrl",
        "lang",
        "guest",
    }
)

MATCH_VIEW_ALLOWLIST = PUBLIC_CARD_ALLOWLIST | frozenset(
    {"reasons", "scoreBand", "kind", "matchId", "otherPost"}
)

FORBIDDEN_ANYWHERE_PUBLIC = frozenset(
    {
        "matchKey",
        "nameKeys",
        "nameKey",
        "identifiers",
        "privateDescription",
        "verification",
        "questions",
        "answers",
        "contactEnc",
        "ownerUid",
        "lostOwnerUid",
        "foundOwnerUid",
        "idNumber",
        "idNum",
        "upiVpa",
        "phone",
        "whatsapp",
        "email",
        "lat",
        "lng",
        "geo7",
        "dataB64",
        "pepper",
        "fieldKey",
    }
)

SCORE_BANDS = ((80, "high"), (55, "medium"), (0, "low"))


def score_band(score: int, strong: bool) -> str:
    if strong:
        return "high"
    for cutoff, label in SCORE_BANDS:
        if score >= cutoff:
            return label
    return "low"


def _photo_url(post: dict[str, Any], n: int = 0) -> str | None:
    if not post.get("publicPhoto"):
        return None
    if int(post.get("photoCount") or 0) <= 0:
        return None
    return f"/lf/photos/{post['id']}/{n}"


def public_card(post: dict[str, Any], viewer_latlng: tuple[float, float] | None = None) -> dict[str, Any]:
    if post.get("type") != "found" and not post.get("_allow_lost_public"):
        # Public feed is found-only unless the lost-feed flag path marked it.
        pass
    dist = None
    if viewer_latlng and post.get("lat") is not None and post.get("lng") is not None:
        dist = haversine_km(viewer_latlng[0], viewer_latlng[1], float(post["lat"]), float(post["lng"]))
    category = post.get("category")
    public_photo = bool(post.get("publicPhoto")) and category not in ID_CATEGORIES
    card = {
        "id": post.get("id"),
        "type": post.get("type"),
        "category": category,
        "title": post.get("title"),
        "publicDescription": "" if category in ID_CATEGORIES else post.get("publicDescription"),
        "city": post.get("city"),
        "area": post.get("area"),
        "distanceLabel": distance_label(dist),
        "foundAt": post.get("foundAt"),
        "heldAt": post.get("heldAt") if post.get("type") == "found" else None,
        "status": post.get("status"),
        "createdAt": post.get("createdAt"),
        "hasPoliceReport": bool(post.get("policeReport")),
        "demo": bool(post.get("demo")),
        "publicPhotoUrl": _photo_url(post) if public_photo else None,
        "lang": post.get("lang") or "en",
        "guest": bool(post.get("guest")),
    }
    return {k: v for k, v in card.items() if k in PUBLIC_CARD_ALLOWLIST}


def owner_view(post: dict[str, Any]) -> dict[str, Any]:
    photos = []
    for n in range(int(post.get("photoCount") or 0)):
        photos.append({"n": n, "url": f"/lf/photos/{post['id']}/{n}"})
    identifiers = []
    for ident in post.get("identifiers") or []:
        identifiers.append(
            {
                "idType": ident.get("idType"),
                "pv": ident.get("pv"),
                "last4Masked": ident.get("last4Masked"),
                "hasFingerprint": True,
            }
        )
    return {
        "id": post.get("id"),
        "type": post.get("type"),
        "status": post.get("status"),
        "category": post.get("category"),
        "title": post.get("title"),
        "publicDescription": post.get("publicDescription"),
        "privateDescription": post.get("privateDescription"),
        "city": post.get("city"),
        "area": post.get("area"),
        "radiusKm": post.get("radiusKm"),
        "dateFrom": post.get("dateFrom"),
        "dateTo": post.get("dateTo"),
        "foundAt": post.get("foundAt"),
        "heldAt": post.get("heldAt"),
        "identifiers": identifiers,
        "keywords": post.get("keywords") or [],
        "photoCount": post.get("photoCount") or 0,
        "publicPhoto": bool(post.get("publicPhoto")),
        "photos": photos,
        "verification": post.get("verification") if post.get("type") == "found" else None,
        "policeReport": post.get("policeReport"),
        "demo": bool(post.get("demo")),
        "guest": bool(post.get("guest")),
        "createdAt": post.get("createdAt"),
        "expiresAt": post.get("expiresAt"),
        "reportCount": post.get("reportCount") or 0,
        "lang": post.get("lang") or "en",
    }


def match_view(
    match: dict[str, Any],
    other_post: dict[str, Any],
    viewer_uid: str,
) -> dict[str, Any]:
    del viewer_uid
    return {
        "matchId": match.get("id"),
        "kind": match.get("kind"),
        "scoreBand": score_band(int(match.get("score") or 0), match.get("kind") == "strong"),
        "score": int(match.get("score") or 0) if match.get("kind") == "strong" else int(match.get("score") or 0),
        "reasons": match.get("reasons") or [],
        "state": match.get("state"),
        "otherPost": public_card(other_post),
        "createdAt": match.get("createdAt"),
    }


def claim_view(
    claim: dict[str, Any],
    *,
    viewer_uid: str,
    is_finder: bool,
    questions: list[str] | None = None,
    counterpart_contact: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": claim.get("id"),
        "matchId": claim.get("matchId"),
        "state": claim.get("state"),
        "createdAt": claim.get("createdAt"),
        "decidedAt": claim.get("decidedAt"),
        "shared": claim.get("shared") or {"lostOwner": [], "finder": []},
        "hasPoliceReport": bool(claim.get("policeReport")),
    }
    if is_finder:
        out["answers"] = claim.get("answers") or []
        out["message"] = claim.get("message")
        out["questions"] = questions or []
    else:
        out["questions"] = questions or []
        out["message"] = None
        if claim.get("claimerUid") == viewer_uid:
            out["answers"] = claim.get("answers") or []
            out["message"] = claim.get("message")
    if counterpart_contact:
        out["counterpart"] = counterpart_contact
    return out


def assert_no_leak(payload: Any, extra_forbidden: Iterable[str] = ()) -> None:
    forbidden = FORBIDDEN_ANYWHERE_PUBLIC | set(extra_forbidden)
    stack = [payload]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for key, value in cur.items():
                if key in forbidden:
                    raise AssertionError(f"leaked field {key}")
                stack.append(value)
        elif isinstance(cur, list):
            stack.extend(cur)
