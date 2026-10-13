import calendar
import datetime
import math
import re
import unicodedata
from typing import List, Optional, Sequence, Tuple
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


def _english_number_words() -> dict:
    ones = [
        "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
        "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
        "seventeen", "eighteen", "nineteen",
    ]
    tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
    words = {}
    for n in range(1, 100):
        if n < 20:
            words[ones[n]] = n
            continue
        ten, one = divmod(n, 10)
        if one == 0:
            words[tens[ten]] = n
        else:
            words[f"{tens[ten]}-{ones[one]}"] = n
            words[f"{tens[ten]} {ones[one]}"] = n
    return words


# Whole-word counts used in notices. Digits in any script are handled separately.
_NUMBER_WORDS = {
    **_english_number_words(),
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6,
    "सात": 7, "आठ": 8, "नौ": 9, "दस": 10, "ग्यारह": 11, "बारह": 12, "पंद्रह": 15,
    "बीस": 20, "चौबीस": 24, "तीस": 30, "छत्तीस": 36, "अड़तालीस": 48, "अड़तालीस": 48,
    "साठ": 60, "बहत्तर": 72, "नब्बे": 90,
    "ஒன்று": 1, "ஒரு": 1, "இரண்டு": 2, "மூன்று": 3, "ஏழு": 7, "பத்து": 10,
    "பதினைந்து": 15, "முப்பது": 30, "நாற்பத்தெட்டு": 48,
    "ఒకటి": 1, "రెండు": 2, "ఏడు": 7, "పది": 10, "పదిహేను": 15, "ముప్పై": 30,
    "నలభై ఎనిమిది": 48, "నలభైఎనిమిది": 48,
    "ഒന്ന്": 1, "രണ്ട്": 2, "ഏഴ്": 7, "പത്ത്": 10, "പതിനഞ്ച്": 15, "മുപ്പത്": 30,
    "നാൽപ്പത്തിയെട്ട്": 48, "നാല്പത്തിയെട്ട്": 48,
    "ಒಂದು": 1, "ಎರಡು": 2, "ಏಳು": 7, "ಹತ್ತು": 10, "ಹದಿನೈದು": 15, "ಮೂವತ್ತು": 30,
    "ನಲವತ್ತೆಂಟು": 48,
    "दोन": 2, "दहा": 10, "पंधरा": 15, "अठ्ठेचाळीस": 48,
    "এক": 1, "দুই": 2, "সাত": 7, "দশ": 10, "পনেরো": 15, "ত্রিশ": 30, "আটচল্লিশ": 48,
    "ଏକ": 1, "ଦୁଇ": 2, "ସାତ": 7, "ଦଶ": 10, "ପନ୍ଦର": 15, "ତିରିଶ": 30, "ଅଠଚାଳିଶ": 48,
}
_NUMBER_WORDS = {
    unicodedata.normalize("NFKC", key): value for key, value in _NUMBER_WORDS.items()
}

_UNITS: Tuple[Tuple[str, Tuple[str, ...]], ...] = (
    ("hour", (
        "hours", "hour",
        "घंटों", "घंटे", "घंटा", "घण्टों", "घण्टे", "घण्टा",
        "மணி நேரத்திற்குள்", "மணி நேரத்துக்குள்", "மணிநேரத்திற்குள்", "மணி நேரம்",
        "மணிக்குள்", "மணித்தியாலம்", "மணி",
        "గంటలలోపు", "గంటల్లో", "గంటలు", "గంట",
        "മണിക്കൂറിനുള്ളിൽ", "മണിക്കൂർ",
        "ಗಂಟೆಗಳಲ್ಲಿ", "ಗಂಟೆಗಳ", "ಗಂಟೆ",
        "तासांच्या", "तासांचे", "तासात", "तास",
        "ঘণ্টার", "ঘণ্টা", "ঘন্টার", "ঘন্টা",
        "ଘଣ୍ଟା",
    )),
    ("day", (
        "days", "day",
        "दिनों", "दिन",
        "நாட்களுக்குள்", "நாட்கள்", "நாளில்", "நாள்",
        "రోజులలోపు", "రోజులు", "రోజు",
        "ദിവസങ്ങൾ", "ദിവസത്തിനുള്ളിൽ", "ദിവസം",
        "ದಿನಗಳಲ್ಲಿ", "ದಿನಗಳು", "ದಿನ",
        "दिवसांच्या", "दिवसात", "दिवस",
        "দিনের", "দিন",
        "ଦିନରେ", "ଦିନ",
    )),
    ("week", (
        "weeks", "week",
        "हफ्तों", "हफ्ते", "हफ्ता", "सप्ताह",
        "வாரங்களுக்குள்", "வாரங்கள்", "வாரத்தில்", "வாரம்",
        "వారాల్లోపు", "వారాలు", "వారం",
        "ആഴ്ചയ്ക്കുള്ളിൽ", "ആഴ്ച",
        "ವಾರಗಳಲ್ಲಿ", "ವಾರಗಳು", "ವಾರ",
        "आठवड्यांच्या", "आठवड्यात", "आठवडे", "आठवडा",
        "সপ্তাহের", "সপ্তাহ",
        "ସପ୍ତାହ",
    )),
    ("month", (
        "months", "month",
        "महीनों", "महीने", "महीना", "माह",
        "மாதங்களுக்குள்", "மாதங்கள்", "மாதத்தில்", "மாதம்",
        "నెలల్లోపు", "నెలలు", "నెల",
        "മാസത്തിനുള്ളിൽ", "മാസം",
        "ತಿಂಗಳೊಳಗೆ", "ತಿಂಗಳು",
        "महिन्यांच्या", "महिन्यात", "महिने", "महिना",
        "মাসের", "মাস",
        "ମାସ",
    )),
)

