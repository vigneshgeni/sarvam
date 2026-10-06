from collections import defaultdict
import logging
import os
import time
from typing import Dict, List

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from dates import (
    compute_relative_deadline,
    evaluate_date_status,
    parse_date,
)
from errors import make_error_response
from evidence import (
    collect_conflicts,
    compute_evidence_summary,
    extract_pdf_pages,
    verify_evidence,
)
from models import (
    EvidenceSummary,
    ExplainAction,
    ExplainFact,
    ExplainResponse,
    ExplainWarning,
)
from reader import read_document

MAX_TOTAL_BYTES = 15 * 1024 * 1024  # 15 MB
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW = 60.0  # seconds

# In-memory rate limiting per client IP
IP_REQUESTS: Dict[str, List[float]] = defaultdict(list)

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


def check_rate_limit(client_ip: str) -> bool:
    now = time.time()
    # Retain only timestamps within the rolling window
    timestamps = [t for t in IP_REQUESTS[client_ip] if now - t < RATE_LIMIT_WINDOW]
    IP_REQUESTS[client_ip] = timestamps
    if len(timestamps) >= RATE_LIMIT_MAX:
        return False
    IP_REQUESTS[client_ip].append(now)
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
    },
)
async def explain(
    request: Request,
    files: List[UploadFile] = File(...),
    lang: str = Form("en"),
):
    start_time = time.time()

    # Rate limit check per IP (10 requests / minute)
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        return make_error_response(429, "rate_limit", lang)

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

    # Check total size limit (15 MB)
    if total_bytes > MAX_TOTAL_BYTES:
        return make_error_response(400, "file_too_large", lang)

    # Validate file combination: 1 PDF or 1-3 images
    if pdf_count > 0:
        if pdf_count > 1 or img_count > 0:
            return make_error_response(400, "mixed_files", lang)
    else:
        if img_count < 1 or img_count > 3:
            return make_error_response(400, "too_many_images", lang)

    # Extract text from PDF if available
    pdf_pages_text = None
    if pdf_bytes:
        pdf_pages_text = extract_pdf_pages(pdf_bytes)

    # Call Gemini Reader
    try:
        reader_result = read_document(file_data_list, lang)
    except Exception as e:
        logger.error("Error calling Reader: %s", type(e).__name__)
        return make_error_response(503, "gemini_busy", lang)

    # Log ONLY file count, types, and duration — NEVER document content
    elapsed = time.time() - start_time
    file_types = [m for _, m in file_data_list]
    logger.info(
        "Processed explain request: count=%d, types=%s, duration=%.2fs",
        len(file_data_list),
        file_types,
        elapsed,
    )

    # Check unreadable
    if reader_result.unreadable:
        return make_error_response(
            422,
            "unreadable",
            lang,
            custom_message=reader_result.unreadable_reason or "Document is unreadable. Please retake the photo.",
        )

    # Standardize letter_date
    letter_date_iso = None
    if reader_result.letter_date:
        parsed_ld = parse_date(reader_result.letter_date)
        letter_date_iso = parsed_ld.isoformat() if parsed_ld else reader_result.letter_date
    elif pdf_pages_text:
        # Fallback check for letter date in PDF text
        import re
        full_text = " ".join(pdf_pages_text)
        m = re.search(r"Date:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{1,2}[./-]\d{1,2}[./-]\d{4})", full_text, re.IGNORECASE)
        if m:
            parsed_ld = parse_date(m.group(1))
            if parsed_ld:
                letter_date_iso = parsed_ld.isoformat()

    # Process Actions
    explain_actions: List[ExplainAction] = []
    for act in reader_result.actions:
        computed_dt = compute_relative_deadline(act.deadline_rule, letter_date_iso)
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

        explain_actions.append(
            ExplainAction(
                text=act.text,
                due_date=due_date,
                deadline_rule=act.deadline_rule,
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

    # Detect conflicts in PDF and combine with model conflicts
    all_conflicts = collect_conflicts(pdf_pages_text, reader_result.conflicts)

    # Compute evidence summary
    dict_actions = [a.model_dump() for a in explain_actions]
    dict_warnings = [w.model_dump() for w in explain_warnings]
    dict_facts = [f.model_dump() for f in explain_facts]
    summary_data = compute_evidence_summary(dict_actions, dict_warnings, dict_facts)
    evidence_summary = EvidenceSummary(**summary_data)

    return ExplainResponse(
        doc_type=reader_result.doc_type,
        title=reader_result.title,
        language=reader_result.language or lang,
        letter_date=letter_date_iso,
        summary=reader_result.summary,
        actions=explain_actions,
        warnings=explain_warnings,
        facts=explain_facts,
        conflicts=all_conflicts,
        evidence_summary=evidence_summary,
        unreadable=False,
        unreadable_reason=None,
    )
