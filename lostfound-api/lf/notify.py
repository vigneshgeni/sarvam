"""In-app notifications. No email in P1."""

from __future__ import annotations

import uuid

from lf.store import get_store, iso


def notify(uid: str, ntype: str, ref_id: str) -> dict:
    store = get_store()
    rec = {
        "id": uuid.uuid4().hex[:12],
        "type": ntype,
        "refId": ref_id,
        "createdAt": iso(),
        "read": False,
    }
    return store.add_notification(uid, rec)