_CUES = (
    "within",
    "के भीतर", "के अंदर", "के अन्दर", "भीतर",
    "ற்குள்", "த்துக்குள்", "க்குள்", "இற்குள்",
    "లోపు", "లోపల",
    "ുള്ളിൽ", "ഉള്ളിൽ",
    "ಒಳಗೆ", "ಒಳಗಾಗಿ",
    "च्या आत", "आत",
    "মধ্যে",
    "ମଧ୍ୟରେ", "ଭିତରେ",
)


def _bounded_phrase(phrase: str) -> str:
    return rf"(?<![\w]){re.escape(phrase)}(?![\w])"


def _alternation(phrases: Sequence[str]) -> str:
    ordered = sorted({unicodedata.normalize("NFKC", p) for p in phrases}, key=len, reverse=True)
    return "|".join(_bounded_phrase(p) for p in ordered)


_NUMBER_WORD_RE = re.compile(_alternation(_NUMBER_WORDS.keys()), re.IGNORECASE)

_UNIT_GROUP_RE = re.compile(
    r"(\d+)\s*(?:"
    + "|".join(
        f"(?P<{kind}>{_alternation(tokens)})"
        for kind, tokens in _UNITS
    )
    + r")",
    re.IGNORECASE,
)

_UNIT_ONLY_RE = re.compile(
    "|".join(_alternation(tokens) for _kind, tokens in _UNITS),
    re.IGNORECASE,
)

_CUE_RE = re.compile(_alternation(_CUES), re.IGNORECASE)


def _span_gap(start_a: int, end_a: int, start_b: int, end_b: int) -> int:
    if end_a < start_b:
        return start_b - end_a
    if end_b < start_a:
        return start_a - end_b
    return 0


def _prepare_relative_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    normalized = _ascii_decimal_digits(normalized)

    def repl(match: re.Match) -> str:
        raw = match.group(0)
        key = raw if raw in _NUMBER_WORDS else raw.lower()
        folded = unicodedata.normalize("NFKC", key)
        value = _NUMBER_WORDS.get(key, _NUMBER_WORDS.get(folded))
        return str(value if value is not None else raw)

    return _NUMBER_WORD_RE.sub(repl, normalized)


def _token_contains_cue(token: str) -> bool:
    return any(cue in token for cue in _CUES)


def _has_relative_cue(prepared: str) -> bool:
    if _CUE_RE.search(prepared):
        return True
    for match in _UNIT_ONLY_RE.finditer(prepared):
        if _token_contains_cue(match.group(0)):
            return True
    return False


def _parse_relative_span(text: str) -> Optional[Tuple[int, str]]:
    """Return (count, hour|day|week|month) when a within-cue sits next to a count and a unit."""
    prepared = _prepare_relative_text(text)
    cues = list(_CUE_RE.finditer(prepared))
    best: Optional[Tuple[int, str]] = None
    best_gap: Optional[int] = None
    for match in _UNIT_GROUP_RE.finditer(prepared):
        kind = next(name for name in ("hour", "day", "week", "month") if match.group(name))
        token = match.group(kind)
        if _token_contains_cue(token):
            gap = 0
        elif cues:
            gap = min(
                _span_gap(match.start(), match.end(), cue.start(), cue.end())
                for cue in cues
            )
            if gap > 24:
                continue
        else:
            continue
        count = int(match.group(1))
        if count <= 0:
            continue
        if best_gap is None or gap < best_gap:
            best = (count, kind)
            best_gap = gap
    return best


