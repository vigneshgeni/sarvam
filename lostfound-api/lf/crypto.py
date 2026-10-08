"""Fernet field encryption for contact details. Decrypt only at a permitted reveal."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from lf.config import get_settings


def _fernet() -> Fernet:
    key = get_settings().field_key.strip()
    try:
        raw = base64.urlsafe_b64decode(key)
        if len(raw) != 32:
            raise ValueError
        return Fernet(key.encode("utf-8") if isinstance(key, str) else key)
    except Exception:
        digest = hashlib.sha256(key.encode("utf-8")).digest()
        return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_field(plain: str | None) -> str | None:
    if not plain:
        return None
    return _fernet().encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_field(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError):
        return None
