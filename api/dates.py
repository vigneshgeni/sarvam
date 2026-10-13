import datetime
import math
import re
import unicodedata
from typing import List, Optional, Tuple
from zoneinfo import ZoneInfo

MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


def parse_date(date_str: Optional[str]) -> Optional[datetime.date]:
    if not date_str:
        return None
    s = date_str.strip()

    # ISO YYYY-MM-DD
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if m:
        try:
            return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass

    # DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
    m = re.match(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$", s)
    if m:
        try:
            return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass

    # DD Month YYYY (e.g. 01 October 2026, 1 Oct 2026)
    m = re.match(r"^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$", s)
    if m:
        month_str = m.group(2).lower()
        if month_str in MONTH_MAP:
            try:
                return datetime.date(int(m.group(3)), MONTH_MAP[month_str], int(m.group(1)))
            except ValueError:
                pass

    # Month DD, YYYY
    m = re.match(r"^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$", s)
    if m:
        month_str = m.group(1).lower()
        if month_str in MONTH_MAP:
            try:
                return datetime.date(int(m.group(3)), MONTH_MAP[month_str], int(m.group(2)))
            except ValueError:
                pass

    return None


def format_date_human(d: datetime.date) -> str:
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return f"{d.day} {month_names[d.month - 1]} {d.year}"


def _ascii_decimal_digits(text: str) -> str:
    mapped = []
    for ch in text:
        if ch.isdecimal():
            try:
                mapped.append(str(unicodedata.decimal(ch)))
                continue
            except (TypeError, ValueError):
                pass
        mapped.append(ch)
    return "".join(mapped)


def ist_today(today: Optional[datetime.date] = None) -> datetime.date:
    if today is not None:
        return today
    return datetime.datetime.now(ZoneInfo("Asia/Kolkata")).date()


def infer_relative_deadline_from_quote(
    quote: Optional[str],
    anchor_date_str: Optional[str],
    today: Optional[datetime.date] = None,
) -> Optional[Tuple[datetime.date, int, bool]]:
    """
    When the model left deadline_days empty, read a relative rule from the
    document's own words. English "within N hours/days" only.
    Hours become whole days, rounded up. Digits may be in any script.
    Returns (due_date, deadline_days, is_past) or None.
    No anchor date, no rule, or a phrase that is not relative -> None.
    is_past uses today's date in IST so every client agrees.
    """
    if not quote or not str(quote).strip() or not anchor_date_str:
        return None
    anchor = parse_date(anchor_date_str)
    if anchor is None:
        return None
    normalized = _ascii_decimal_digits(quote)
    match = re.search(r"\bwithin\s+(\d+)\s*(hours?|days?)\b", normalized, re.IGNORECASE)
    if not match:
        return None
    count = int(match.group(1))
    if count <= 0:
        return None
    unit = match.group(2).lower()
    if unit.startswith("hour"):
        days = math.ceil(count / 24)
    else:
        days = count
    if days <= 0:
        return None
    due = anchor + datetime.timedelta(days=days)
    past = due < ist_today(today)
    return due, days, past


def compute_relative_deadline(
    deadline_days: Optional[int],
    letter_date_str: Optional[str],
    deadline_anchor: Optional[str] = "letter_date",
) -> Optional[datetime.date]:
    if deadline_days is None or not letter_date_str:
        return None
    if deadline_anchor and deadline_anchor != "letter_date":
        return None
    anchor = parse_date(letter_date_str)
    if not anchor:
        return None
    return anchor + datetime.timedelta(days=deadline_days)


def evaluate_date_status(
    due_date_str: Optional[str],
    is_calculated: bool = False,
    today: Optional[datetime.date] = None,
    is_recurring: bool = False,
) -> str:
    if is_recurring:
        return "recurring"
    if is_calculated:
        return "calculated"
    if not due_date_str:
        return "none"
    d = parse_date(due_date_str)
    if not d:
        return "none"
    if today is None:
        today = datetime.date.today()
    if d < today:
        return "passed"
    return "upcoming"


def detect_date_conflicts(text: str) -> List[str]:
    conflicts: List[str] = []
    payment_dates: List[Tuple[datetime.date, str]] = []

    date_regex = r"(\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b)"

    # Look for dates that have payment context specifically
    for m in re.finditer(date_regex, text, re.IGNORECASE):
        ctx = text[max(0, m.start() - 60) : min(len(text), m.end() + 60)]
        if re.search(r"\b(pay|payment|last\s+date)\b", ctx, re.IGNORECASE):
            d_str = m.group(0)
            parsed = parse_date(d_str)
            if parsed and parsed not in [d[0] for d in payment_dates]:
                payment_dates.append((parsed, d_str))

    if len(payment_dates) >= 2:
        payment_dates.sort(key=lambda x: x[0])
        formatted = [format_date_human(d[0]) for d in payment_dates]
        dates_desc = " and ".join(formatted)
        conflicts.append(
            f"This document gives two different dates for payment ({dates_desc}) — check with the office."
        )

    return conflicts
