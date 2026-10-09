import re
from typing import List, Optional, Tuple
from models import MedicineInfo, ReaderMedicine

VALID_SLOTS = ["morning", "afternoon", "evening", "night", "bedtime", "as_needed"]
VALID_FOOD_TIMINGS = ["before_food", "after_food"]

def decode_medicine_frequency(
    raw_freq: str,
    raw_food: Optional[str] = None,
    raw_duration: Optional[int] = None,
) -> Tuple[str, List[str], Optional[str], Optional[int], bool]:
    """
    Decodes medicine frequency and schedule instructions entirely in code.
    Returns: (frequency_code, slots, food_timing, duration_days, decoded)
    """
    if not raw_freq:
        return ("", [], None, raw_duration, False)

    freq_clean = raw_freq.strip()
    upper = freq_clean.upper()
    slots: List[str] = []
    frequency_code = freq_clean
    decoded = False

    # Check food timing from raw text or raw_food
    food_timing: Optional[str] = None
    if raw_food in VALID_FOOD_TIMINGS:
        food_timing = raw_food
    else:
        if re.search(r"\b(before\s+(food|meals?)|ac|empty\s+stomach)\b", freq_clean, re.IGNORECASE):
            food_timing = "before_food"
        elif re.search(r"\b(after\s+(food|meals?)|pc)\b", freq_clean, re.IGNORECASE):
            food_timing = "after_food"

    # Check duration from raw text or raw_duration
    duration_days = raw_duration
    dur_match = re.search(r"(?:x\s*|for\s*)(\d+)\s*(days?|d\b|weeks?|w\b|months?|m\b)", freq_clean, re.IGNORECASE)
    if dur_match:
        val = int(dur_match.group(1))
        unit = dur_match.group(2).lower()
        if unit.startswith("w"):
            duration_days = val * 7
        elif unit.startswith("m"):
            duration_days = val * 30
        else:
            duration_days = val

    # 1. Number pattern a-b-c(-d), e.g. 1-0-1, 1-1-1, 0-0-1, 1-1-1-1
    pattern_match = re.search(r"\b(\d+)\s*[-/]\s*(\d+)\s*[-/]\s*(\d+)(?:\s*[-/]\s*(\d+))?\b", freq_clean)
    if pattern_match:
        m, a, e, n = pattern_match.group(1), pattern_match.group(2), pattern_match.group(3), pattern_match.group(4)
        frequency_code = f"{m}-{a}-{e}" if n is None else f"{m}-{a}-{e}-{n}"
        decoded = True

        if n is not None:
            # 4 slots: morning, afternoon, evening, night
            if int(m) > 0:
                slots.append("morning")
            if int(a) > 0:
                slots.append("afternoon")
            if int(e) > 0:
                slots.append("evening")
            if int(n) > 0:
                slots.append("night")
        else:
            # 3 slots: morning, afternoon, night
            if int(m) > 0:
                slots.append("morning")
            if int(a) > 0:
                slots.append("afternoon")
            if int(e) > 0:
                slots.append("night")
        return (frequency_code, slots, food_timing, duration_days, decoded)

    # 2. Latin acronyms and common text patterns
    # SOS / PRN
    if re.search(r"\b(SOS|PRN|AS\s+NEEDED|WHEN\s+REQUIRED)\b", upper):
        frequency_code = "SOS"
        slots = []  # SOS/PRN: as_needed (no slots)
        decoded = True
    # HS
    elif re.search(r"\b(HS|BEDTIME|AT\s+BEDTIME|AT\s+NIGHT)\b", upper):
        frequency_code = "HS"
        slots = ["bedtime"]
        decoded = True
    # QID
    elif re.search(r"\b(QID|FOUR\s+TIMES\s+A\s+DAY|4\s+TIMES\s+A\s+DAY)\b", upper):
        frequency_code = "QID"
        slots = ["morning", "afternoon", "evening", "night"]
        decoded = True
    # TDS / TID
    elif re.search(r"\b(TDS|TID|THRICE\s+DAILY|THREE\s+TIMES\s+A\s+DAY|3\s+TIMES\s+A\s+DAY)\b", upper):
        frequency_code = "TDS"
        slots = ["morning", "afternoon", "night"]
        decoded = True
    # BD / BID
    elif re.search(r"\b(BD|BID|TWICE\s+DAILY|TWICE\s+A\s+DAY|2\s+TIMES\s+A\s+DAY)\b", upper):
        frequency_code = "BD"
        slots = ["morning", "night"]
        decoded = True
    # OD / QD
    elif re.search(r"\b(OD|QD|ONCE\s+DAILY|ONCE\s+A\s+DAY|1\s+TIME\s+A\s+DAY)\b", upper):
        frequency_code = "OD"
        slots = ["morning"]
        decoded = True
    else:
        # Unrecognised
        frequency_code = freq_clean
        slots = []
        decoded = False

    return (frequency_code, slots, food_timing, duration_days, decoded)


def process_medicines(
    raw_medicines: List[ReaderMedicine],
    pdf_pages_text: Optional[List[str]],
    document_type: str,
    source_kind: str,
) -> List[MedicineInfo]:
    """
    Processes reader medicines into contract MedicineInfo objects.
    - Only populated when document_type == 'medical'
    - Photos are always evidence='check_original'
    - Max 12 medicines
    - Decoded via decode_medicine_frequency
    """
    if document_type != "medical" or not raw_medicines:
        return []

    results: List[MedicineInfo] = []
    for med in raw_medicines[:12]:
        name = med.name.strip()
        if not name:
            continue

        freq_code, slots, food_timing, duration_days, decoded = decode_medicine_frequency(
            med.frequency_raw,
            med.food_timing,
            med.duration_days,
        )

        # Evidence verification: photos are always check_original
        evidence = "check_original"
        if source_kind != "photo" and pdf_pages_text:
            full_text = " ".join(pdf_pages_text)
            if med.quote and med.quote.strip() in full_text:
                evidence = "matched"
            elif name.lower() in full_text.lower():
                evidence = "matched"

        results.append(
            MedicineInfo(
                name=name,
                strength_text=med.strength_text.strip() if med.strength_text else None,
                frequency_raw=med.frequency_raw.strip(),
                frequency_code=freq_code,
                slots=slots,
                food_timing=food_timing,
                duration_days=duration_days,
                instruction_text=med.instruction_text.strip(),
                decoded=decoded,
                quote=med.quote.strip() if med.quote else "",
                page=med.page or 1,
                evidence=evidence,
            )
        )

    return results
