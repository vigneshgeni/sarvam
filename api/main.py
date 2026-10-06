import logging
from typing import List

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

from errors import make_error_response
from models import ReaderResponse
from reader import read_document

MAX_TOTAL_BYTES = 15 * 1024 * 1024  # 15 MB

app = FastAPI(
    title="Sarvam API",
    description="Official notice explainer API",
    version="0.1.0",
)

logger = logging.getLogger("sarvam-api")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post(
    "/api/explain",
    response_model=ReaderResponse,
    responses={
        400: {"description": "Bad Request"},
        422: {"description": "Unreadable Document"},
        503: {"description": "Service Busy"},
    },
)
async def explain(
    files: List[UploadFile] = File(...),
    lang: str = Form("en"),
):
    if not files:
        return make_error_response(400, "no_files", lang)

    file_data_list = []
    total_bytes = 0
    pdf_count = 0
    img_count = 0

    for file in files:
        filename = (file.filename or "").lower()
        if filename.endswith(".docx"):
            return make_error_response(400, "docx_file", lang)

        content = await file.read()
        total_bytes += len(content)

        # Detect mime type from content_type or file extension
        mime_type = file.content_type or ""
        if filename.endswith(".pdf") or mime_type == "application/pdf":
            mime_type = "application/pdf"
            pdf_count += 1
        elif filename.endswith((".jpg", ".jpeg")) or mime_type in ("image/jpeg", "image/jpg"):
            mime_type = "image/jpeg"
            img_count += 1
        elif filename.endswith(".png") or mime_type == "image/png":
            mime_type = "image/png"
            img_count += 1
        else:
            return make_error_response(400, "invalid_file_type", lang)

        file_data_list.append((content, mime_type))

    # Check total size
    if total_bytes > MAX_TOTAL_BYTES:
        return make_error_response(400, "file_too_large", lang)

    # Validate file counts: 1 PDF or 1-3 images
    if pdf_count > 0:
        if pdf_count > 1 or img_count > 0:
            return make_error_response(400, "mixed_files", lang)
    else:
        if img_count < 1 or img_count > 3:
            return make_error_response(400, "too_many_images", lang)

    try:
        result = read_document(file_data_list, lang)
    except Exception as e:
        logger.error(f"Error calling Reader: {e}", exc_info=True)
        return make_error_response(503, "gemini_busy", lang)

    if result.unreadable:
        return make_error_response(
            422,
            "unreadable",
            lang,
            custom_message=result.unreadable_reason or "Document is unreadable. Please retake the photo.",
        )

    return result
