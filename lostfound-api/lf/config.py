"""Environment and feature flags for sarvam-lf-api."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

# Contest prototype defaults to demo mode so a judge can run without GCP.
_DEMO_PEPPER = "DEMO_ONLY_NOT_FOR_PRODUCTION_sarvam-lf-pepper"
_DEMO_FIELD_KEY = "dGVzdC1sZi1maWVsZC1rZXktMzItYnl0ZXMhISE="  # 32 url-safe bytes, demo only


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


@dataclass(frozen=True)
class Settings:
    project: str
    model: str
    vertex_location: str
    allowed_origins: tuple[str, ...]
    collection_prefix: str
    id_pepper: str
    field_key: str
    pepper_version: int
    demo_mode: bool
    aadhaar_lite: bool
    public_lost_feed: bool
    match_threshold: int
    post_ttl_days: int
    port: int
    store: str
    demo_pepper: bool
    demo_field_key: bool


def _origins() -> tuple[str, ...]:
    raw = os.environ.get(
        "LF_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:41777,http://127.0.0.1:41777,"
        "http://localhost:43123,http://127.0.0.1:43123,"
        "http://localhost:4173,http://127.0.0.1:4173,"
        "http://localhost:8080,http://127.0.0.1:8080",
    )
    return tuple(part.strip() for part in raw.split(",") if part.strip())


@lru_cache
def get_settings() -> Settings:
    demo_mode = _bool("LF_DEMO_MODE", True)
    pepper = os.environ.get("LF_ID_PEPPER", "").strip()
    field_key = os.environ.get("LF_FIELD_KEY", "").strip()
    demo_pepper = False
    demo_field_key = False
    if not pepper:
        if not demo_mode:
            raise RuntimeError("LF_ID_PEPPER is required when LF_DEMO_MODE is false")
        pepper = _DEMO_PEPPER
        demo_pepper = True
    if not field_key:
        if not demo_mode:
            raise RuntimeError("LF_FIELD_KEY is required when LF_DEMO_MODE is false")
        field_key = _DEMO_FIELD_KEY
        demo_field_key = True
    store = os.environ.get("LF_STORE", "").strip().lower()
    if not store:
        store = "memory" if demo_mode else "firestore"
    return Settings(
        project=os.environ.get("PROJECT", "sarvam-510715"),
        model=os.environ.get("MODEL", "gemini-3.7-flash"),
        vertex_location=os.environ.get("VERTEX_LOCATION", "global"),
        allowed_origins=_origins(),
        collection_prefix=os.environ.get("LF_COLLECTION_PREFIX", "dev_"),
        id_pepper=pepper,
        field_key=field_key,
        pepper_version=_int("LF_PEPPER_VERSION", 1),
        demo_mode=demo_mode,
        aadhaar_lite=_bool("LF_AADHAAR_LITE", False),
        public_lost_feed=_bool("LF_PUBLIC_LOST_FEED", False),
        match_threshold=_int("LF_MATCH_THRESHOLD", 45),
        post_ttl_days=_int("LF_POST_TTL_DAYS", 90),
        port=_int("PORT", 43123),
        store=store,
        demo_pepper=demo_pepper,
        demo_field_key=demo_field_key,
    )


MATCH_WEIGHTS = {
    "category": 30,
    "proximity": 25,
    "date": 15,
    "keywords": 20,
    "name": 10,
}

DOCUMENT_FAMILY = frozenset(
    {
        "passport",
        "driving_licence",
        "aadhaar_card",
        "pan_card",
        "voter_id",
        "other_id",
        "certificate",
        "bank_card",
        "vehicle_rc",
    }
)

ID_CATEGORIES = DOCUMENT_FAMILY

CATEGORIES = (
    "wallet",
    "phone",
    "bag",
    "keys",
    "passport",
    "driving_licence",
    "aadhaar_card",
    "pan_card",
    "voter_id",
    "other_id",
    "certificate",
    "bank_card",
    "laptop_tablet",
    "jewellery",
    "vehicle_rc",
    "other",
)

HELD_AT = ("with_me", "police_station", "shop_or_office", "handed_to_authority")
POST_TYPES = ("lost", "found")
POST_STATUSES = ("open", "matched", "returned", "closed", "expired", "hidden")
