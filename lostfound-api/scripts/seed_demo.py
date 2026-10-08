#!/usr/bin/env python3
"""Seed fictional demo posts. Safe to re-run. Uses the in-memory store when imported from the API."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lf.demo import seed_demo  # noqa: E402
from lf.store import get_store  # noqa: E402


def main() -> None:
    seed_demo()
    store = get_store()
    found = store.list_open_found_all()
    lost = store.list_open_lost()
    print(f"seeded found={len(found)} lost={len(lost)} (fictional TEST data only)")


if __name__ == "__main__":
    main()
