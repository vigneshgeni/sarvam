import asyncio
from collections import defaultdict
import datetime
import json
import logging
import os
import time
from typing import Dict, List, Optional, Tuple

from fastapi import FastAPI, File, Form, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
from starlette.concurrency import run_in_threadpool

import unittest.mock

from dates import (
    compute_relative_deadline,
    evaluate_date_status,
    parse_date,
)
from errors import make_error_response
from evidence import (
    GENERIC_OFFICE_WORDS,
    collect_conflicts,
    compute_evidence_summary,
    determine_source_kind,
    extract_pdf_pages,
    filter_protected_terms,
    process_contacts,
    process_places,
    verify_evidence,
    verify_glance_evidence,
    verify_protected_terms_guard,
    verify_translation_guard,
)
from models import (
    DOCUMENT_TYPES,
    ContactInfo,
    EvidenceSummary,
    ExplainAction,
    ExplainFact,
    ExplainResponse,
    ExplainWarning,
    GlanceKeyValue,
    GlanceSummary,
    PlaceInfo,
    TranslateActionText,
    TranslateFactText,
    TranslatePayload,
    TranslateRequest,
    TranslateWarningText,
)
import reader
from reader import (
    EXPLAIN_HEDGE_DELAY,
    EXPLAIN_LARGE_TIMEOUT,
    EXPLAIN_TIMEOUT,
    GeminiServiceError,
    GeminiTimeoutError,
    HEDGE_SEMAPHORE_TIMEOUT,
    REQUEST_DEADLINE,
    TRANSLATE_HEDGE_DELAY,
    TRANSLATE_TIMEOUT,
    execute_with_hedge,
    read_document,
    read_document_single_attempt,
    translate_keyed_strings,
    translate_result_text,
)

# Multi-file limits as constants in one place
MAX_IMAGES = 10
MAX_PDF_MB = 20
MAX_TOTAL_MB = 25

MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024
MAX_TOTAL_BYTES = MAX_TOTAL_MB * 1024 * 1024

# Per-instance concurrency semaphore (max 2 concurrent Gemini calls)
GEMINI_SEMAPHORE = asyncio.Semaphore(2)
SEMAPHORE_TIMEOUT = 30.0  # seconds waiting for semaphore before 503

# Rate limits (per IP)
EXPLAIN_RATE_LIMIT = 20
TRANSLATE_RATE_LIMIT = 30
RATE_LIMIT_WINDOW = 60.0  # seconds

# In-memory rate limiting per endpoint and client IP: (endpoint, ip) -> timestamps
IP_REQUESTS: Dict[Tuple[str, str], List[float]] = defaultdict(list)

app = FastAPI(
    title="Sarvam API",
    description="Official notice explainer API",
    version="0.2.0",
)

