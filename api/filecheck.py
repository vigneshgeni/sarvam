"""Reject files that can never be read, before any model call.

Does not log file bytes or filenames.
"""

import io
from typing import Optional

import pypdf

PDF_MAGIC = b"%PDF"
JPEG_MAGIC = b"\xff\xd8\xff"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def classify_upload(content: Optional[bytes], mime_type: str) -> str:
    """
    Returns ok, empty, bad_magic, or pdf_unopenable.
    Accepted types are the ones explain already allows: PDF, JPEG, PNG.
    """
    if not content:
        return "empty"

    if mime_type == "application/pdf":
        if not content.startswith(PDF_MAGIC):
            return "bad_magic"
        if not _pdf_opens(content):
            return "pdf_unopenable"
        return "ok"

    if mime_type == "image/jpeg":
        if not content.startswith(JPEG_MAGIC):
            return "bad_magic"
        return "ok"

    if mime_type == "image/png":
        if not content.startswith(PNG_MAGIC):
            return "bad_magic"
        return "ok"

    return "ok"


def _pdf_opens(content: bytes) -> bool:
    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
    except Exception:
        return False
    if getattr(reader, "is_encrypted", False):
        return True
    try:
        len(reader.pages)
    except Exception:
        return False
    return True
