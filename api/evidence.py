import io
import re
from typing import Any, List, Optional, Set, Tuple
import unicodedata

import pypdf

from dates import detect_date_conflicts
from errors import PDFPasswordRequiredError, PDFPasswordWrongError


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
TELUGU_DIGITS = "౦౧౨౩౪౫౬౭౮౯"
KANNADA_DIGITS = "೦೧೨೩೪೫೬೭೮೯"
MALAYALAM_DIGITS = "൦൧൨൩൪൫൬൭൮൯"

INDIC_SCRIPT_RANGES = {
    "ta": (0x0B80, 0x0BFF),  # Tamil
    "hi": (0x0900, 0x097F),  # Devanagari (Hindi)
    "te": (0x0C00, 0x0C7F),  # Telugu
    "ml": (0x0D00, 0x0D7F),  # Malayalam
    "kn": (0x0C80, 0x0CFF),  # Kannada
}


def normalize_digits(text: str) -> str:
    if not text:
        return ""
    for i, d in enumerate(DEVANAGARI_DIGITS):
        text = text.replace(d, str(i))
    for i, d in enumerate(TAMIL_DIGITS):
        text = text.replace(d, str(i))
    for i, d in enumerate(TELUGU_DIGITS):
        text = text.replace(d, str(i))
    for i, d in enumerate(KANNADA_DIGITS):
        text = text.replace(d, str(i))
    for i, d in enumerate(MALAYALAM_DIGITS):
        text = text.replace(d, str(i))
    return text


def extract_all_numbers(text: str) -> List[str]:
    """
    Extracts all numeric sequences from text after normalizing Indic digits.
    Handles commas, decimals, and clean digit strings.
    """
    if not text:
        return []
    norm = normalize_digits(text)
    # Strip commas inside numbers (e.g. 1,200 -> 1200)
    norm = re.sub(r"(?<=\d),(?=\d)", "", norm)
    # Find all numeric sequences (integers or decimals)
    found = re.findall(r"\b\d+(?:\.\d+)?\b", norm)
    return found


def verify_spoken_summary_digit_guard(
    spoken_summary: Optional[str],
    document_text: Optional[str],
    allowed_numbers: Optional[Set[str]] = None,
) -> Tuple[bool, List[str]]:
    """
    Digit guard for spoken_summary:
    Every number spoken in spoken_summary must appear in the document text
    or be present in allowed_numbers (e.g. extracted items, date components).
    Returns (is_valid, unverified_numbers).
    """
    if not spoken_summary:
        return True, []

    summary_numbers = extract_all_numbers(spoken_summary)
    if not summary_numbers:
        return True, []

    doc_numbers = set(extract_all_numbers(document_text or ""))
    if allowed_numbers:
        doc_numbers.update(allowed_numbers)

    # Also add derived date components (e.g. 2026-10-01 has 2026, 10, 01, 1)
    expanded_allowed = set()
    for num in doc_numbers:
        expanded_allowed.add(num)
        if num.startswith("0") and len(num) > 1:
            expanded_allowed.add(num.lstrip("0"))
        else:
            if len(num) == 1:
                expanded_allowed.add(f"0{num}")

    unverified = []
    for num in summary_numbers:
        if num in expanded_allowed:
            continue
        stripped = num.lstrip("0") if num.startswith("0") and len(num) > 1 else num
        two_digit = f"0{num}" if len(num) == 1 else num
        if stripped in expanded_allowed or two_digit in expanded_allowed:
            continue
        unverified.append(num)

    return (len(unverified) == 0, unverified)



def check_script_guard(texts: List[str], lang: str) -> Tuple[bool, float]:
    """
    Script guard for target languages ta, hi, te, ml, kn.
    At least 40% of the alphabetic characters across user-facing strings must be in the target script.
    Latin is allowed for protected terms, units and codes.
    Returns (passed, ratio).
    """
    norm_lang = (lang or "").lower().split("-")[0]
    if norm_lang not in INDIC_SCRIPT_RANGES:
        return True, 1.0

    start_codepoint, end_codepoint = INDIC_SCRIPT_RANGES[norm_lang]
    target_count = 0
    total_alpha_count = 0

    combined = " ".join(t for t in texts if t)
    for c in combined:
        if c.isalpha():
            total_alpha_count += 1
            code = ord(c)
            if start_codepoint <= code <= end_codepoint:
                target_count += 1

    if total_alpha_count == 0:
        return True, 1.0

    ratio = target_count / total_alpha_count
    return (ratio >= 0.40), ratio


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
    t = re.sub(r"(?:\bRs\.?|\bINR|₹|ரூ\.?|रु\.?)(?=\s*\d|\b)", "₹", t, flags=re.IGNORECASE)
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


