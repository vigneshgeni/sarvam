"""Synonyms, colours, brands and stopwords for explainable keyword matching."""

from __future__ import annotations

STOPWORDS = frozenset(
    {
        "the",
        "and",
        "with",
        "for",
        "has",
        "have",
        "had",
        "are",
        "was",
        "were",
        "small",
        "few",
        "big",
        "one",
        "some",
        "that",
        "this",
        "from",
        "inside",
        "near",
        "item",
        "card",
        "cards",
        "a",
        "an",
        "of",
        "in",
        "on",
        "to",
        "it",
        "its",
        "my",
        "our",
        "lost",
        "found",
        "please",
        "help",
    }
)

SYNONYMS: dict[str, str] = {
    "purse": "wallet",
    "wallets": "wallet",
    "mobile": "phone",
    "smartphone": "phone",
    "cellphone": "phone",
    "handset": "phone",
    "backpack": "bag",
    "handbag": "bag",
    "rucksack": "bag",
    "suitcase": "bag",
    "keyring": "keys",
    "keychain": "keys",
    "key": "keys",
    "license": "licence",
    "dl": "licence",
    "passbook": "passport",
    "notebook": "laptop",
    "tablet": "laptop",
    "ipad": "laptop",
}

COLOURS = frozenset(
    {
        "black",
        "white",
        "brown",
        "tan",
        "maroon",
        "red",
        "blue",
        "green",
        "yellow",
        "gold",
        "silver",
        "grey",
        "gray",
        "pink",
        "purple",
        "orange",
        "navy",
        "beige",
        "cream",
        "olive",
    }
)

BRANDS = frozenset(
    {
        "samsung",
        "apple",
        "iphone",
        "xiaomi",
        "redmi",
        "oneplus",
        "vivo",
        "oppo",
        "realme",
        "nokia",
        "motorola",
        "pixel",
        "hp",
        "dell",
        "lenovo",
        "asus",
        "acer",
        "sony",
        "boat",
        "jbl",
        "titan",
        "fastrack",
        "wildcraft",
        "american",
        "safari",
        "skybags",
    }
)


def canon_token(word: str) -> str:
    w = (word or "").lower()
    return SYNONYMS.get(w, w)


def tokens_from(*texts: str) -> set[str]:
    import re

    found: set[str] = set()
    for text in texts:
        for raw in re.split(r"[^a-zA-Z0-9]+", text or ""):
            w = raw.lower()
            if len(w) <= 2 or w in STOPWORDS:
                continue
            found.add(canon_token(w))
    return found


def shared_public_words(a: set[str], b: set[str]) -> list[str]:
    shared = sorted(a & b)
    return [w for w in shared if w not in STOPWORDS][:6]
