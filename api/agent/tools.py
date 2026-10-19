"""Tools for the Ask Sarvam ADK Agent.

These tools wrap Sarvam's existing verification and calculation modules:
- api/evidence.py (verify_evidence, match_lab_row)
- api/dates.py (parse_date, evaluate_date_status, resolve_relative_deadline, ist_today)
- Pure calendar event drafting
"""

import json
import logging
from typing import Any, Callable, Dict, List, Optional, Tuple

import dates
import evidence

logger = logging.getLogger("sarvam-agent")


class DocumentContext:
    """Holds runtime document context and records tool actions."""

    def __init__(
        self,
        result_json: str,
        pdf_pages_text: Optional[List[str]] = None,
        files_data: Optional[List[Tuple[bytes, str]]] = None,
    ):
        self.result_json_str = result_json or "{}"
        try:
            self.result_data = json.loads(self.result_json_str) if isinstance(result_json, str) else (result_json or {})
        except Exception:
            self.result_data = {}

        self.pdf_pages_text = [p for p in (pdf_pages_text or []) if p and p.strip()]
        self.files_data = files_data or []

        # Determine if document is photo or text PDF
        source_kind = str(self.result_data.get("source_kind", "")).lower()
        self.is_photo = bool(
            "photo" in source_kind
            or (self.files_data and not self.pdf_pages_text)
            or (not self.pdf_pages_text and not self.result_data.get("source_text"))
        )

        # Build passage index
        self.passages: List[Tuple[int, str]] = []
        if self.pdf_pages_text:
            for page_idx, page_str in enumerate(self.pdf_pages_text, 1):
                for line in page_str.split("\n"):
                    clean = line.strip()
                    if clean:
                        self.passages.append((page_idx, clean))
        elif self.result_data.get("source_text"):
            for line in str(self.result_data["source_text"]).split("\n"):
                clean = line.strip()
                if clean:
                    self.passages.append((1, clean))

        # Recorded tool calls during an agent turn
        self.tools_used: List[str] = []
        self.calendar_draft: Optional[Dict[str, Any]] = None
        self.last_verified_quote: Optional[str] = None
        self.last_verified_page: Optional[int] = None
        self.last_evidence_label: Optional[str] = None


def create_agent_tools(ctx: DocumentContext) -> List[Callable]:
    """Factory that creates and binds tools to a specific DocumentContext."""

    def search_document(query: str = "") -> str:
        """Search the document text and structured analysis for passages matching query.
        
        Args:
            query: The search term, keyword, or question to locate in the document.
        """
        ctx.tools_used.append("search_document")
        clean_query = (query or "").strip()
        if not clean_query:
            # If no query provided, return first summary points or top lines
            summary_lines = ctx.result_data.get("summary", [])
            if summary_lines:
                return "Document summary:\n" + "\n".join(f"- {s}" for s in summary_lines[:3])
            return "No search query provided."

        query_tokens = [t.lower() for t in clean_query.split() if len(t) > 2]
        matches: List[str] = []

        # 1. Search verbatim passages
        for page_num, line in ctx.passages:
            line_lower = line.lower()
            if any(token in line_lower for token in query_tokens):
                matches.append(f"[Page {page_num}] {line}")
                if len(matches) >= 6:
                    break

        # 2. Search structured key values if few verbatim lines found
        if len(matches) < 3 and ctx.result_data:
            glance = ctx.result_data.get("glance", {})
            for kv in glance.get("key_values", []):
                lbl = kv.get("label", "")
                val = kv.get("value", "")
                combined = f"{lbl}: {val}"
                if any(t in combined.lower() for t in query_tokens):
                    matches.append(f"[Summary Fact] {combined}")

            for act in ctx.result_data.get("actions", []):
                txt = act.get("text", "")
                if any(t in txt.lower() for t in query_tokens):
                    due = f" (Due: {act.get('due_date')})" if act.get("due_date") else ""
                    matches.append(f"[Action] {txt}{due}")

        if not matches:
            # Fall back to summary lines if no direct token match
            summary_lines = ctx.result_data.get("summary", [])
            if summary_lines:
                return "No exact phrase match found. Document summary:\n" + "\n".join(f"- {s}" for s in summary_lines[:3])
            return "No matching text found in document."

        return "\n".join(matches)

    def verify_quote(quote: str = "", page: int = 1) -> dict:
        """Verify whether a quote appears verbatim in the document.
        
        Args:
            quote: The exact phrase or sentence to verify.
            page: 1-indexed page number where the quote is expected.
        """
        ctx.tools_used.append("verify_quote")
        clean_quote = (quote or "").strip()
        if not clean_quote:
            return {"quote": quote, "page": page, "evidence": "none"}

        if ctx.is_photo:
            label = "check_original"
        else:
            pages = ctx.pdf_pages_text if ctx.pdf_pages_text else ([ctx.result_data.get("source_text", "")] if ctx.result_data.get("source_text") else [])
            label = evidence.verify_evidence(
                quote=clean_quote,
                item_text="",
                page=page or 1,
                pages_text=pages,
            )

        ctx.last_verified_quote = clean_quote
        ctx.last_verified_page = page
        ctx.last_evidence_label = label
        return {
            "quote": clean_quote,
            "page": page,
            "evidence": label,
        }

    def days_until(date_text: str = "") -> dict:
        """Calculate the remaining days from today (Asia/Kolkata) until date_text.
        
        Args:
            date_text: An ISO date (YYYY-MM-DD) or printed date string (e.g. '05 Dec 2026').
        """
        ctx.tools_used.append("days_until")
        if not date_text or not str(date_text).strip():
            return {"error": "No date provided"}
        d = dates.parse_date(str(date_text))
        if not d:
            return {"error": f"Could not parse date '{date_text}'"}

        today = dates.ist_today()
        status = dates.evaluate_date_status(d.isoformat(), today=today)
        days_left = (d - today).days

        return {
            "iso_date": d.isoformat(),
            "today": today.isoformat(),
            "days_left": days_left,
            "status": status,
        }

    def relative_deadline(quote: str = "", anchor_date: str = "") -> dict:
        """Calculate a relative deadline (e.g. 'within 30 days') from an anchor date.
        
        Args:
            quote: The relative deadline text (e.g. 'within 60 days of the notice').
            anchor_date: The anchor or reference date string (e.g. '2026-10-06').
        """
        ctx.tools_used.append("relative_deadline")
        mode, calc_date, days = dates.resolve_relative_deadline(
            quote=quote or "",
            text=None,
            anchor_date_str=anchor_date or "",
        )
        return {
            "mode": mode,
            "calculated_date": calc_date.isoformat() if calc_date else None,
            "days": days,
        }

    def prepare_calendar_event(title: str = "", date: str = "", note: str = "") -> dict:
        """Draft a calendar event reminder for the user to review and confirm.
        
        Args:
            title: Short event title (maximum 60 characters).
            date: Event date in ISO format YYYY-MM-DD.
            note: Brief one-line note (maximum 120 characters).
        """
        ctx.tools_used.append("prepare_calendar_event")
        draft = {
            "title": (title or "Document Reminder")[:60].strip(),
            "date": (date or "").strip(),
            "note": (note or "")[:120].strip(),
            "action": "draft_event",
        }
        ctx.calendar_draft = draft
        return draft

    return [search_document, verify_quote, days_until, relative_deadline, prepare_calendar_event]