# Named constant for generic office words safety net
GENERIC_OFFICE_WORDS = frozenset({
    # Words explicitly named in prompt
    "department",
    "cell",
    "manager",
    "officer",
    "office",
    "division",
    "clause",
    "section",
    "desk",
    "team",
    # Specific problem terms and common organizational variants
    "dept",
    "claim",
    "claims",
    "grievance",
    "grievances",
    "redressal",
    "complaint",
    "complaints",
    "service",
    "services",
    "support",
    "care",
    "customer",
    "helpdesk",
    "helpline",
    "unit",
    "branch",
    "center",
    "centre",
    "committee",
    "board",
    "group",
    "bureau",
    "wing",
    "agency",
    "council",
    "admin",
    "administration",
    "executive",
    "supervisor",
    "lead",
    "head",
    "director",
    "assistant",
    "associate",
    "coordinator",
    "representative",
    "agent",
    "specialist",
    "advisor",
    "clerk",
    "staff",
    "operations",
    "audit",
    "billing",
    "legal",
    "finance",
    "accounts",
    "underwriting",
    "subclause",
    "part",
    "page",
    # Common connectors
    "and",
    "of",
    "the",
    "for",
    "in",
    "at",
    "to",
})


def is_generic_office_term(term: str) -> bool:
    """
    Checks if a protected_terms entry is made up entirely of generic office words
    (department, cell, manager, officer, office, division, clause, section, desk, team, etc.)
    with no digits.
    """
    if not term or not term.strip():
        return False
    # If it contains any digits (e.g. CLM-2026-0884, POL-1234), keep it
    if any(c.isdigit() for c in term):
        return False
    words = re.findall(r"[A-Za-z]+", term.lower())
    if not words:
        return False
    return all(w in GENERIC_OFFICE_WORDS for w in words)


def filter_protected_terms(terms: Optional[List[str]]) -> List[str]:
    """
    Code safety net: drops any protected_terms entry made up entirely of
    generic office words with no digits.
    """
    if not terms:
        return []
    filtered = []
    for term in terms:
        if not term or not term.strip():
            continue
        if not is_generic_office_term(term):
            filtered.append(term.strip())
    return filtered


def normalize_protected_term(text: str) -> str:
    """
    Normalizes text for protected terms comparison:
    - Unicode NFC normalization
    - Whitespace collapsed
    - Lowercase (case-insensitive)
    """
    if not text:
        return ""
    nfc = unicodedata.normalize("NFC", text)
    collapsed = collapse_whitespace(nfc)
    return collapsed.lower()


def verify_protected_terms_guard(
    protected_terms: Optional[List[str]],
    orig_text: Optional[str],
    trans_text: Optional[str],
) -> bool:
    """
    Guard: verifies every protected term that appears in the original text
    must appear in the translated text.
    - Filters out generic office terms (safety net).
    - Case-insensitive, whitespace-collapsed, and Unicode NFC-normalised.
    - Original script must be preserved (Latin stays Latin, Tamil stays Tamil, etc.).
    """
    if not protected_terms or not orig_text:
        return True
    if not trans_text:
        return False

    active_terms = filter_protected_terms(protected_terms)
    if not active_terms:
        return True

    norm_orig = normalize_protected_term(orig_text)
    norm_trans = normalize_protected_term(trans_text)

    for term in active_terms:
        clean_term = term.strip()
        if not clean_term:
            continue
        norm_term = normalize_protected_term(clean_term)
        if not norm_term:
            continue
        if norm_term in norm_orig:
            if norm_term not in norm_trans:
                return False
    return True


