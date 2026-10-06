import io
import re
from typing import List, Optional

import pypdf

from dates import detect_date_conflicts


def extract_pdf_pages(pdf_bytes: bytes) -> List[str]:
    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        pages_text = []
        for page in reader.pages:
            pages_text.append(page.extract_text() or "")
        return pages_text
    except Exception:
        return []


def collapse_whitespace(text: str) -> str:
    return " ".join((text or "").split())


def extract_critical_tokens(text: str) -> List[str]:
    """
    Extracts dates, amounts (Rs./₹), phone numbers, and key numeric measurements.
    """
    if not text:
        return []
    tokens = []

    # Amounts: Rs. 31,200 / ₹1,200 / Rs. 17,300
    amounts = re.findall(r"(?:Rs\.?|₹|INR)\s*[\d,]+(?:\.\d+)?", text, re.IGNORECASE)
    tokens.extend(amounts)

    # Dates: 30.11.2026 / 12-09-2026 / 01 October 2026 / 2026-11-30
    dates = re.findall(
        r"(\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b)",
        text,
        re.IGNORECASE,
    )
    tokens.extend(dates)

    # Phone numbers: +91 80 4000 5678 / 1800 000 0000 / 080-0000-4412
    phones = re.findall(
        r"((?:\+91[\s-]?)?(?:1800[\s-]?\d{3}[\s-]?\d{3,4}|\b\d{2,4}[-\s]\d{3,4}[-\s]\d{4}\b))",
        text,
    )
    tokens.extend(phones)

    return [t.strip() for t in tokens if t.strip()]


def verify_evidence(
    quote: str,
    item_text: str,
    page: int,
    pages_text: Optional[List[str]],
    is_calculated: bool = False,
) -> str:
    """
    Determines evidence label:
    - 'calculated' if date computed from relative deadline
    - 'matched' if PDF text layer matches quote exactly (after normalising whitespace)
      AND every date, amount, and phone number inside quote/text appears character-for-character
    - 'check_original' otherwise (or for all images/photos)
    """
    if is_calculated:
        return "calculated"

    # Images or PDFs without text layer are always check_original
    if not pages_text or len(pages_text) == 0:
        return "check_original"

    # Normalize target page text
    page_idx = page - 1
    if 0 <= page_idx < len(pages_text):
        target_page_text = pages_text[page_idx]
    else:
        # Fallback to searching all pages
        target_page_text = " ".join(pages_text)

    norm_target = collapse_whitespace(target_page_text)
    norm_quote = collapse_whitespace(quote)

    if not norm_quote or norm_quote not in norm_target:
        return "check_original"

    # Extract critical tokens from quote and item text
    critical_tokens = extract_critical_tokens(quote) + extract_critical_tokens(item_text)

    for token in critical_tokens:
        norm_token = collapse_whitespace(token)
        # Token must appear in target page text or normalized page text
        if token not in target_page_text and norm_token not in norm_target:
            return "check_original"

    return "matched"


def collect_conflicts(
    pages_text: Optional[List[str]],
    model_conflicts: Optional[List[str]] = None,
) -> List[str]:
    conflicts = list(model_conflicts or [])
    if not pages_text:
        return conflicts

    full_text = "\n".join(pages_text)
    code_conflicts = detect_date_conflicts(full_text)

    for c in code_conflicts:
        if c not in conflicts:
            conflicts.append(c)

    return conflicts


def compute_evidence_summary(
    actions: List[dict],
    warnings: List[dict],
    facts: List[dict],
) -> dict:
    matched = 0
    check_original = 0
    calculated = 0

    all_items = actions + warnings + facts
    for item in all_items:
        ev = item.get("evidence", "check_original")
        if ev == "matched":
            matched += 1
        elif ev == "calculated":
            calculated += 1
        else:
            check_original += 1

    return {
        "matched": matched,
        "check_original": check_original,
        "calculated": calculated,
    }