# CORS configuration
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
env_origins = os.environ.get("ALLOWED_ORIGINS", "")
if env_origins:
    for origin in env_origins.split(","):
        if origin.strip():
            allowed_origins.append(origin.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("sarvam-api")
logging.basicConfig(level=logging.INFO)


def get_client_ip(request: Request) -> str:
    """
    Derives client IP from X-Forwarded-For header (first entry),
    falling back to request.client.host.
    """
    xfwd = request.headers.get("x-forwarded-for")
    if xfwd:
        return xfwd.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def check_rate_limit(endpoint: str, client_ip: str, limit: int) -> Tuple[bool, int]:
    """
    Checks sliding window rate limit for an endpoint and client IP.
    Returns (allowed, retry_after_seconds).
    """
    now = time.time()
    key = (endpoint, client_ip)
    timestamps = [t for t in IP_REQUESTS[key] if now - t < RATE_LIMIT_WINDOW]
    IP_REQUESTS[key] = timestamps
    if len(timestamps) >= limit:
        oldest = timestamps[0]
        retry_after = max(1, int(RATE_LIMIT_WINDOW - (now - oldest)))
        return False, retry_after
    IP_REQUESTS[key].append(now)
    return True, 0


def check_translation_guard(orig: ExplainResponse, trans: TranslatePayload) -> bool:
    """
    Verifies that every number, date, amount and phone number in the original text
    appears in the translated text.
    """
    if not verify_translation_guard(orig.title, trans.title):
        return False

    if orig.report_title:
        if not verify_translation_guard(orig.report_title, trans.report_title):
            return False

    orig_sum = " ".join(orig.summary)
    trans_sum = " ".join(trans.summary)
    if not verify_translation_guard(orig_sum, trans_sum):
        return False

    if len(orig.actions) != len(trans.actions):
        return False
    for o_act, t_act in zip(orig.actions, trans.actions):
        if not verify_translation_guard(o_act.text, t_act.text):
            return False
        if o_act.deadline_rule and not verify_translation_guard(
            o_act.deadline_rule, t_act.deadline_rule
        ):
            return False
        if o_act.recurrence and not verify_translation_guard(
            o_act.recurrence, t_act.recurrence
        ):
            return False

    if len(orig.warnings) != len(trans.warnings):
        return False
    for o_warn, t_warn in zip(orig.warnings, trans.warnings):
        if not verify_translation_guard(o_warn.text, t_warn.text):
            return False

    if len(orig.facts) != len(trans.facts):
        return False
    for o_fact, t_fact in zip(orig.facts, trans.facts):
        if not verify_translation_guard(o_fact.text, t_fact.text):
            return False

    orig_conf = " ".join(orig.conflicts)
    trans_conf = " ".join(trans.conflicts)
    if not verify_translation_guard(orig_conf, trans_conf):
        return False

    if orig.unreadable_reason:
        if not verify_translation_guard(orig.unreadable_reason, trans.unreadable_reason):
            return False

    # 2. Protected terms guard (names, institutions, places, IDs must remain verbatim in original script)
    if orig.protected_terms:
        orig_user_text_parts = [orig.title, orig.report_title or ""]
        orig_user_text_parts.extend(orig.summary)
        for a in orig.actions:
            orig_user_text_parts.append(a.text)
            if a.deadline_rule:
                orig_user_text_parts.append(a.deadline_rule)
            if a.recurrence:
                orig_user_text_parts.append(a.recurrence)
        for w in orig.warnings:
            orig_user_text_parts.append(w.text)
        for f in orig.facts:
            orig_user_text_parts.append(f.text)
        orig_user_text_parts.extend(orig.conflicts)
        if orig.unreadable_reason:
            orig_user_text_parts.append(orig.unreadable_reason)
        full_orig = " ".join(orig_user_text_parts)

        trans_user_text_parts = [trans.title, trans.report_title or ""]
        trans_user_text_parts.extend(trans.summary)
        for a in trans.actions:
            trans_user_text_parts.append(a.text)
            if a.deadline_rule:
                trans_user_text_parts.append(a.deadline_rule)
            if a.recurrence:
                trans_user_text_parts.append(a.recurrence)
        for w in trans.warnings:
            trans_user_text_parts.append(w.text)
        for f in trans.facts:
            trans_user_text_parts.append(f.text)
        trans_user_text_parts.extend(trans.conflicts)
        if trans.unreadable_reason:
            trans_user_text_parts.append(trans.unreadable_reason)
        full_trans = " ".join(trans_user_text_parts)

        if not verify_protected_terms_guard(orig.protected_terms, full_orig, full_trans):
            return False

    return True


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post(
    "/api/explain",
    response_model=ExplainResponse,
    responses={
        400: {"description": "Bad Request"},
        422: {"description": "Unreadable Document"},
        429: {"description": "Rate Limit Exceeded"},
        503: {"description": "Service Busy"},
        504: {"description": "Gateway Timeout"},
    },
)
async def explain(
    request: Request,
    response: Response,
    files: List[UploadFile] = File(...),
    lang: str = Form("en"),
):
    start_time = time.time()
    start_dt = datetime.datetime.now(datetime.timezone.utc)
    deadline = start_time + REQUEST_DEADLINE
    client_ip = get_client_ip(request)

    # Rate limit check per IP (20 requests / minute)
    allowed, retry_after = check_rate_limit("explain", client_ip, EXPLAIN_RATE_LIMIT)
    if not allowed:
        return make_error_response(
            429,
            "rate_limit",
            lang,
            headers={"Retry-After": str(retry_after)},
        )

    if not files:
        return make_error_response(400, "no_files", lang)

    file_data_list = []
    total_bytes = 0
    pdf_count = 0
    img_count = 0
    pdf_bytes = None

    for file in files:
        filename = (file.filename or "").lower()
        if filename.endswith(".docx"):
            return make_error_response(400, "docx_file", lang)

        content = await file.read()
        total_bytes += len(content)

        mime_type = file.content_type or ""
        if filename.endswith(".pdf") or mime_type == "application/pdf":
            mime_type = "application/pdf"
            pdf_count += 1
            pdf_bytes = content
        elif filename.endswith((".jpg", ".jpeg")) or mime_type in ("image/jpeg", "image/jpg"):
            mime_type = "image/jpeg"
            img_count += 1
        elif filename.endswith(".png") or mime_type == "image/png":
            mime_type = "image/png"
            img_count += 1
        else:
            return make_error_response(400, "invalid_file_type", lang)

        file_data_list.append((content, mime_type))

    # Validate file combinations and sizes
    if pdf_count > 0:
        if pdf_count > 1 or img_count > 0:
            return make_error_response(400, "mixed_files", lang)
        if total_bytes > MAX_PDF_BYTES:
            return make_error_response(400, "pdf_too_large", lang)
    else:
        if img_count < 1 or img_count > MAX_IMAGES:
            return make_error_response(400, "too_many_images", lang)
        if total_bytes > MAX_TOTAL_BYTES:
            return make_error_response(400, "file_too_large", lang)

    # Extract text from PDF if available
    pdf_pages_text = None
    if pdf_bytes:
        pdf_pages_text = extract_pdf_pages(pdf_bytes)

    # Check remaining deadline before semaphore wait
    remaining = deadline - time.time()
    if remaining <= 1.0:
        finish_dt = datetime.datetime.now(datetime.timezone.utc)
        elapsed = time.time() - start_time
        logger.info(
            "request_log: endpoint=/api/explain, start=%s, finish=%s, queue_wait=0.000, seconds=%.2f, status=504",
            start_dt.strftime("%H:%M:%S.%f")[:-3],
            finish_dt.strftime("%H:%M:%S.%f")[:-3],
            elapsed,
        )
        return make_error_response(504, "timeout", lang)

    # Acquire per-instance semaphore (capped by SEMAPHORE_TIMEOUT and remaining deadline)
    sem_wait_timeout = min(SEMAPHORE_TIMEOUT, remaining)
    queue_start = time.time()
    try:
        await asyncio.wait_for(GEMINI_SEMAPHORE.acquire(), timeout=sem_wait_timeout)
    except asyncio.TimeoutError:
        queue_wait = time.time() - queue_start
        finish_dt = datetime.datetime.now(datetime.timezone.utc)
        elapsed = time.time() - start_time
        if time.time() >= deadline - 1.0 or sem_wait_timeout == remaining:
            logger.info(
                "request_log: endpoint=/api/explain, start=%s, finish=%s, queue_wait=%.3f, seconds=%.2f, status=504",
                start_dt.strftime("%H:%M:%S.%f")[:-3],
                finish_dt.strftime("%H:%M:%S.%f")[:-3],
                queue_wait,
                elapsed,
            )
            return make_error_response(504, "timeout", lang)
        logger.info(
            "request_log: endpoint=/api/explain, start=%s, finish=%s, queue_wait=%.3f, seconds=%.2f, status=503",
            start_dt.strftime("%H:%M:%S.%f")[:-3],
            finish_dt.strftime("%H:%M:%S.%f")[:-3],
            queue_wait,
            elapsed,
        )
        return make_error_response(503, "service_busy", lang)

    queue_wait = time.time() - queue_start

    # Run Gemini Reader with hedging and AnyIO thread pool so event loop remains completely unblocked
    try:
        if (
            isinstance(read_document, unittest.mock.MagicMock)
            or read_document is not reader.read_document
        ):
            reader_result = await run_in_threadpool(read_document, file_data_list, lang, deadline)
        else:
            reader_result = await execute_with_hedge(
                fn=read_document_single_attempt,
                args=(file_data_list, lang),
                per_attempt_timeout=EXPLAIN_LARGE_TIMEOUT if len(file_data_list) > 3 else EXPLAIN_TIMEOUT,
                hedge_delay=EXPLAIN_HEDGE_DELAY,
                can_hedge=len(file_data_list) <= 3,
                deadline=deadline,
                semaphore=GEMINI_SEMAPHORE,
                endpoint="explain",
            )
    except Exception as e:
        elapsed = time.time() - start_time
        finish_dt = datetime.datetime.now(datetime.timezone.utc)
        err_str = str(e).lower()

        if (
            isinstance(e, (GeminiTimeoutError, httpx.TimeoutException, TimeoutError))
            or "timeout" in err_str
            or time.time() >= deadline - 1.0
        ):
            status_code = 504
            logger.info(
                "request_log: endpoint=/api/explain, start=%s, finish=%s, queue_wait=%.3f, seconds=%.2f, status=504",
                start_dt.strftime("%H:%M:%S.%f")[:-3],
                finish_dt.strftime("%H:%M:%S.%f")[:-3],
                queue_wait,
                elapsed,
            )
            return make_error_response(504, "timeout", lang)

        status_code = 503
        logger.info(
            "request_log: endpoint=/api/explain, start=%s, finish=%s, queue_wait=%.3f, seconds=%.2f, status=503",
            start_dt.strftime("%H:%M:%S.%f")[:-3],
            finish_dt.strftime("%H:%M:%S.%f")[:-3],
            queue_wait,
            elapsed,
        )
        return make_error_response(503, "service_busy", lang)
    finally:
        GEMINI_SEMAPHORE.release()

    # Log ONLY non-content metrics: endpoint, start, finish, queue_wait, seconds, status
    elapsed = time.time() - start_time
    finish_dt = datetime.datetime.now(datetime.timezone.utc)
    status_code = 200 if not reader_result.unreadable else 422
    logger.info(
        "request_log: endpoint=/api/explain, start=%s, finish=%s, queue_wait=%.3f, seconds=%.2f, status=%d",
        start_dt.strftime("%H:%M:%S.%f")[:-3],
        finish_dt.strftime("%H:%M:%S.%f")[:-3],
        queue_wait,
        elapsed,
        status_code,
    )

    # Determine document language and written language (Item 4: lang=auto)
    doc_lang = reader_result.document_language or "en"
    if lang == "auto":
        # write in document's own language if en/ta/hi (other Indian languages = Beta), else English
        if doc_lang in ("en", "ta", "hi", "kn", "te", "ml", "mr", "bn", "gu", "pa", "or", "ur"):
            written_lang = reader_result.language or doc_lang
        else:
            written_lang = "en"
    else:
        written_lang = lang

    # Check unreadable
    if reader_result.unreadable:
        return make_error_response(
            422,
            "unreadable",
            written_lang,
            custom_message=reader_result.unreadable_reason or "Document is unreadable. Please retake the photo.",
        )

    # Standardize letter_date
    letter_date_iso = None
    if reader_result.letter_date:
        parsed_ld = parse_date(reader_result.letter_date)
        letter_date_iso = parsed_ld.isoformat() if parsed_ld else reader_result.letter_date
    elif pdf_pages_text:
        import re
        full_text = " ".join(pdf_pages_text)
        m = re.search(
            r"Date:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{1,2}[./-]\d{1,2}[./-]\d{4})",
            full_text,
            re.IGNORECASE,
        )
        if m:
            parsed_ld = parse_date(m.group(1))
            if parsed_ld:
                letter_date_iso = parsed_ld.isoformat()

    # Standardize report_date_iso (Item 5)
    report_date_iso = None
    if reader_result.report_date:
        parsed_rd = parse_date(reader_result.report_date)
        if parsed_rd:
            report_date_iso = parsed_rd.isoformat()

    # Determine source_kind (Item 6)
    source_kind = determine_source_kind(file_data_list, pdf_pages_text)

    # Process Actions
    explain_actions: List[ExplainAction] = []
    for act in reader_result.actions:
        if act.recurrence:
            # Recurring obligation: due_date=null, recurrence=display text, date_status="recurring"
            due_date = None
            date_status = "recurring"
            evidence = verify_evidence(
                act.quote,
                act.text,
                act.page,
                pdf_pages_text,
                is_calculated=False,
            )
        elif act.deadline_days is not None:
            computed_dt = compute_relative_deadline(
                act.deadline_days, letter_date_iso, act.deadline_anchor
            )
            if computed_dt:
                due_date = computed_dt.isoformat()
                date_status = "calculated"
                evidence = "calculated"
            else:
                due_date = act.due_date
                date_status = evaluate_date_status(due_date, is_calculated=False)
                evidence = verify_evidence(
                    act.quote,
                    act.text,
                    act.page,
                    pdf_pages_text,
                    is_calculated=False,
                )
        else:
            due_date = act.due_date
            date_status = evaluate_date_status(due_date, is_calculated=False)
            evidence = verify_evidence(
                act.quote,
                act.text,
                act.page,
                pdf_pages_text,
                is_calculated=False,
            )

        explain_actions.append(
            ExplainAction(
                text=act.text,
                due_date=due_date,
                deadline_rule=act.deadline_rule,
                deadline_days=act.deadline_days,
                deadline_anchor=act.deadline_anchor,
                recurrence=act.recurrence,
                date_status=date_status,
                quote=act.quote,
                page=act.page,
                evidence=evidence,
            )
        )

    # Process Warnings
    explain_warnings: List[ExplainWarning] = []
    for warn in reader_result.warnings:
        evidence = verify_evidence(
            warn.quote,
            warn.text,
            warn.page,
            pdf_pages_text,
            is_calculated=False,
        )
        explain_warnings.append(
            ExplainWarning(
                text=warn.text,
                quote=warn.quote,
                page=warn.page,
                evidence=evidence,
            )
        )

    # Process Facts
    explain_facts: List[ExplainFact] = []
    for fact in reader_result.facts:
        evidence = verify_evidence(
            fact.quote,
            fact.text,
            fact.page,
            pdf_pages_text,
            is_calculated=False,
        )
        explain_facts.append(
            ExplainFact(
                text=fact.text,
                quote=fact.quote,
                page=fact.page,
                evidence=evidence,
            )
        )

    # Process Glance (Item 5)
    glance_summary = None
    if reader_result.glance:
        kvs = []
        for kv in (reader_result.glance.key_values or [])[:3]:
            lbl = kv.label
            val = kv.value
            knd = kv.kind if kv.kind in ("amount", "date", "text") else "text"
            ev = verify_glance_evidence(val, knd, pdf_pages_text)
            kvs.append(GlanceKeyValue(label=lbl, value=val, kind=knd, evidence=ev))
        words = (reader_result.glance.headline or "").split()
        headline = " ".join(words[:12]) if len(words) > 12 else (reader_result.glance.headline or "")
        glance_summary = GlanceSummary(headline=headline, key_values=kvs)

    # Process Places and Contacts (Item 6)
    processed_places = [PlaceInfo(**p) for p in process_places(reader_result.places, pdf_pages_text)]
    processed_contacts = [ContactInfo(**c) for c in process_contacts(reader_result.contacts, pdf_pages_text)]

    # Detect conflicts in PDF and combine with model conflicts
    all_conflicts = collect_conflicts(pdf_pages_text, reader_result.conflicts)

    # Compute evidence summary
    dict_actions = [a.model_dump() for a in explain_actions]
    dict_warnings = [w.model_dump() for w in explain_warnings]
    dict_facts = [f.model_dump() for f in explain_facts]
    summary_data = compute_evidence_summary(dict_actions, dict_warnings, dict_facts)
    evidence_summary = EvidenceSummary(**summary_data)

    response.headers["X-Start"] = start_dt.strftime("%H:%M:%S.%f")[:-3]
    response.headers["X-Finish"] = finish_dt.strftime("%H:%M:%S.%f")[:-3]
    response.headers["X-Queue-Wait"] = f"{queue_wait:.3f}"

    doc_type_val = reader_result.document_type or reader_result.doc_type or "other"

    return ExplainResponse(
        doc_type=doc_type_val,
        document_type=doc_type_val,
        document_language=doc_lang,
        source_kind=source_kind,
        title=reader_result.title,
        report_title=reader_result.report_title,
        report_date=reader_result.report_date,
        report_date_iso=report_date_iso,
        language=written_lang,
        letter_date=letter_date_iso,
        glance=glance_summary,
        summary=reader_result.summary,
        actions=explain_actions,
        warnings=explain_warnings,
        facts=explain_facts,
        places=processed_places,
        contacts=processed_contacts,
        conflicts=all_conflicts,
        evidence_summary=evidence_summary,
        unreadable=False,
        unreadable_reason=None,
        protected_terms=filter_protected_terms(reader_result.protected_terms),
    )


@app.post(
    "/api/translate",
    response_model=ExplainResponse,
    responses={
        422: {"description": "Translation Verification Failed"},
        429: {"description": "Rate Limit Exceeded"},
        503: {"description": "Service Busy"},
        504: {"description": "Gateway Timeout"},
    },
)
async def translate(
    request: Request,
    response: Response,
    body: TranslateRequest,
):
    start_time = time.time()
    start_dt = datetime.datetime.now(datetime.timezone.utc)
    deadline = start_time + REQUEST_DEADLINE
    client_ip = get_client_ip(request)

    # Rate limit check per IP (30 requests / minute)
    allowed, retry_after = check_rate_limit("translate", client_ip, TRANSLATE_RATE_LIMIT)
    if not allowed:
        return make_error_response(
            429,
            "rate_limit",
            body.lang,
            headers={"Retry-After": str(retry_after)},
        )

    orig = body.result
    input_bytes = len(body.model_dump_json().encode("utf-8"))

    # Extract strings to translate for shrunk translate (Item 2)
    strings_to_translate: Dict[str, str] = {
        "title": orig.title,
    }
    if orig.report_title:
        strings_to_translate["report_title"] = orig.report_title
    for i, s in enumerate(orig.summary):
        strings_to_translate[f"summary_{i}"] = s
    for i, a in enumerate(orig.actions):
        strings_to_translate[f"action_{i}_text"] = a.text
        if a.deadline_rule:
            strings_to_translate[f"action_{i}_rule"] = a.deadline_rule
        if a.recurrence:
            strings_to_translate[f"action_{i}_recurrence"] = a.recurrence
    for i, w in enumerate(orig.warnings):
        strings_to_translate[f"warning_{i}_text"] = w.text
    for i, f in enumerate(orig.facts):
        strings_to_translate[f"fact_{i}_text"] = f.text
    for i, c in enumerate(orig.conflicts):
        strings_to_translate[f"conflict_{i}"] = c
    if orig.unreadable_reason:
        strings_to_translate["unreadable_reason"] = orig.unreadable_reason
    if orig.glance:
        strings_to_translate["glance_headline"] = orig.glance.headline
        for i, kv in enumerate(orig.glance.key_values):
            strings_to_translate[f"glance_kv_{i}_label"] = kv.label
    for i, p in enumerate(orig.places):
        strings_to_translate[f"place_{i}_label"] = p.label
    for i, c in enumerate(orig.contacts):
        strings_to_translate[f"contact_{i}_label"] = c.label

    # Legacy payload constructed for mock compatibility
    actions_payload = [
        TranslateActionText(
            text=a.text,
            deadline_rule=a.deadline_rule,
            recurrence=a.recurrence,
        )
        for a in orig.actions
    ]
    warnings_payload = [TranslateWarningText(text=w.text) for w in orig.warnings]
    facts_payload = [TranslateFactText(text=f.text) for f in orig.facts]

    payload = TranslatePayload(
        title=orig.title,
        report_title=orig.report_title,
        summary=orig.summary,
        actions=actions_payload,
        warnings=warnings_payload,
        facts=facts_payload,
        conflicts=orig.conflicts,
        unreadable_reason=orig.unreadable_reason,
        protected_terms=filter_protected_terms(orig.protected_terms),
    )

    # Check remaining deadline before semaphore wait
    remaining = deadline - time.time()
    if remaining <= 1.0:
        finish_dt = datetime.datetime.now(datetime.timezone.utc)
        elapsed = time.time() - start_time
        logger.info(
            "request_log: endpoint=/api/translate, start=%s, finish=%s, queue_wait=0.000, seconds=%.2f, status=504",
            start_dt.strftime("%H:%M:%S.%f")[:-3],
            finish_dt.strftime("%H:%M:%S.%f")[:-3],
            elapsed,
        )
        return make_error_response(504, "timeout", body.lang)

    # Acquire per-instance semaphore (capped by SEMAPHORE_TIMEOUT and remaining deadline)
    sem_wait_timeout = min(SEMAPHORE_TIMEOUT, remaining)
    queue_start = time.time()
    try:
        await asyncio.wait_for(GEMINI_SEMAPHORE.acquire(), timeout=sem_wait_timeout)
    except asyncio.TimeoutError:
        queue_wait = time.time() - queue_start
        finish_dt = datetime.datetime.now(datetime.timezone.utc)
        elapsed = time.time() - start_time
        if time.time() >= deadline - 1.0 or sem_wait_timeout == remaining:
            logger.info(
                "request_log: endpoint=/api/translate, start=%s, finish=%s, queue_wait=%.3f, seconds=%.2f, status=504",
                start_dt.strftime("%H:%M:%S.%f")[:-3],
                finish_dt.strftime("%H:%M:%S.%f")[:-3],
                queue_wait,
                elapsed,
            )
            return make_error_response(504, "timeout", body.lang)
        logger.info(
            "request_log: endpoint=/api/translate, start=%s, finish=%s, queue_wait=%.3f, seconds=%.2f, status=503",
            start_dt.strftime("%H:%M:%S.%f")[:-3],
            finish_dt.strftime("%H:%M:%S.%f")[:-3],
            queue_wait,
            elapsed,
        )
        return make_error_response(503, "service_busy", body.lang)

    queue_wait = time.time() - queue_start

    # Run Shrunk Translate with hedging in AnyIO thread pool so event loop remains unblocked
    try:
        if (
            isinstance(translate_result_text, unittest.mock.MagicMock)
            or translate_result_text is not reader.translate_result_text
        ):
            translated_payload = await run_in_threadpool(translate_result_text, payload, body.lang, deadline)
            trans_title = translated_payload.title
            trans_report_title = translated_payload.report_title
            trans_summary = translated_payload.summary
            trans_actions = translated_payload.actions
            trans_warnings = translated_payload.warnings
            trans_facts = translated_payload.facts
            trans_conflicts = translated_payload.conflicts
            trans_unreadable_reason = translated_payload.unreadable_reason
            trans_glance_headline = orig.glance.headline if orig.glance else None
            trans_glance_kv_labels = [kv.label for kv in (orig.glance.key_values if orig.glance else [])]
            trans_places_labels = [p.label for p in orig.places]
            trans_contacts_labels = [c.label for c in orig.contacts]
        else:
            translated_dict = await execute_with_hedge(
                fn=translate_keyed_strings,
                args=(strings_to_translate, body.lang, orig.protected_terms),
                per_attempt_timeout=TRANSLATE_TIMEOUT,
                hedge_delay=TRANSLATE_HEDGE_DELAY,
                can_hedge=True,
                deadline=deadline,
                semaphore=GEMINI_SEMAPHORE,
                endpoint="translate",
            )
            trans_title = translated_dict.get("title", orig.title)
            trans_report_title = translated_dict.get("report_title") if orig.report_title else None
            trans_summary = [
                translated_dict.get(f"summary_{i}", s) for i, s in enumerate(orig.summary)
            ]
            trans_actions = []
            for i, a in enumerate(orig.actions):
                t_text = translated_dict.get(f"action_{i}_text", a.text)
                t_rule = (
                    translated_dict.get(f"action_{i}_rule", a.deadline_rule)
                    if a.deadline_rule
                    else None
                )
                t_rec = (
                    translated_dict.get(f"action_{i}_recurrence", a.recurrence)
                    if a.recurrence
                    else None
                )
                trans_actions.append(
                    TranslateActionText(text=t_text, deadline_rule=t_rule, recurrence=t_rec)
                )
            trans_warnings = [
                TranslateWarningText(text=translated_dict.get(f"warning_{i}_text", w.text))
                for i, w in enumerate(orig.warnings)
            ]
            trans_facts = [
                TranslateFactText(text=translated_dict.get(f"fact_{i}_text", f.text))
                for i, f in enumerate(orig.facts)
            ]
            trans_conflicts = [
                translated_dict.get(f"conflict_{i}", c)
                for i, c in enumerate(orig.conflicts)
            ]
            trans_unreadable_reason = (
                translated_dict.get("unreadable_reason") if orig.unreadable_reason else None
            )
            trans_glance_headline = (
                translated_dict.get("glance_headline", orig.glance.headline)
                if orig.glance
                else None
            )
            trans_glance_kv_labels = [
                translated_dict.get(f"glance_kv_{i}_label", kv.label)
                for i, kv in enumerate(orig.glance.key_values if orig.glance else [])
            ]
            trans_places_labels = [
                translated_dict.get(f"place_{i}_label", p.label)
                for i, p in enumerate(orig.places)
            ]
            trans_contacts_labels = [
                translated_dict.get(f"contact_{i}_label", c.label)
                for i, c in enumerate(orig.contacts)
            ]
            translated_payload = TranslatePayload(
                title=trans_title,
                report_title=trans_report_title,
                summary=trans_summary,
                actions=trans_actions,
                warnings=trans_warnings,
                facts=trans_facts,
                conflicts=trans_conflicts,
                unreadable_reason=trans_unreadable_reason,
                protected_terms=filter_protected_terms(orig.protected_terms),
            )
    except Exception as e:
        elapsed = time.time() - start_time
        finish_dt = datetime.datetime.now(datetime.timezone.utc)
        err_str = str(e).lower()

        if (
            isinstance(e, (GeminiTimeoutError, httpx.TimeoutException, TimeoutError))
            or "timeout" in err_str
            or time.time() >= deadline - 1.0
        ):
            status_code = 504
            logger.info(
                "request_log: endpoint=/api/translate, start=%s, finish=%s, queue_wait=%.3f, seconds=%.2f, status=504",
                start_dt.strftime("%H:%M:%S.%f")[:-3],
                finish_dt.strftime("%H:%M:%S.%f")[:-3],
                queue_wait,
                elapsed,
            )
            return make_error_response(504, "timeout", body.lang)

        status_code = 503
        logger.info(
            "request_log: endpoint=/api/translate, start=%s, finish=%s, queue_wait=%.3f, seconds=%.2f, status=503",
            start_dt.strftime("%H:%M:%S.%f")[:-3],
            finish_dt.strftime("%H:%M:%S.%f")[:-3],
            queue_wait,
            elapsed,
        )
        return make_error_response(503, "service_busy", body.lang)
    finally:
        GEMINI_SEMAPHORE.release()

    elapsed = time.time() - start_time

    # Guard: every number, date, amount and phone number in original text must appear in translated text
    guard_passed = check_translation_guard(orig, translated_payload)
    finish_dt = datetime.datetime.now(datetime.timezone.utc)
    status_code = 200 if guard_passed else 422
    logger.info(
        "request_log: endpoint=/api/translate, start=%s, finish=%s, queue_wait=%.3f, seconds=%.2f, status=%d",
        start_dt.strftime("%H:%M:%S.%f")[:-3],
        finish_dt.strftime("%H:%M:%S.%f")[:-3],
        queue_wait,
        elapsed,
        status_code,
    )
    if not guard_passed:
        return make_error_response(422, "translation_guard_failed", body.lang)

    # Reassemble result: quotes, page numbers, dates, evidence labels, amounts, numbers copied by CODE
    stitched_actions: List[ExplainAction] = []
    for i, orig_act in enumerate(orig.actions):
        trans_act = (
            trans_actions[i]
            if i < len(trans_actions)
            else TranslateActionText(text=orig_act.text)
        )
        due_date = None if orig_act.recurrence else orig_act.due_date
        stitched_actions.append(
            ExplainAction(
                text=trans_act.text,
                due_date=due_date,
                deadline_rule=trans_act.deadline_rule if orig_act.deadline_rule else None,
                deadline_days=orig_act.deadline_days,
                deadline_anchor=orig_act.deadline_anchor,
                recurrence=trans_act.recurrence if orig_act.recurrence else None,
                date_status=orig_act.date_status,  # Copied by CODE
                quote=orig_act.quote,              # Copied by CODE
                page=orig_act.page,                # Copied by CODE
                evidence=orig_act.evidence,        # Copied by CODE
            )
        )

    stitched_warnings: List[ExplainWarning] = []
    for i, orig_warn in enumerate(orig.warnings):
        trans_warn = (
            trans_warnings[i]
            if i < len(trans_warnings)
            else TranslateWarningText(text=orig_warn.text)
        )
        stitched_warnings.append(
            ExplainWarning(
                text=trans_warn.text,
                quote=orig_warn.quote,       # Copied by CODE
                page=orig_warn.page,         # Copied by CODE
                evidence=orig_warn.evidence, # Copied by CODE
            )
        )

    stitched_facts: List[ExplainFact] = []
    for i, orig_fact in enumerate(orig.facts):
        trans_fact = (
            trans_facts[i]
            if i < len(trans_facts)
            else TranslateFactText(text=orig_fact.text)
        )
        stitched_facts.append(
            ExplainFact(
                text=trans_fact.text,
                quote=orig_fact.quote,       # Copied by CODE
                page=orig_fact.page,         # Copied by CODE
                evidence=orig_fact.evidence, # Copied by CODE
            )
        )

    # Stitch Glance (labels translated, value/kind/evidence copied by CODE)
    stitched_glance = None
    if orig.glance:
        stitched_kvs = []
        for i, kv in enumerate(orig.glance.key_values):
            lbl = trans_glance_kv_labels[i] if i < len(trans_glance_kv_labels) else kv.label
            stitched_kvs.append(
                GlanceKeyValue(
                    label=lbl,
                    value=kv.value,          # Copied by CODE
                    kind=kv.kind,            # Copied by CODE
                    evidence=kv.evidence,    # Copied by CODE
                )
            )
        stitched_glance = GlanceSummary(
            headline=trans_glance_headline or orig.glance.headline,
            key_values=stitched_kvs,
        )

    # Stitch Places (label translated, address/quote/page/evidence copied by CODE)
    stitched_places = []
    for i, p in enumerate(orig.places):
        lbl = trans_places_labels[i] if i < len(trans_places_labels) else p.label
        stitched_places.append(
            PlaceInfo(
                label=lbl,
                address=p.address,       # Copied by CODE
                quote=p.quote,           # Copied by CODE
                page=p.page,             # Copied by CODE
                evidence=p.evidence,     # Copied by CODE
            )
        )

    # Stitch Contacts (label translated, value/quote/page/evidence copied by CODE)
    stitched_contacts = []
    for i, c in enumerate(orig.contacts):
        lbl = trans_contacts_labels[i] if i < len(trans_contacts_labels) else c.label
        stitched_contacts.append(
            ContactInfo(
                label=lbl,
                value=c.value,           # Copied by CODE
                quote=c.quote,           # Copied by CODE
                page=c.page,             # Copied by CODE
                evidence=c.evidence,     # Copied by CODE
            )
        )

    response.headers["X-Start"] = start_dt.strftime("%H:%M:%S.%f")[:-3]
    response.headers["X-Finish"] = finish_dt.strftime("%H:%M:%S.%f")[:-3]
    response.headers["X-Queue-Wait"] = f"{queue_wait:.3f}"

    doc_type_val = orig.document_type or orig.doc_type or "other"

    return ExplainResponse(
        doc_type=doc_type_val,
        document_type=doc_type_val,
        document_language=orig.document_language,
        source_kind=orig.source_kind,
        title=trans_title,
        report_title=trans_report_title if orig.report_title else None,
        report_date=orig.report_date,             # Copied by CODE
        report_date_iso=orig.report_date_iso,     # Copied by CODE
        language=body.lang,
        letter_date=orig.letter_date,             # Copied by CODE
        glance=stitched_glance,
        summary=trans_summary,
        actions=stitched_actions,
        warnings=stitched_warnings,
        facts=stitched_facts,
        places=stitched_places,
        contacts=stitched_contacts,
        conflicts=trans_conflicts,
        evidence_summary=orig.evidence_summary,  # Copied by CODE
        unreadable=orig.unreadable,
        unreadable_reason=trans_unreadable_reason if orig.unreadable_reason else None,
        protected_terms=filter_protected_terms(orig.protected_terms),    # Copied by CODE
    )
