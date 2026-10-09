"""Verify Firebase ID tokens, or mint demo guests when Firebase is not configured."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import Header, HTTPException, Request

from lf.config import get_settings
from lf.store import get_store, iso

log = logging.getLogger("lf.auth")

_firebase_app = None
_firebase_failed = False


@dataclass
class Principal:
    uid: str
    guest: bool
    demo: bool
    email: str | None = None
    name: str | None = None


def _try_firebase() -> Any | None:
    global _firebase_app, _firebase_failed
    if _firebase_failed:
        return None
    if _firebase_app is not None:
        return _firebase_app
    try:
        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.ApplicationDefault())
        _firebase_app = firebase_admin.get_app()
        return _firebase_app
    except Exception as exc:
        _firebase_failed = True
        log.info("firebase_unavailable reason=init_failed")
        del exc
        return None


def _verify_firebase(token: str) -> Principal | None:
    if _try_firebase() is None:
        return None
    try:
        from firebase_admin import auth as fb_auth

        decoded = fb_auth.verify_id_token(token)
        uid = decoded.get("uid")
        if not uid:
            return None
        guest = bool(decoded.get("firebase", {}).get("sign_in_provider") == "anonymous")
        return Principal(uid=uid, guest=guest, demo=False, email=decoded.get("email"), name=decoded.get("name"))
    except Exception:
        return None


def parse_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, rest = authorization.partition(" ")
    if scheme.lower() != "bearer" or not rest.strip():
        return None
    return rest.strip()


def ensure_user(principal: Principal) -> dict:
    store = get_store()
    existing = store.get_user(principal.uid)
    if existing:
        return existing
    return store.upsert_user(
        principal.uid,
        {
            "guest": principal.guest,
            "demo": principal.demo,
            "displayName": (principal.name or "").split(" ")[0] if principal.name else None,
            "ageConfirmed": False,
            "consentAt": None,
            "createdAt": iso(),
        },
    )


async def optional_user(
    request: Request,
    authorization: str | None = Header(default=None),
) -> Principal | None:
    token = parse_bearer(authorization)
    if not token:
        return None
    settings = get_settings()
    if token.startswith("demo-") and settings.demo_mode:
        uid = token
        guest = True
        if token in {"demo-finder", "demo-owner"}:
            guest = False
        return Principal(uid=uid, guest=guest, demo=True)
    fb = _verify_firebase(token)
    if fb:
        return fb
    if settings.demo_mode and token.startswith("demo"):
        return Principal(uid=token, guest=True, demo=True)
    return None


async def require_user(
    request: Request,
    authorization: str | None = Header(default=None),
) -> Principal:
    principal = await optional_user(request, authorization)
    if principal is None:
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthorized", "message": "Sign in with Google or continue as guest (demo)."},
        )
    ensure_user(principal)
    return principal


def mint_demo_guest() -> tuple[str, Principal]:
    token = f"demo-guest-{uuid.uuid4().hex[:12]}"
    principal = Principal(uid=token, guest=True, demo=True, name="Guest")
    ensure_user(principal)
    return token, principal
