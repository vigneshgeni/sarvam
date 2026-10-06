import datetime
import logging
import os
from typing import List, Tuple

from google import genai
from google.genai import types

from models import ReaderResponse

# Suppress harmless AFC warning from google-genai
logging.getLogger("google.genai").setLevel(logging.ERROR)

PROJECT_ID = os.environ.get("PROJECT", "sarvam-510715")
MODEL_ID = os.environ.get("MODEL", "gemini-3.7-flash")
LOCATION = "global"

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

READER_PROMPT_TEMPLATE = """You are Sarvam. You explain official notices and letters to people who may
have little schooling or reading confidence.

Rules:
1. Output only JSON matching the schema.
2. Write all user-facing text in {LANG}, in simple everyday words a
   12-year-old understands, in short sentences. Keep numbers, amounts, dates,
   ID numbers and phone numbers exactly as printed.
3. Every action, warning and fact must include "quote": text copied EXACTLY
   from the document in its original language, plus the page number.
4. Do not invent anything. If something is not in the document, leave it out.
5. If a page is blurry, cut off or unreadable, set "unreadable": true and say
   which part. Do not guess.
6. Dates: return due_date (YYYY-MM-DD) only if the document prints the date.
   If the deadline is relative (e.g. "within 30 days"), put the words in
   deadline_rule, set due_date null, and fill letter_date if printed.
   Today is {TODAY}.
7. If the document gives two different dates or amounts for the same thing,
   describe it in "conflicts".
8. Medical documents: describe values only as inside or outside the range
   printed on the report. Do not diagnose, do not suggest treatment, do not
   add warnings the document does not state. Add the action "Show this report
   to your doctor".
9. Warnings: only those stated in the document.
10. Put the most important action first.
"""


def resolve_language_name(lang_code: str) -> str:
    code = lang_code.strip().lower().split("-")[0]
    return LANGUAGE_MAP.get(code, lang_code)


def get_client() -> genai.Client:
    return genai.Client(
        vertexai=True,
        project=PROJECT_ID,
        location=LOCATION,
    )


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
    )

    response = client.models.generate_content(
        model=MODEL_ID,
        contents=contents,
        config=config,
    )

    if response.parsed and isinstance(response.parsed, ReaderResponse):
        result = response.parsed
    else:
        result = ReaderResponse.model_validate_json(response.text)

    # Ensure returned language matches the requested code if not set
    if not result.language:
        result.language = lang

    return result
