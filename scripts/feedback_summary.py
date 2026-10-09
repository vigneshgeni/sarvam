#!/usr/bin/env python3
"""Count feedback ratings. Skips documents with sample=true.

Uses Application Default Credentials. Does not print document text.
"""

from __future__ import annotations

import os
from collections import Counter
from typing import Iterable, Mapping


DOC_TYPES = (
    "utility_bill",
    "telecom_bill",
    "tax_receipt",
    "insurance",
    "bank",
    "government_notice",
    "court_legal",
    "challan",
    "medical",
    "receipt",
    "agreement",
    "corporate",
    "other",
    "unknown",
)


def stored_doc_type(value: object) -> str:
    if isinstance(value, str) and value in DOC_TYPES:
        return value
    return "unknown"


def summarize(documents: Iterable[Mapping[str, object]]) -> dict[str, object]:
    rating: Counter[str] = Counter()
    language: Counter[str] = Counter()
    reasons: Counter[str] = Counter()
    doc_type: Counter[str] = Counter()
    included = 0
    excluded_sample = 0

    for data in documents:
        if data.get("sample") is True:
            excluded_sample += 1
            continue
        included += 1
        rating[str(data.get("rating", "unknown"))] += 1
        language[str(data.get("lang", "unknown"))] += 1
        doc_type[stored_doc_type(data.get("docType"))] += 1
        if data.get("rating") == "down":
            raw = data.get("reasons") or []
            if isinstance(raw, list):
                for code in raw:
                    reasons[str(code)] += 1

    return {
        "included": included,
        "excluded_sample": excluded_sample,
        "rating": dict(rating),
        "language": dict(language),
        "doc_type": dict(doc_type),
        "reasons": dict(reasons),
    }


def format_summary(summary: Mapping[str, object]) -> str:
    lines = [
        f"included: {summary['included']}",
        f"excluded_sample: {summary['excluded_sample']}",
        "rating:",
    ]
    rating = summary["rating"]
    language = summary["language"]
    reasons = summary["reasons"]
    if isinstance(rating, dict):
        for key in sorted(rating):
            lines.append(f"  {key}: {rating[key]}")
    lines.append("language:")
    if isinstance(language, dict):
        for key in sorted(language):
            lines.append(f"  {key}: {language[key]}")
    lines.append("doc_type:")
    doc_type = summary["doc_type"]
    if isinstance(doc_type, dict):
        if not doc_type:
            lines.append("  (none)")
        for key in sorted(doc_type):
            lines.append(f"  {key}: {doc_type[key]}")
    lines.append("reasons:")
    if isinstance(reasons, dict):
        if not reasons:
            lines.append("  (none)")
        for key in sorted(reasons):
            lines.append(f"  {key}: {reasons[key]}")
    return "\n".join(lines)


def main() -> None:
    from google.cloud import firestore

    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "sarvam-510715")
    client = firestore.Client(project=project)
    documents = (doc.to_dict() or {} for doc in client.collection("feedback").stream())
    print(format_summary(summarize(documents)))


if __name__ == "__main__":
    main()