def normalize_text_for_evidence(text: str) -> str:
    """
    Normalizes text for evidence matching:
    - Unicode NFKC normalization (expands ligatures like fi, fl)
    - Strips soft hyphens and zero-width characters
    - Indic digits normalization to 0-9
    - Hyphenation across line breaks: "de-\\npartment" -> "department"
    - Line breaks and multiple spaces collapsed
    - Currency symbols: Rs., Rs, INR, ₹, ரூ, रु normalized to canonical ₹
    - Number grouping: strips commas between digits (e.g. 1,00,000 -> 100000, 100,000 -> 100000)
    - Lac vs Lakh: "lac", "lacs", "lakh", "lakhs" normalized to "lakh"
    - Lowercase for case-insensitivity
    """
    if not text:
        return ""
    t = unicodedata.normalize("NFKC", text)
    t = re.sub(r"[\xad\u200b\u200c\u200d\ufeff]", "", t)
    t = normalize_digits(t)
    t = re.sub(r"(\b\w+)-\s*[\r\n]+\s*(\w+\b)", r"\1\2", t)
    t = re.sub(r"(?:\bRs\.?|\bINR|₹|ரூ\.?|रु\.?)(?=\s*\d|\b)", "₹", t, flags=re.IGNORECASE)
    t = re.sub(r"₹\s+", "₹", t)
    t = re.sub(r"(?<=\d),(?=\d)", "", t)
    t = re.sub(r"\b(lacs?|lakhs?)\b", "lakh", t, flags=re.IGNORECASE)
    return collapse_whitespace(t).lower()


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
    - 'matched' if PDF text layer matches quote exactly (after normalising)
      AND every date, amount, and phone number inside quote/text appears character-for-character
    - 'check_original' otherwise (or for all images/photos)
    """
    if is_calculated:
        return "calculated"

    # Images or PDFs without text layer are always check_original
    if not pages_text or len(pages_text) == 0:
        return "check_original"

    if not quote or not quote.strip():
        return "check_original"

    # Normalize target page text
    page_idx = page - 1
    if 0 <= page_idx < len(pages_text):
        target_page_text = pages_text[page_idx]
    else:
        # Fallback to searching all pages
        target_page_text = " ".join(pages_text)

    norm_target = normalize_text_for_evidence(target_page_text)
    norm_quote = normalize_text_for_evidence(quote)

    if not norm_quote or norm_quote not in norm_target:
        # Also check whole document if target page didn't match
        norm_all = normalize_text_for_evidence(" ".join(pages_text))
        if not norm_quote or norm_quote not in norm_all:
            return "check_original"
        norm_target = norm_all

    # Extract critical tokens from quote and item text
    critical_tokens = extract_critical_tokens(quote) + extract_critical_tokens(item_text)

    for token in critical_tokens:
        norm_token = normalize_text_for_evidence(token)
        if norm_token and norm_token not in norm_target:
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


# --- Step 5b-4: Source Kind, Places, Contacts, and Glance Evidence ---

EMAIL_REGEX = re.compile(r"^[\w\.\+\-]+@[\w\.\-]+\.[a-zA-Z]{2,}$")


def determine_source_kind(files_data: List[tuple], pdf_pages_text: Optional[List[str]]) -> str:
    """
    Determines source kind:
    - 'photo' if files are images or no PDF is present
    - 'scanned_pdf' when pypdf finds almost no text (<50 non-whitespace characters)
    - 'text_pdf' when pypdf finds legible text
    """
    has_pdf = False
    for _, mime in files_data:
        if "pdf" in (mime or "").lower():
            has_pdf = True
            break
    if not has_pdf:
        return "photo"

    total_text = "".join(pdf_pages_text or [])
    non_ws_chars = len(re.sub(r"\s+", "", total_text))
    if non_ws_chars < 50:
        return "scanned_pdf"
    return "text_pdf"


def validate_and_normalize_phone(val: str) -> Optional[str]:
    """
    Validates phone: 7-13 digits after normalising.
    """
    if not val:
        return None
    d_norm = normalize_digits(val)
    digits = re.sub(r"\D", "", d_norm)
    if 7 <= len(digits) <= 13:
        return val.strip()
    return None


def validate_email(val: str) -> bool:
    if not val:
        return False
    return bool(EMAIL_REGEX.match(val.strip()))


def is_valid_contact_value(val: str) -> bool:
    if not val:
        return False
    clean = val.strip()
    if validate_email(clean):
        return True
    if validate_and_normalize_phone(clean) is not None:
        return True
    return False


def verify_contact_evidence(val: str, quote: str, pdf_pages_text: Optional[List[str]]) -> str:
    if not pdf_pages_text or len(pdf_pages_text) == 0:
        return "check_original"
    full_text = " ".join(pdf_pages_text)
    norm_full = normalize_text_for_evidence(full_text)
    norm_val = normalize_text_for_evidence(val)
    norm_quote = normalize_text_for_evidence(quote)
    if (norm_val and norm_val in norm_full) or (norm_quote and norm_quote in norm_full):
        return "matched"
    digits = re.sub(r"\D", "", normalize_digits(val))
    if digits and len(digits) >= 7 and digits in re.sub(r"\D", "", normalize_digits(full_text)):
        return "matched"
    return "check_original"


def verify_place_evidence(address: str, quote: str, pdf_pages_text: Optional[List[str]]) -> str:
    if not pdf_pages_text or len(pdf_pages_text) == 0:
        return "check_original"
    full_text = " ".join(pdf_pages_text)
    norm_full = normalize_text_for_evidence(full_text)
    norm_addr = normalize_text_for_evidence(address)
    norm_quote = normalize_text_for_evidence(quote)
    if (norm_addr and norm_addr in norm_full) or (norm_quote and norm_quote in norm_full):
        return "matched"
    return "check_original"


def verify_glance_evidence(value: str, kind: str, pdf_pages_text: Optional[List[str]]) -> str:
    if not pdf_pages_text or len(pdf_pages_text) == 0 or not value:
        return "check_original"
    full_text = " ".join(pdf_pages_text)
    norm_full = normalize_text_for_evidence(full_text)
    norm_val = normalize_text_for_evidence(value)
    if norm_val and norm_val in norm_full:
        return "matched"

    if kind == "amount":
        norm_digits_val = re.sub(r"\D", "", normalize_text_for_guard(value))
        if norm_digits_val:
            for tok in extract_critical_tokens(full_text):
                if norm_digits_val == re.sub(r"\D", "", normalize_text_for_guard(tok)):
                    return "matched"
    elif kind == "date":
        for tok in extract_critical_tokens(full_text):
            if norm_val and norm_val in normalize_text_for_evidence(tok):
                return "matched"
    return "check_original"


def process_places(
    raw_places: List[Any],
    pdf_pages_text: Optional[List[str]],
) -> List[dict]:
    seen = set()
    results = []
    for p in (raw_places or []):
        addr = getattr(p, "address", "") or (p.get("address", "") if isinstance(p, dict) else "")
        lbl = getattr(p, "label", "") or (p.get("label", "") if isinstance(p, dict) else "")
        q = getattr(p, "quote", "") or (p.get("quote", "") if isinstance(p, dict) else "")
        pg = getattr(p, "page", 1) or (p.get("page", 1) if isinstance(p, dict) else 1)
        norm_key = collapse_whitespace(addr).lower()
        if not norm_key or norm_key in seen:
            continue
        seen.add(norm_key)
        ev = verify_place_evidence(addr, q, pdf_pages_text)
        results.append({
            "label": lbl,
            "address": addr,
            "quote": q,
            "page": pg,
            "evidence": ev,
        })
        if len(results) >= 5:
            break
    return results


def process_contacts(
    raw_contacts: List[Any],
    pdf_pages_text: Optional[List[str]],
) -> List[dict]:
    seen = set()
    results = []
    for c in (raw_contacts or []):
        val = getattr(c, "value", "") or (c.get("value", "") if isinstance(c, dict) else "")
        lbl = getattr(c, "label", "") or (c.get("label", "") if isinstance(c, dict) else "")
        q = getattr(c, "quote", "") or (c.get("quote", "") if isinstance(c, dict) else "")
        pg = getattr(c, "page", 1) or (c.get("page", 1) if isinstance(c, dict) else 1)
        if not is_valid_contact_value(val):
            continue
        norm_key = re.sub(r"\D", "", normalize_digits(val)) if not validate_email(val) else val.strip().lower()
        if not norm_key or norm_key in seen:
            continue
        seen.add(norm_key)
        ev = verify_contact_evidence(val, q, pdf_pages_text)
        results.append({
            "label": lbl,
            "value": val.strip(),
            "quote": q,
            "page": pg,
            "evidence": ev,
        })
        if len(results) >= 6:
            break
    return results


def inspect_and_decrypt_pdf(pdf_bytes: bytes, password: Optional[str] = None) -> bytes:
    """
    Checks if a PDF is password protected.
    - If not encrypted, returns original bytes.
    - If encrypted, first attempts decryption with an empty password.
    - If still encrypted and password provided, attempts decryption with password.
    - If still encrypted:
        - If password was not provided or empty -> raises PDFPasswordRequiredError
        - If password was provided -> raises PDFPasswordWrongError
    - Decrypts in memory using PdfWriter and returns decrypted bytes.
    - NEVER logs passwords or password lengths.
    """
    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    except Exception:
        return pdf_bytes

    if not getattr(reader, "is_encrypted", False):
        return pdf_bytes

    decrypted = False
    try:
        res = reader.decrypt("")
        if res != pypdf.PasswordType.NOT_DECRYPTED:
            decrypted = True
    except Exception:
        pass

    if not decrypted and password:
        try:
            res = reader.decrypt(password)
            if res != pypdf.PasswordType.NOT_DECRYPTED:
                decrypted = True
        except Exception:
            pass

    if not decrypted:
        if not password:
            raise PDFPasswordRequiredError()
        else:
            raise PDFPasswordWrongError()

    writer = pypdf.PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    out_buf = io.BytesIO()
    writer.write(out_buf)
    return out_buf.getvalue()
