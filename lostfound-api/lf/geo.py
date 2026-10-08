"""Geohash, haversine, and Indian city lookup. No maps library."""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
_NEIGHBORS = {
    "n": {"even": "p0r21436x8zb9dcf5h7kjnmqesgutwvy", "odd": "bc01fg45238967deuvhjyznpkmstqrwx"},
    "s": {"even": "14365h7k9dcfesgujnmqp0r2twvyx8zb", "odd": "238967debc01fg45kmstqrwxuvhjyznp"},
    "e": {"even": "bc01fg45238967deuvhjyznpkmstqrwx", "odd": "p0r21436x8zb9dcf5h7kjnmqesgutwvy"},
    "w": {"even": "238967debc01fg45kmstqrwxuvhjyznp", "odd": "14365h7k9dcfesgujnmqp0r2twvyx8zb"},
}
_BORDERS = {
    "n": {"even": "prxz", "odd": "bcfguvyz"},
    "s": {"even": "028b", "odd": "0145hjnp"},
    "e": {"even": "bcfguvyz", "odd": "prxz"},
    "w": {"even": "0145hjnp", "odd": "028b"},
}


def geohash_encode(lat: float, lng: float, precision: int = 7) -> str:
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError("invalid_coordinates")
    lat_range = [-90.0, 90.0]
    lng_range = [-180.0, 180.0]
    bits = [16, 8, 4, 2, 1]
    hash_chars: list[str] = []
    bit = 0
    ch = 0
    even = True
    while len(hash_chars) < precision:
        if even:
            mid = (lng_range[0] + lng_range[1]) / 2
            if lng >= mid:
                ch |= bits[bit]
                lng_range[0] = mid
            else:
                lng_range[1] = mid
        else:
            mid = (lat_range[0] + lat_range[1]) / 2
            if lat >= mid:
                ch |= bits[bit]
                lat_range[0] = mid
            else:
                lat_range[1] = mid
        even = not even
        if bit < 4:
            bit += 1
        else:
            hash_chars.append(BASE32[ch])
            bit = 0
            ch = 0
    return "".join(hash_chars)


def _adjacent(geohash: str, direction: str) -> str:
    geohash = geohash.lower()
    if not geohash:
        return ""
    last = geohash[-1]
    parent = geohash[:-1]
    kind = "odd" if len(geohash) % 2 else "even"
    if last in _BORDERS[direction][kind] and parent:
        parent = _adjacent(parent, direction)
    if not parent and last in _BORDERS[direction][kind]:
        return ""
    idx = _NEIGHBORS[direction][kind].index(last)
    return parent + BASE32[idx]


def geohash_neighbours(geohash: str) -> set[str]:
    n = _adjacent(geohash, "n")
    s = _adjacent(geohash, "s")
    e = _adjacent(geohash, "e")
    w = _adjacent(geohash, "w")
    cells = {geohash, n, s, e, w}
    if n:
        cells.add(_adjacent(n, "e"))
        cells.add(_adjacent(n, "w"))
    if s:
        cells.add(_adjacent(s, "e"))
        cells.add(_adjacent(s, "w"))
    return {c for c in cells if c}


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return 2 * radius * math.asin(min(1.0, math.sqrt(a)))


def _norm_city(name: str) -> str:
    return "".join(ch for ch in (name or "").lower() if ch.isalnum())


@lru_cache
def load_cities() -> list[dict]:
    path = Path(__file__).resolve().parent.parent / "data" / "cities.json"
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def lookup_city(name: str) -> dict | None:
    key = _norm_city(name)
    if not key:
        return None
    for city in load_cities():
        aliases = [_norm_city(city["key"]), _norm_city(city["name"]), _norm_city(city.get("state", ""))]
        aliases.extend(_norm_city(a) for a in city.get("aliases", []))
        if key in aliases or _norm_city(city["name"]) == key:
            return city
        if key == _norm_city(city["key"]):
            return city
    for city in load_cities():
        if _norm_city(city["name"]).startswith(key) or key in _norm_city(city["name"]):
            return city
    return None


def city_centre(name: str) -> tuple[float, float] | None:
    city = lookup_city(name)
    if not city:
        return None
    return float(city["lat"]), float(city["lng"])


def distance_label(km: float | None) -> str | None:
    if km is None:
        return None
    if km < 1:
        return "same area"
    if km < 3:
        return "about 2 km away"
    if km < 6:
        return "a few kilometres away"
    if km < 15:
        return "in this city"
    return "nearby city"