def quote_has_unparsed_relative_deadline(text: Optional[str]) -> bool:
    """True when the words look like a relative deadline but no count and unit could be read."""
    if not text or not str(text).strip():
        return False
    if _parse_relative_span(text) is not None:
        return False
    prepared = _prepare_relative_text(text)
    if not _has_relative_cue(prepared) or not _UNIT_ONLY_RE.search(prepared):
        return False
    return True


def _english_relative(text: str) -> bool:
    return _parse_relative_span(text) is not None and re.search(r"(?<![\w])within(?![\w])", text, re.IGNORECASE) is not None


def _candidate_texts(quote: Optional[str], text: Optional[str]) -> List[str]:
    quote_s = (quote or "").strip()
    text_s = (text or "").strip()
    ordered: List[str] = []

    def add(value: str) -> None:
        if value and value not in ordered:
            ordered.append(value)

    # Keep an English source sentence ahead of a translated quote.
    if text_s and quote_s and _english_relative(text_s) and not _english_relative(quote_s):
        add(text_s)
        add(quote_s)
    else:
        add(quote_s)
        if _has_relative_cue(_prepare_relative_text(quote_s)) if quote_s else False:
            add(text_s)
        elif not quote_s:
            add(text_s)
    return ordered


def _add_months(anchor: datetime.date, months: int) -> datetime.date:
    month_index = anchor.month - 1 + months
    year = anchor.year + month_index // 12
    month = month_index % 12 + 1
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return datetime.date(year, month, day)


def infer_relative_deadline_from_quote(
    quote: Optional[str],
    anchor_date_str: Optional[str],
    today: Optional[datetime.date] = None,
) -> Optional[Tuple[datetime.date, int, bool]]:
    """
    Read a relative deadline from the document's own words, in any of the
    nine UI languages. Hours, days, weeks, and months count from the anchor
    date, never from today. Hours become whole days, rounded up.
    Digits may be in any script, and common number words are accepted.
    Returns (due_date, deadline_days, is_past) or None.
    No anchor date, no rule, or a phrase that is not relative -> None.
    is_past uses today's date in IST so every client agrees.
    """
    if not quote or not str(quote).strip() or not anchor_date_str:
        return None
    anchor = parse_date(anchor_date_str)
    if anchor is None:
        return None
    parsed = _parse_relative_span(quote)
    if parsed is None:
        return None
    count, kind = parsed
    if kind == "hour":
        days = math.ceil(count / 24)
        due = anchor + datetime.timedelta(days=days)
    elif kind == "week":
        days = count * 7
        due = anchor + datetime.timedelta(days=days)
    elif kind == "month":
        due = _add_months(anchor, count)
        days = (due - anchor).days
    else:
        days = count
        due = anchor + datetime.timedelta(days=days)
    if days <= 0:
        return None
    past = due < ist_today(today)
    return due, days, past


def resolve_relative_deadline(
    quote: Optional[str],
    text: Optional[str],
    anchor_date_str: Optional[str],
    today: Optional[datetime.date] = None,
) -> Tuple[str, Optional[datetime.date], Optional[int]]:
    """
    Decide what the explain pipeline should do with one action.

    "computed": the code read a relative deadline and counted it from the
    document anchor. The model's date must be replaced.
    "drop": the words are a relative deadline but the code could not compute
    a date (no anchor, or a pattern it cannot read). Do not keep the model's
    date as Calculated.
    "skip": this action is not a relative deadline. Leave Matched dates alone.
    """
    saw_relative = False
    for source in _candidate_texts(quote, text):
        if _parse_relative_span(source) is None:
            if quote_has_unparsed_relative_deadline(source):
                saw_relative = True
            continue
        saw_relative = True
        inferred = infer_relative_deadline_from_quote(source, anchor_date_str, today=today)
        if inferred is not None:
            return "computed", inferred[0], inferred[1]
    if saw_relative:
        return "drop", None, None
    return "skip", None, None


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
