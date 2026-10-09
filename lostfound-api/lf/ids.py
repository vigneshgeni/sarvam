"""Normalise, lightly validate, and fingerprint identifiers. Plaintext never stored."""

from __future__ import annotations

import hashlib
import hmac
import re
from typing import Callable

TITLES = frozenset(
    {"mr", "mrs", "ms", "miss", "dr", "shri", "smt", "sri", "kumari", "kumar"}
)

_STRIP = re.compile(r"[\s.\-/\\]")


def luhn_ok(digits: str) -> bool:
    if not digits.isdigit() or not digits:
        return False
    total = 0
    alt = False
    for ch in reversed(digits):
        n = ord(ch) - 48
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        alt = not alt
    return total % 10 == 0


def normalize_id(raw: str) -> str:
    return _STRIP.sub("", raw or "").upper()


def _rx(pattern: str) -> Callable[[str], bool]:
    compiled = re.compile(pattern)

    def check(value: str) -> bool:
        return compiled.fullmatch(value) is not None

    return check


VALIDATORS: dict[str, Callable[[str], bool]] = {
    "passport": _rx(r"[A-Z][0-9]{7}"),
    "pan_card": _rx(r"[A-Z]{5}[0-9]{4}[A-Z]"),
    "voter_id": _rx(r"[A-Z]{3}[0-9]{7}"),
    "driving_licence": _rx(r"[A-Z0-9]{13,16}"),
    "vehicle_rc": _rx(r"[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}"),
    "imei": lambda n: n.isdigit() and len(n) == 15 and luhn_ok(n),
    "other_id": _rx(r"[A-Z0-9]{6,20}"),
}

ID_TYPES = tuple(VALIDATORS.keys()) + ("aadhaar_lite",)


def validate_id(id_type: str, raw: str) -> str:
    """Return normalised value or raise ValueError. Does not claim the ID is genuine."""
    normalised = normalize_id(raw)
    if id_type == "aadhaar_lite":
        raise ValueError("aadhaar_lite keys are built from last4 + birth year, not a full number")
    fn = VALIDATORS.get(id_type)
    if fn is None:
        raise ValueError("unknown_id_type")
    if not fn(normalised):
        raise ValueError("invalid_id_format")
    return normalised


def match_key(pepper: str, id_type: str, normalised: str) -> str:
    msg = f"{id_type}:{normalised}".encode("utf-8")
    return hmac.new(pepper.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def aadhaar_lite_key(pepper: str, last4: str, birth_year: str) -> str:
    if not re.fullmatch(r"[0-9]{4}", last4 or ""):
        raise ValueError("invalid_aadhaar_last4")
    if not re.fullmatch(r"[0-9]{4}", birth_year or ""):
        raise ValueError("invalid_birth_year")
    msg = f"aadhaar_lite:{last4}:{birth_year}".encode("utf-8")
    return hmac.new(pepper.encode("utf-8"), msg, hashlib.sha256).hexdigest()


_NAME_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)


def name_tokens(raw: str) -> list[str]:
    text = _NAME_PUNCT.sub(" ", (raw or "").lower())
    out: list[str] = []
    seen: set[str] = set()
    for part in text.split():
        if part in TITLES or len(part) <= 1:
            continue
        if part not in seen:
            seen.add(part)
            out.append(part)
        if len(out) >= 6:
            break
    return out


def name_keys(pepper: str, raw: str) -> list[str]:
    keys = []
    for token in name_tokens(raw):
        keys.append(
            hmac.new(
                pepper.encode("utf-8"),
                f"name:{token}".encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
        )
    return keys


def last4_masked(id_type: str, normalised: str) -> str | None:
    if id_type in {"aadhaar_card", "aadhaar_lite", "bank_card", "pan_card"}:
        return None
    if len(normalised) < 4:
        return None
    return normalised[-4:]
