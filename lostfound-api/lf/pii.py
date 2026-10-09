"""PII masking and a Luhn card-number guard. Never store the plaintext that tripped a guard."""

from __future__ import annotations

import re

from lf.ids import luhn_ok

HIDDEN = "[hidden]"

_EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
_URL = re.compile(r"https?://\S+|www\.\S+", re.I)
_PAN = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", re.I)
_PASSPORT = re.compile(r"\b[A-Z][0-9]{7}\b", re.I)
_AADHAAR = re.compile(r"\b[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}\b")
_PHONE = re.compile(
    r"(?:\+91[\s-]?)?[6-9][0-9]{4}[\s-]?[0-9]{5}|\b[6-9][0-9]{9}\b|\+?\d[\d\s-]{8,}\d"
)
_LONG_DIGITS = re.compile(r"\b\d{10,}\b")
_DIGIT_RUN = re.compile(r"\d[\d\s-]{11,}\d")


class CardNumberRejected(ValueError):
    code = "card_number_forbidden"


def looks_like_card_number(text: str) -> bool:
    compact = re.sub(r"[\s-]", "", text or "")
    for match in re.finditer(r"\d{13,19}", compact):
        if luhn_ok(match.group(0)):
            return True
    return False


def reject_card_numbers(*texts: str | None) -> None:
    for text in texts:
        if text and looks_like_card_number(text):
            raise CardNumberRejected(
                "That looks like a bank card number. Sarvam never accepts card numbers."
            )


def mask_pii(text: str) -> str:
    if not text:
        return ""
    out = _URL.sub(HIDDEN, text)
    out = _EMAIL.sub(HIDDEN, out)
    out = _PAN.sub(HIDDEN, out)
    out = _PASSPORT.sub(HIDDEN, out)
    out = _AADHAAR.sub(HIDDEN, out)
    out = _PHONE.sub(HIDDEN, out)
    out = _LONG_DIGITS.sub(HIDDEN, out)
    out = _DIGIT_RUN.sub(HIDDEN, out)
    return out


def sanitise_title(text: str, max_len: int = 80) -> str:
    return mask_pii(text).strip()[:max_len]


def sanitise_public(text: str, max_len: int = 400) -> str:
    return mask_pii(text).strip()[:max_len]


def sanitise_private(text: str, max_len: int = 800) -> str:
    reject_card_numbers(text)
    return (text or "").strip()[:max_len]
