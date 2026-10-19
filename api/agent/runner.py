"""Runner for Ask Sarvam Agent.

Enforces:
- At most 4 tool steps
- 30-second budget (with timeout fallback)
- Mapping to AskResponse schema
- Validation via guard_ask_numbers, verify_evidence, check_script_guard, and _close_answer
"""

import asyncio
import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from google.adk.runners import InMemoryRunner
from google.genai import types

from agent.agent import create_ask_agent
from agent.tools import DocumentContext, create_agent_tools
import dates
import evidence
from models import AskFactItem, AskResponse
from reader import (
    FALLBACK_MODEL_ID,
    _close_answer,
    extract_digit_sequences,
    guard_ask_numbers,
    last_ask_turns,
    trim_ask_analysis,
)

logger = logging.getLogger("sarvam-agent")

MAX_TOOL_STEPS = 4
AGENT_BUDGET_SEC = 15.0


class AgentAskError(Exception):
    """Raised when agent execution, parsing, or validation fails."""
    pass


def parse_agent_json(raw_text: str) -> dict:
    """Extract and parse JSON object from model output."""
    cleaned = (raw_text or "").strip()
    if not cleaned:
        raise AgentAskError("Empty agent response")

    # Strip markdown code blocks if present
    candidate = cleaned
    if "```json" in candidate:
        match = re.search(r"```json\s*(.*?)\s*```", candidate, re.DOTALL)
        if match:
            candidate = match.group(1).strip()
    elif "```" in candidate:
        match = re.search(r"```\s*(.*?)\s*```", candidate, re.DOTALL)
        if match:
            candidate = match.group(1).strip()

    try:
        data = json.loads(candidate)
        if isinstance(data, dict) and "answer" in data and str(data.get("answer", "")).strip():
            return data
    except Exception:
        pass

    # Regex search for first JSON object
    match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(1))
            if isinstance(data, dict) and "answer" in data and str(data.get("answer", "")).strip():
                return data
        except Exception:
            pass

    # Raise AgentAskError when unparseable or missing answer so fallback triggers
    raise AgentAskError("Agent response could not be parsed as valid JSON with 'answer'")


def validate_agent_response(
    raw_data: dict,
    ctx: DocumentContext,
    question: str,
    lang: str,
    kind: str,
) -> AskResponse:
    """Strictly validates agent output against Sarvam's code rules."""
    answer = str(raw_data.get("answer") or "").strip()
    if not answer:
        raise AgentAskError("Agent returned empty answer")

    answered_from = str(raw_data.get("answered_from") or "document").strip().lower()
    if answered_from not in ("document", "summary", "general"):
        answered_from = "document"

    not_found = bool(raw_data.get("not_found", False))
    quote = raw_data.get("quote")
    quote_str = str(quote).strip() if quote and isinstance(quote, str) else None
    page = raw_data.get("page")
    page_num = (
        int(page)
        if page is not None and isinstance(page, (int, float, str)) and str(page).strip().isdigit() and int(page) > 0
        else None
    )

    follow_ups = [str(f).strip() for f in raw_data.get("follow_ups", []) if str(f).strip()][:2]
    points = [str(p).strip() for p in raw_data.get("points", []) if str(p).strip()]
    steps = [str(s).strip() for s in raw_data.get("steps", []) if str(s).strip()]

    # Construct AskResponse candidate
    ask_res = AskResponse(
        answer=answer,
        points=points,
        steps=steps,
        facts=[],
        follow_ups=follow_ups,
        quote=quote_str,
        page=page_num,
        evidence="none",
        answered_from=answered_from,
        not_found=not_found,
        language=lang,
        tools_used=list(dict.fromkeys(ctx.tools_used)),
        calendar_draft=ctx.calendar_draft,
    )

    # 1. Number guard: verify numbers in answer appear in doc or question
    full_context = question + " " + ctx.result_json_str
    if ctx.pdf_pages_text:
        full_context += " " + " ".join(ctx.pdf_pages_text)
    if quote_str:
        full_context += " " + quote_str

    context_digits = set(extract_digit_sequences(full_context))
    invented_figure = guard_ask_numbers(ask_res, context_digits)
    if invented_figure and ask_res.answered_from != "general":
        raise AgentAskError("Number guard failed: answer contains figures not present in document or question")

    # 2. Evidence validation via code
    if ask_res.answered_from == "general":
        ask_res.not_found = False
        ask_res.quote = None
        ask_res.page = None
        ask_res.evidence = "none"
    elif ask_res.not_found:
        ask_res.evidence = "none"
        ask_res.quote = None
        ask_res.answered_from = "document" if (ctx.files_data or ctx.pdf_pages_text) else "summary"
    elif ask_res.quote and ctx.pdf_pages_text:
        target_page = ask_res.page if ask_res.page is not None else 1
        ev = evidence.verify_evidence(ask_res.quote, ask_res.answer, target_page, ctx.pdf_pages_text)
        ask_res.evidence = ev
        ask_res.answered_from = "document"
    elif ctx.is_photo:
        # Photo documents are NEVER 'matched'
        ask_res.evidence = "check_original"
        ask_res.answered_from = "document"
    else:
        ask_res.evidence = "check_original" if (ctx.files_data or ctx.pdf_pages_text) else "none"
        ask_res.answered_from = "document" if (ctx.files_data or ctx.pdf_pages_text) else "summary"

    # 3. Script guard check for Indic languages
    norm_lang = (lang or "en").lower().split("-")[0]
    if norm_lang in evidence.INDIC_SCRIPT_RANGES and not ask_res.not_found:
        passed, ratio = evidence.check_script_guard([ask_res.answer], norm_lang)
        if not passed:
            logger.warning("Agent script guard failed for lang=%s (ratio=%.2f)", norm_lang, ratio)
            raise AgentAskError(f"Script guard failed for language {norm_lang} (ratio={ratio:.2f})")

    # 4. Standard disclaimers & closings
    ask_res.answer = _close_answer(question, ask_res.answer, lang, kind)
    return ask_res


