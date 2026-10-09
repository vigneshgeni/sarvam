#!/usr/bin/env python3
"""Count feedback ratings. Skips documents with sample=true.

Uses Application Default Credentials. Does not print document text.
"""

from __future__ import annotations

import os
from collections import Counter
from typing import Iterable, Mapping


def summarize(documents: Iterable[Mapping[str, object]]) -> dict[str, object]:
    rating: Counter[str] = Counter()
    language: Counter[str] = Counter()
    reasons: Counter[str] = Counter()
    included = 0
    excluded_sample = 0

    for data in documents:
        if data.get("sample") is True:
            excluded_sample += 1
            continue
        included += 1
        rating[str(data.get("rating", "unknown"))] += 1
        language[str(data.get("lang", "unknown"))] += 1
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
