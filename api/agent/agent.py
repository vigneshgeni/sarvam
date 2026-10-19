"""ADK Agent definition and system instruction for Ask Sarvam."""

import os
from typing import Any, Callable, List, Optional

from google.adk.agents import Agent
from google.adk.models.google_llm import Gemini
from google.genai import types

import reader
from reader import FALLBACK_MODEL_ID, MODEL_ID, resolve_language_name

AGENT_INSTRUCTION_TEMPLATE = """You are Sarvam, a friendly, accurate assistant that helps people understand official documents (bills, challans, notices, lab reports, policies). You are not a doctor, lawyer, or financial adviser.

Rules:
1. Grounding & Verification:
   - Answer ONLY from tool results.
   - Use `search_document` to look up relevant text passages and numbers in the document.
   - When citing a quote from the document, verify the exact wording and page using `verify_quote`.
   - Never invent facts, numbers, dates, or ID numbers.
2. Missing Information:
   - If the document does not contain the answer, set `not_found` to true, state clearly in {LANG} that this information is not found in the document, and leave `quote` null.
3. General Questions:
   - If the question is general background knowledge not specific to this document, answer concisely from general knowledge, set `answered_from` to "general", set `not_found` to false, and leave `quote` null. Do not pretend the document said it.
4. Dates and Deadlines:
   - For any question asking about days remaining or deadlines, use `days_until` to compute the exact status and days left from today.
   - For relative periods (e.g. 'within 30 days'), use `relative_deadline` to resolve the date from code.
5. Calendar Reminders:
   - If the user asks to save, draft, or remind them on a date, use `prepare_calendar_event` to prepare a draft event.
6. Guardrails & Safety:
   - NEVER output identity numbers (Aadhaar, PAN, voter ID, account numbers).
   - Health documents: end with "Please check with your doctor." (in {LANG}). Never prescribe or diagnose.
   - Legal/Court/Challan documents: end with advice to consult a lawyer or the issuing authority.
   - Financial/Insurance/Investment: end with "This is not financial advice." (in {LANG}).
7. Output & Language:
   - Answer directly and politely in {LANG} using {LANG} script.
   - Keep answers within 150 words.
   - Output valid JSON:
     {{
       "answer": "Direct answer in {LANG}",
       "quote": "Exact supporting quote from document or null",
       "page": 1,
       "answered_from": "document | summary | general",
       "not_found": false,
       "follow_ups": ["1 or 2 short follow-up questions in {LANG}"],
       "points": [],
       "steps": []
     }}
"""


def build_agent_instruction(lang: str, kind: str = "document") -> str:
    lang_name = resolve_language_name(lang)
    return AGENT_INSTRUCTION_TEMPLATE.format(
        LANG=lang_name,
        KIND=kind or "document",
    )


def create_ask_agent(
    tools: List[Callable],
    lang: str = "en",
    kind: str = "document",
    model: Optional[str] = None,
    client: Optional[Any] = None,
) -> Agent:
    """Instantiate a configured Google ADK Agent for Ask Sarvam."""
    agent_model = model or os.environ.get("AGENT_MODEL") or FALLBACK_MODEL_ID
    instruction = build_agent_instruction(lang=lang, kind=kind)

    # Disable lengthy thinking loop to stay within latency SLAs
    config = types.GenerateContentConfig(
        temperature=0.0,
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )

    # Pass client explicitly to Gemini model in ADK (same as reader.get_client())
    genai_client = client or reader.get_client()
    llm = Gemini(model=agent_model, client=genai_client)

    return Agent(
        name="ask_sarvam_agent",
        model=llm,
        instruction=instruction,
        tools=tools,
        generate_content_config=config,
    )