async def run_agent_turn(
    question: str,
    lang: str,
    result_json: str,
    files_data: Optional[List[Tuple[bytes, str]]] = None,
    pdf_pages_text: Optional[List[str]] = None,
    history: Optional[str] = None,
    deadline: Optional[float] = None,
    timeout: Optional[float] = None,
    model: Optional[str] = None,
) -> AskResponse:
    """Execute one agent turn using ADK and validate the resulting AskResponse."""
    budget = min(timeout or AGENT_BUDGET_SEC, 15.0)
    start_time = time.time()

    # Build context and tools
    ctx = DocumentContext(
        result_json=result_json,
        pdf_pages_text=pdf_pages_text,
        files_data=files_data,
    )
    raw_tools = create_agent_tools(ctx)

    # Wrap tools to enforce the 4-step limit
    step_count = 0

    def wrap_tool(fn):
        def wrapped(*args, **kwargs):
            nonlocal step_count
            step_count += 1
            if step_count > MAX_TOOL_STEPS:
                return {"error": "Maximum tool step limit (4) reached. Formulate your final response now."}
            return fn(*args, **kwargs)
        wrapped.__name__ = fn.__name__
        wrapped.__doc__ = fn.__doc__
        return wrapped

    wrapped_tools = [wrap_tool(t) for t in raw_tools]

    # Instantiate ADK Agent and Runner (client configured inside create_ask_agent via reader.get_client())
    kind = str(ctx.result_data.get("document_kind") or ctx.result_data.get("doc_type") or "document")
    agent = create_ask_agent(tools=wrapped_tools, lang=lang, kind=kind, model=model)
    runner = InMemoryRunner(agent=agent, app_name="sarvam")

    # Create session
    session = await runner.session_service.create_session(
        app_name=runner.app_name,
        user_id="anonymous_user",
    )

    # Assemble user prompt with history
    user_prompt = f"Question: {question}\nLanguage: {lang}\n"
    earlier = last_ask_turns(history)
    if earlier:
        user_prompt += f"\nEarlier conversation turns:\n{earlier}\n"

    # Add brief summary context if available
    summary = ctx.result_data.get("summary", [])
    if summary:
        user_prompt += f"\nDocument summary:\n" + "\n".join(f"- {s}" for s in summary[:3]) + "\n"

    new_message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=user_prompt)],
    )

    # Execute agent loop with budget timeout
    text_parts: List[str] = []

    async def _execute():
        async for event in runner.run_async(
            user_id=session.user_id,
            session_id=session.id,
            new_message=new_message,
        ):
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        text_parts.append(part.text)

    try:
        await asyncio.wait_for(_execute(), timeout=budget)
    except asyncio.TimeoutError:
        logger.warning("Agent execution exceeded budget of %.1fs", budget)
        raise AgentAskError(f"Agent timed out after {budget}s")
    except Exception as e:
        logger.warning("Agent execution error: %s", str(e))
        raise AgentAskError(f"Agent execution failed: {e}") from e

    full_output = "".join(text_parts).strip()
    if not full_output:
        raise AgentAskError("No output produced by agent")

    # Parse and validate
    parsed_dict = parse_agent_json(full_output)
    ask_res = validate_agent_response(
        raw_data=parsed_dict,
        ctx=ctx,
        question=question,
        lang=lang,
        kind=kind,
    )

    elapsed = time.time() - start_time
    logger.info(
        "agent_ask_turn: steps=%d, tools=%s, elapsed=%.2fs",
        step_count,
        ask_res.tools_used,
        elapsed,
    )
    return ask_res
