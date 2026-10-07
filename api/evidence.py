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


DEVANAGARI_DIGITS = "०१२३४५६७८९"
TAMIL_DIGITS = "௦௧௨௩௪௫௬௭௮௯"


def normalize_digits(text: str) -> str:
    if not text:
        return ""
    for i, d in enumerate(DEVANAGARI_DIGITS):
        text = text.replace(d, str(i))
    for i, d in enumerate(TAMIL_DIGITS):
        text = text.replace(d, str(i))
    return text


def normalize_text_for_guard(text: str) -> str:
    """
    Normalizes text for translation guard comparison:
    1. Normalizes Tamil (௦-௯) and Devanagari (०-९) digits to 0-9.
    2. Strips thousands separators (including Indian grouping 1,23,456 and standard 12,345).
    3. Treats Rs./Rs/INR/₹/ரூ/रु as equivalent (canonical symbol ₹).
    """
    if not text:
        return ""
    t = normalize_digits(text)
    t = re.sub(r"(?:Rs\.?|INR|₹|ரூ\.?|रु\.?)", "₹", t, flags=re.IGNORECASE)
    t = re.sub(r"(?<=\d),(?=\d)", "", t)
    return t


def extract_digit_sequences(text: str) -> List[str]:
    """
    Extracts digit sequences from normalized text (compares digit sequences, never month names).
    """
    norm = normalize_text_for_guard(text)
    return re.findall(r"\d+", norm)


def verify_translation_guard(orig_text: Optional[str], trans_text: Optional[str]) -> bool:
    """
    Guard: verifies every number, date, amount and phone number in orig_text appears in trans_text.
    - Normalizes Tamil and Devanagari digits to 0-9
    - Strips thousands separators (e.g. 1,23,456 -> 123456)
    - Treats Rs./Rs/INR/₹ as equivalent
    - Compares digit sequences, never month names
    """
    if not orig_text:
        return True
    orig_digits = extract_digit_sequences(orig_text)
    if not orig_digits:
        return True
    if not trans_text:
        return False

    trans_digits = extract_digit_sequences(trans_text)
    from collections import Counter
    trans_counter = Counter(trans_digits)

    for d in orig_digits:
        stripped = d.lstrip("0") or "0"
        if trans_counter[d] > 0:
            trans_counter[d] -= 1
        elif trans_counter[stripped] > 0:
            trans_counter[stripped] -= 1
        elif any(d in td for td in trans_digits):
            pass
        else:
            return False

    # Check currency preservation if original had currency
    norm_orig = normalize_text_for_guard(orig_text)
    norm_trans = normalize_text_for_guard(trans_text)
    if "₹" in norm_orig and "₹" not in norm_trans:
        return False

    return True


def verify_protected_terms_guard(
    protected_terms: Optional[List[str]],
    orig_text: Optional[str],
    trans_text: Optional[str],
) -> bool:
    """
    Guard: verifies every protected term that appears in the original text
    must appear verbatim in the translated text.
    - Person names, patient/doctor names, hospital/lab/company names,
      addresses, place names, and ID/policy/account/reference numbers.
    - Original script must be preserved (Latin stays Latin, Tamil stays Tamil, etc.).
    """
    if not protected_terms or not orig_text:
        return True
    if not trans_text:
        return False

    norm_orig = collapse_whitespace(orig_text)
    norm_trans = collapse_whitespace(trans_text)

    for term in protected_terms:
        clean_term = term.strip()
        if not clean_term:
            continue
        norm_term = collapse_whitespace(clean_term)
        if norm_term in norm_orig:
            if norm_term not in norm_trans:
                return False
    return True


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
