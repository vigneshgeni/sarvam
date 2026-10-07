import datetime
import logging
import os
import time
from typing import Any, List, Tuple

from google import genai
from google.genai import errors, types

from models import ReaderResponse, TranslatePayload

# Suppress harmless AFC warning from google-genai
logging.getLogger("google.genai").setLevel(logging.ERROR)
logger = logging.getLogger("sarvam-reader")

PROJECT_ID = os.environ.get("PROJECT", "sarvam-510715")
MODEL_ID = os.environ.get("MODEL", "gemini-3.7-flash")
LOCATION = "global"

# Thinking budget per call type (0 = disabled).
# Translate stays off (0). Explain stays as is (0), but can be easily raised to a low level (e.g. 512 or 1024).
EXPLAIN_THINKING: int = int(os.environ.get("EXPLAIN_THINKING", 0))
TRANSLATE_THINKING: int = 0

LANGUAGE_MAP = {
    "en": "English",
    "ta": "Tamil",
    "hi": "Hindi",
    "kn": "Kannada",
    "ml": "Malayalam",
    "te": "Telugu",
    "bn": "Bengali",
    "mr": "Marathi",
    "gu": "Gujarati",
    "pa": "Punjabi",
    "or": "Odia",
    "ur": "Urdu",
}

READER_PROMPT_TEMPLATE = """You are Sarvam. You explain official notices, letters, and reports to people who may
have little schooling or reading confidence.

Rules:
1. Output only JSON matching the schema.
2. Write all user-facing text entirely in {LANG}, in simple everyday words a
   12-year-old understands, in short sentences.
   - Month names, units, and labels must be strictly in {LANG} (no English words mixed in).
   - An English term in brackets is permitted ONLY for official names (e.g. scheme names, form names like 'வாழ்வுச் சான்றிதழ் (Life Certificate)').
   - Keep numbers, amounts, dates, ID numbers and phone numbers exactly as printed.
   - PROTECTED TERMS & NAMES: Person names, patient/doctor names, hospital/lab/company names, addresses, place names, and ID/policy/account/reference numbers must be copied EXACTLY as printed, in the original script. Latin stays Latin (e.g. 'Devayalini M' stays 'Devayalini M', never transliterate into Tamil, Hindi, or other scripts). A name already in Tamil script stays in Tamil script. Never transliterate or guess spelling. Populate `protected_terms` with these items exactly as printed.
3. Every action, warning and fact must include "quote": text copied EXACTLY
   from the document in its original language, plus the page number.
4. Do not invent anything. If something is not in the document, leave it out.
   - report_title: Display title printed on the report/notice, or null if not clearly printed. Never invent.
   - report_date: Display date printed on the report/notice, or null if not clearly printed. Never invent.
5. If a page is blurry, cut off or unreadable, set "unreadable": true and say
   which part in "unreadable_reason". Do not guess.
6. Deadlines & Dates:
   - If the deadline is a fixed printed calendar date: return due_date (YYYY-MM-DD), set deadline_days null, deadline_anchor null, deadline_rule null.
   - If the deadline is relative (e.g. "within 30 days of this letter"): set deadline_days to the integer count of days (e.g. 30), set deadline_anchor to "letter_date", set deadline_rule to display text in {LANG}, and set due_date null.
   - Recurring obligations: If the document has both a schedule rule (e.g. premium due on the 31st of every month) and a receipt "next due" date, use the schedule rule for the action. Set "recurrence" to the schedule rule display text in {LANG} (e.g. '31st of every month').
   - letter_date: return YYYY-MM-DD if printed, else null.
   Today is {TODAY}.
7. If the document gives two different dates or amounts for the same thing,
   describe it in "conflicts".
8. Medical and lab reports: quote the report's own printed values, reference ranges and flags verbatim.
   Never say in our own words whether a value is normal or abnormal, and never name a diagnosis.
   Never suggest treatment or add warnings that the document does not state.
   Add the action "Show this report to your doctor".
9. Warnings: only those stated in the document itself.
10. Put the most important action first.
"""

TRANSLATE_PROMPT_TEMPLATE = """You are Sarvam. Translate user-facing text from an official document into {LANG}.

Rules:
1. Output only JSON matching the schema.
2. Translate all user-facing text into {LANG}, in simple everyday words a 12-year-old understands, in short sentences.
3. Month names, units and labels must be strictly in {LANG} (no English words mixed in).
4. Include an English term in brackets ONLY for official names (scheme names, form names).
5. CRITICAL NUMBER GUARD: Always keep all numbers, digits, amounts, dates, ID numbers and phone numbers in Western digits (0-9) exactly as printed in the original text (e.g. use 31,200 not ௩௧,௨௦௦ or ३१,२००; use 2026 not ௨௦௨௬). Do not drop, modify, convert, or translate any number, date, amount, or phone number.
6. CRITICAL PROTECTED TERMS GUARD: Person names, patient/doctor names, hospital/lab/company names, addresses, place names, and ID/policy/account/reference numbers (including any terms listed in protected_terms) must NEVER be translated or transliterated. They must be copied EXACTLY as printed in the original script. Latin stays Latin (e.g. 'Devayalini M' must remain 'Devayalini M', never transliterated into Tamil or Hindi script). A name already in Tamil script stays in Tamil script. Never guess transliterations. Every protected term present in the original text must appear verbatim in your translation.
7. Translate title, report_title, summary, action text, deadline_rule, recurrence, warning text, fact text, conflicts, and unreadable_reason.

User-facing text to translate:
{PAYLOAD_JSON}
"""


