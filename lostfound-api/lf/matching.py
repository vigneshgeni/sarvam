"""Strong + possible matching. Pure functions. No AI in the loop."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from lf.config import DOCUMENT_FAMILY, MATCH_WEIGHTS
from lf.dicts import BRANDS, COLOURS, shared_public_words, tokens_from
from lf.geo import geohash_neighbours, haversine_km

Reason = dict[str, str]


def match_id(lost_id: str, found_id: str) -> str:
    return f"{lost_id}_{found_id}"


def _same_family(a: str, b: str) -> bool:
    return a in DOCUMENT_FAMILY and b in DOCUMENT_FAMILY


def category_score(lost_cat: str, found_cat: str) -> tuple[int, Reason | None]:
    if lost_cat == found_cat:
        return MATCH_WEIGHTS["category"], {"code": "SAME_CATEGORY", "text": "Same type of item"}
    if lost_cat == "other" or found_cat == "other":
        return 10, {"code": "SAME_CATEGORY", "text": "Related (one side marked other)"}
    if _same_family(lost_cat, found_cat):
        return 10, {"code": "SAME_CATEGORY", "text": "Related document type"}
    return 0, None


def proximity_score(
    lost: dict[str, Any],
    found: dict[str, Any],
) -> tuple[int, list[Reason]]:
    reasons: list[Reason] = []
    same_city = (lost.get("city") or "") == (found.get("city") or "") and bool(lost.get("city"))
    lat1, lng1 = lost.get("lat"), lost.get("lng")
    lat2, lng2 = found.get("lat"), found.get("lng")
    km = None
    if None not in (lat1, lng1, lat2, lng2):
        km = haversine_km(float(lat1), float(lng1), float(lat2), float(lng2))
    radius = lost.get("radiusKm")
    pts = 0
    if radius is None:
        if same_city:
            pts = 10
            reasons.append({"code": "SAME_CITY", "text": "Same city (city-wide search)"})
    else:
        r = float(radius) or 1.0
        if km is None:
            pts = 10 if same_city else 0
            if same_city:
                reasons.append({"code": "SAME_CITY", "text": "Same city"})
        else:
            pts = max(0, round(MATCH_WEIGHTS["proximity"] * (1 - min(km, r) / r)))
            if pts > 0:
                if km < 1 and same_city:
                    reasons.append({"code": "NEARBY", "text": "Same area"})
                else:
                    reasons.append(
                        {"code": "NEARBY", "text": f"About {max(1, round(km))} km apart"}
                    )
            elif same_city:
                reasons.append({"code": "SAME_CITY", "text": "Same city"})
                pts = max(pts, 4)
    return pts, reasons


def _as_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def date_score(lost: dict[str, Any], found: dict[str, Any]) -> tuple[int, Reason | None]:
    found_at = _as_date(found.get("foundAt"))
    date_from = _as_date(lost.get("dateFrom"))
    date_to = _as_date(lost.get("dateTo")) or date_from
    if not found_at or not date_from or not date_to:
        return 0, None
    if found_at < date_from - timedelta(days=1):
        return 0, None
    if date_from <= found_at <= date_to + timedelta(days=3):
        days = (found_at - date_to).days if found_at > date_to else 0
        text = "Found right after it was lost" if days <= 1 else f"Found {days} days after"
        return MATCH_WEIGHTS["date"], {"code": "FOUND_SOON_AFTER", "text": text}
    days_after = (found_at - date_to).days
    if days_after > 90:
        return 0, None
    pts = round(MATCH_WEIGHTS["date"] * (1 - (days_after - 3) / 87))
    pts = max(0, min(MATCH_WEIGHTS["date"], pts))
    if pts <= 0:
        return 0, None
    return pts, {"code": "FOUND_SOON_AFTER", "text": f"Found {days_after} days later"}


def keyword_score(lost: dict[str, Any], found: dict[str, Any]) -> tuple[int, list[Reason]]:
    lost_pub = tokens_from(lost.get("title") or "", lost.get("publicDescription") or "")
    found_pub = tokens_from(found.get("title") or "", found.get("publicDescription") or "")
    lost_all = set(lost.get("keywords") or []) | lost_pub | tokens_from(
        lost.get("privateDescription") or ""
    )
    found_all = set(found.get("keywords") or []) | found_pub | tokens_from(
        found.get("privateDescription") or ""
    )
    union = lost_all | found_all
    inter = lost_all & found_all
    jaccard = (len(inter) / len(union)) if union else 0.0
    pts = round(MATCH_WEIGHTS["keywords"] * jaccard)
    reasons: list[Reason] = []
    shared = shared_public_words(lost_pub, found_pub)
    colour = (lost_all & found_all & COLOURS)
    brand = (lost_all & found_all & BRANDS)
    if colour:
        pts = min(MATCH_WEIGHTS["keywords"], pts + 4)
        reasons.append({"code": "COLOUR", "text": sorted(colour)[0]})
    if brand:
        pts = min(MATCH_WEIGHTS["keywords"], pts + 4)
        reasons.append({"code": "BRAND", "text": sorted(brand)[0]})
    if shared:
        pts = max(pts, min(MATCH_WEIGHTS["keywords"], 6 + 4 * min(3, len(shared))))
        shown = ", ".join(f'"{w}"' for w in shared[:3])
        reasons.append({"code": "SHARED_WORDS", "text": f"Shared words {shown}"})
    return min(MATCH_WEIGHTS["keywords"], pts), reasons


def name_score(lost_keys: list[str], found_keys: list[str]) -> tuple[int, Reason | None]:
    shared = set(lost_keys or []) & set(found_keys or [])
    if len(shared) >= 2:
        return 10, {"code": "NAME_OVERLAP", "text": "Name matches (kept private)"}
    if len(shared) == 1:
        return 4, {"code": "NAME_OVERLAP", "text": "Part of the name matches (kept private)"}
    return 0, None


def identifier_hit(lost: dict[str, Any], found: dict[str, Any]) -> bool:
    left = {(i.get("idType"), i.get("matchKey"), i.get("pv")) for i in lost.get("identifiers") or []}
    right = {(i.get("idType"), i.get("matchKey"), i.get("pv")) for i in found.get("identifiers") or []}
    left.discard((None, None, None))
    for item in left:
        if item[1] and item in right:
            return True
    return False


def score_pair(lost: dict[str, Any], found: dict[str, Any]) -> dict[str, Any]:
    reasons: list[Reason] = []
    strong = identifier_hit(lost, found)
    if strong:
        return {
            "kind": "strong",
            "score": 100,
            "reasons": [
                {
                    "code": "ID_MATCH",
                    "text": "The ID number you entered matches this found item",
                }
            ],
            "strong": True,
        }
    c_pts, c_reason = category_score(lost.get("category") or "", found.get("category") or "")
    if c_reason:
        reasons.append(c_reason)
    p_pts, p_reasons = proximity_score(lost, found)
    reasons.extend(p_reasons)
    d_pts, d_reason = date_score(lost, found)
    if d_reason:
        reasons.append(d_reason)
    k_pts, k_reasons = keyword_score(lost, found)
    reasons.extend(k_reasons)
    n_pts, n_reason = name_score(lost.get("nameKeys") or [], found.get("nameKeys") or [])
    if n_reason:
        reasons.append(n_reason)
    total = c_pts + p_pts + d_pts + k_pts + n_pts
    return {
        "kind": "possible",
        "score": int(total),
        "reasons": reasons,
        "strong": False,
        "parts": {
            "category": c_pts,
            "proximity": p_pts,
            "date": d_pts,
            "keywords": k_pts,
            "name": n_pts,
        },
    }


def is_candidate(new_post: dict[str, Any], other: dict[str, Any]) -> bool:
    if new_post.get("ownerUid") == other.get("ownerUid"):
        return False
    if other.get("status") not in {None, "open", "matched"}:
        return False
    if other.get("status") in {"hidden", "expired", "closed", "returned"}:
        return False
    if new_post.get("type") == other.get("type"):
        return False
    lost, found = (new_post, other) if new_post.get("type") == "lost" else (other, new_post)
    if lost.get("type") != "lost" or found.get("type") != "found":
        return False
    lc, fc = lost.get("category") or "", found.get("category") or ""
    if lc != fc and lc != "other" and fc != "other" and not _same_family(lc, fc):
        return False
    city_ok = (lost.get("city") and lost.get("city") == found.get("city"))
    geo_ok = False
    if lost.get("geo7") and found.get("geo7"):
        geo_ok = found["geo7"] in geohash_neighbours(lost["geo7"]) or lost["geo7"] == found["geo7"]
    if not city_ok and not geo_ok:
        return False
    return True


def decide(lost: dict[str, Any], found: dict[str, Any], threshold: int = 45) -> dict[str, Any] | None:
    result = score_pair(lost, found)
    if result["strong"]:
        result["lostPostId"] = lost["id"]
        result["foundPostId"] = found["id"]
        result["id"] = match_id(lost["id"], found["id"])
        return result
    cat_pts = int((result.get("parts") or {}).get("category") or 0)
    if cat_pts <= 0:
        return None
    if result["score"] >= threshold:
        result["lostPostId"] = lost["id"]
        result["foundPostId"] = found["id"]
        result["id"] = match_id(lost["id"], found["id"])
        return result
    return None