def resolve_language_name(lang_code: str) -> str:
    code = lang_code.strip().lower().split("-")[0]
    return LANGUAGE_MAP.get(code, lang_code)


def get_client() -> genai.Client:
    return genai.Client(
        vertexai=True,
        project=PROJECT_ID,
        location=LOCATION,
        http_options=types.HttpOptions(timeout=100_000),
    )


def call_gemini_with_retry(
    client: genai.Client,
    model: str,
    contents: list,
    config: types.GenerateContentConfig,
    endpoint: str = "unknown",
    max_retries: int = 1,
) -> Any:
    start_time = time.time()
    for attempt in range(max_retries + 1):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            elapsed = time.time() - start_time
            usage = getattr(resp, "usage_metadata", None)
            input_tokens = (getattr(usage, "prompt_token_count", 0) or 0) if usage else 0
            output_tokens = (getattr(usage, "candidates_token_count", 0) or 0) if usage else 0
            thinking_tokens = (getattr(usage, "thoughts_token_count", 0) or 0) if usage else 0

            logger.info(
                "gemini_call: endpoint=%s, input_tokens=%d, output_tokens=%d, thinking_tokens=%d, attempts=%d, seconds=%.2f, status=200",
                endpoint,
                input_tokens,
                output_tokens,
                thinking_tokens,
                attempt + 1,
                elapsed,
            )
            return resp
        except (errors.ClientError, errors.ServerError) as e:
            code = getattr(e, "code", None) or 500
            elapsed = time.time() - start_time
            if code in (429, 503) and attempt < max_retries:
                logger.warning(
                    "gemini_retry: endpoint=%s, attempt=%d, status=%s, seconds=%.2f",
                    endpoint,
                    attempt + 1,
                    code,
                    elapsed,
                )
                time.sleep(2.0)
                continue
            logger.info(
                "gemini_call: endpoint=%s, input_tokens=0, output_tokens=0, thinking_tokens=0, attempts=%d, seconds=%.2f, status=%d",
                endpoint,
                attempt + 1,
                elapsed,
                code,
            )
            raise
        except Exception as e:
            elapsed = time.time() - start_time
            logger.info(
                "gemini_call: endpoint=%s, input_tokens=0, output_tokens=0, thinking_tokens=0, attempts=%d, seconds=%.2f, status=500",
                endpoint,
                attempt + 1,
                elapsed,
            )
            raise


def read_document(files_data: List[Tuple[bytes, str]], lang: str) -> ReaderResponse:
    lang_name = resolve_language_name(lang)
    today_str = datetime.date.today().isoformat()
    prompt = READER_PROMPT_TEMPLATE.format(LANG=lang_name, TODAY=today_str)

    client = get_client()

    contents = []
    for data, mime_type in files_data:
        part = types.Part.from_bytes(data=data, mime_type=mime_type)
        contents.append(part)
    contents.append(prompt)

    config = types.GenerateContentConfig(
        temperature=0.2,
        response_mime_type="application/json",
        response_schema=ReaderResponse,
        http_options=types.HttpOptions(timeout=100_000),
        thinking_config=types.ThinkingConfig(thinking_budget=EXPLAIN_THINKING),
    )

    response = call_gemini_with_retry(
        client=client,
        model=MODEL_ID,
        contents=contents,
        config=config,
        endpoint="explain",
    )

    if response.parsed and isinstance(response.parsed, ReaderResponse):
        result = response.parsed
    else:
        result = ReaderResponse.model_validate_json(response.text)

    # Ensure returned language matches the requested code if not set
    if not result.language:
        result.language = lang

    return result


def translate_result_text(payload: TranslatePayload, lang: str) -> TranslatePayload:
    lang_name = resolve_language_name(lang)
    payload_json = payload.model_dump_json(exclude_none=True)
    prompt = TRANSLATE_PROMPT_TEMPLATE.format(LANG=lang_name, PAYLOAD_JSON=payload_json)

    client = get_client()

    config = types.GenerateContentConfig(
        temperature=0.0,
        response_mime_type="application/json",
        response_schema=TranslatePayload,
        http_options=types.HttpOptions(timeout=60_000),
        thinking_config=types.ThinkingConfig(thinking_budget=TRANSLATE_THINKING),
    )

    response = call_gemini_with_retry(
        client=client,
        model=MODEL_ID,
        contents=[prompt],
        config=config,
        endpoint="translate",
    )

    if response.parsed and isinstance(response.parsed, TranslatePayload):
        return response.parsed
    return TranslatePayload.model_validate_json(response.text)
