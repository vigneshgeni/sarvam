"""Storage: in-memory by default; Firestore when ADC + LF_STORE=firestore."""

from __future__ import annotations

import copy
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

IST = timezone(timedelta(hours=5, minutes=30))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None = None) -> str:
    return (dt or utcnow()).astimezone(timezone.utc).isoformat()


class Store(Protocol):
    def upsert_user(self, uid: str, data: dict[str, Any]) -> dict[str, Any]: ...
    def get_user(self, uid: str) -> dict[str, Any] | None: ...
    def delete_user(self, uid: str) -> None: ...
    def put_post(self, post: dict[str, Any]) -> dict[str, Any]: ...
    def get_post(self, post_id: str) -> dict[str, Any] | None: ...
    def delete_post(self, post_id: str) -> None: ...
    def list_posts_by_owner(self, uid: str) -> list[dict[str, Any]]: ...
    def list_open_found(self, city: str | None, category: str | None, since: str | None) -> list[dict[str, Any]]: ...
    def list_open_lost(self) -> list[dict[str, Any]]: ...
    def list_open_found_all(self) -> list[dict[str, Any]]: ...
    def put_photo(self, post_id: str, n: int, rec: dict[str, Any]) -> None: ...
    def get_photo(self, post_id: str, n: int) -> dict[str, Any] | None: ...
    def put_match(self, match: dict[str, Any]) -> dict[str, Any]: ...
    def get_match(self, match_id: str) -> dict[str, Any] | None: ...
    def list_matches_for_uid(self, uid: str) -> list[dict[str, Any]]: ...
    def delete_matches_for_post(self, post_id: str) -> None: ...
    def put_claim(self, claim: dict[str, Any]) -> dict[str, Any]: ...
    def get_claim(self, claim_id: str) -> dict[str, Any] | None: ...
    def get_claim_by_match(self, match_id: str) -> dict[str, Any] | None: ...
    def list_claims_for_match(self, match_id: str) -> list[dict[str, Any]]: ...
    def add_notification(self, uid: str, rec: dict[str, Any]) -> dict[str, Any]: ...
    def list_notifications(self, uid: str) -> list[dict[str, Any]]: ...
    def unread_count(self, uid: str) -> int: ...
    def mark_read(self, uid: str, ids: list[str] | None) -> None: ...
    def add_report(self, rec: dict[str, Any]) -> dict[str, Any]: ...
    def report_count(self, target_type: str, target_id: str) -> int: ...
    def block(self, uid: str, other: str) -> None: ...
    def is_blocked(self, a: str, b: str) -> bool: ...
    def by_request_id(self, uid: str, request_id: str) -> dict[str, Any] | None: ...
    def cascade_delete_user(self, uid: str) -> None: ...


class MemoryStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.users: dict[str, dict[str, Any]] = {}
        self.posts: dict[str, dict[str, Any]] = {}
        self.photos: dict[str, dict[int, dict[str, Any]]] = {}
        self.matches: dict[str, dict[str, Any]] = {}
        self.claims: dict[str, dict[str, Any]] = {}
        self.notifications: dict[str, list[dict[str, Any]]] = {}
        self.reports: list[dict[str, Any]] = []
        self.blocks: dict[str, set[str]] = {}
        self.request_ids: dict[str, str] = {}

    def upsert_user(self, uid: str, data: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            cur = self.users.get(uid, {"uid": uid, "createdAt": iso(), "karma": {"returned": 0}})
            cur.update(data)
            cur["uid"] = uid
            self.users[uid] = cur
            return copy.deepcopy(cur)

    def get_user(self, uid: str) -> dict[str, Any] | None:
        with self._lock:
            rec = self.users.get(uid)
            return copy.deepcopy(rec) if rec else None

    def delete_user(self, uid: str) -> None:
        with self._lock:
            self.users.pop(uid, None)

    def put_post(self, post: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self.posts[post["id"]] = copy.deepcopy(post)
            rid = post.get("requestId")
            if rid:
                self.request_ids[f"{post['ownerUid']}:{rid}"] = post["id"]
            return copy.deepcopy(post)

    def get_post(self, post_id: str) -> dict[str, Any] | None:
        with self._lock:
            rec = self.posts.get(post_id)
            return copy.deepcopy(rec) if rec else None

    def delete_post(self, post_id: str) -> None:
        with self._lock:
            self.posts.pop(post_id, None)
            self.photos.pop(post_id, None)

    def list_posts_by_owner(self, uid: str) -> list[dict[str, Any]]:
        with self._lock:
            rows = [copy.deepcopy(p) for p in self.posts.values() if p.get("ownerUid") == uid]
        rows.sort(key=lambda p: p.get("createdAt") or "", reverse=True)
        return rows

    def list_open_found(self, city: str | None, category: str | None, since: str | None) -> list[dict[str, Any]]:
        with self._lock:
            rows = [
                copy.deepcopy(p)
                for p in self.posts.values()
                if p.get("type") == "found" and p.get("status") == "open"
            ]
        if city:
            rows = [p for p in rows if p.get("city") == city]
        if category:
            rows = [p for p in rows if p.get("category") == category]
        if since:
            rows = [p for p in rows if (p.get("foundAt") or p.get("createdAt") or "") >= since]
        rows.sort(key=lambda p: p.get("createdAt") or "", reverse=True)
        return rows

    def list_open_lost(self) -> list[dict[str, Any]]:
        with self._lock:
            return [
                copy.deepcopy(p)
                for p in self.posts.values()
                if p.get("type") == "lost" and p.get("status") == "open"
            ]

    def list_open_found_all(self) -> list[dict[str, Any]]:
        with self._lock:
            return [
                copy.deepcopy(p)
                for p in self.posts.values()
                if p.get("type") == "found" and p.get("status") == "open"
            ]

    def put_photo(self, post_id: str, n: int, rec: dict[str, Any]) -> None:
        with self._lock:
            self.photos.setdefault(post_id, {})[n] = rec

    def get_photo(self, post_id: str, n: int) -> dict[str, Any] | None:
        with self._lock:
            return copy.deepcopy(self.photos.get(post_id, {}).get(n))

    def put_match(self, match: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            existing = self.matches.get(match["id"])
            if existing:
                merged = copy.deepcopy(existing)
                for key, value in match.items():
                    if key == "state" and existing.get("state") not in {"suggested", None}:
                        continue
                    merged[key] = value
                self.matches[match["id"]] = merged
                return copy.deepcopy(merged)
            self.matches[match["id"]] = copy.deepcopy(match)
            return copy.deepcopy(match)

    def get_match(self, match_id: str) -> dict[str, Any] | None:
        with self._lock:
            rec = self.matches.get(match_id)
            return copy.deepcopy(rec) if rec else None

    def list_matches_for_uid(self, uid: str) -> list[dict[str, Any]]:
        with self._lock:
            rows = [
                copy.deepcopy(m)
                for m in self.matches.values()
                if m.get("lostOwnerUid") == uid or m.get("foundOwnerUid") == uid
            ]
        rows.sort(key=lambda m: m.get("createdAt") or "", reverse=True)
        return rows

    def delete_matches_for_post(self, post_id: str) -> None:
        with self._lock:
            drop = [
                mid
                for mid, m in self.matches.items()
                if m.get("lostPostId") == post_id or m.get("foundPostId") == post_id
            ]
            for mid in drop:
                self.matches.pop(mid, None)

    def put_claim(self, claim: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self.claims[claim["id"]] = copy.deepcopy(claim)
            return copy.deepcopy(claim)

    def get_claim(self, claim_id: str) -> dict[str, Any] | None:
        with self._lock:
            rec = self.claims.get(claim_id)
            return copy.deepcopy(rec) if rec else None

    def get_claim_by_match(self, match_id: str) -> dict[str, Any] | None:
        with self._lock:
            for rec in self.claims.values():
                if rec.get("matchId") == match_id and rec.get("state") != "declined":
                    return copy.deepcopy(rec)
        return None

    def list_claims_for_match(self, match_id: str) -> list[dict[str, Any]]:
        with self._lock:
            return [copy.deepcopy(c) for c in self.claims.values() if c.get("matchId") == match_id]

    def add_notification(self, uid: str, rec: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            rec = {**rec, "id": rec.get("id") or f"n{len(self.notifications.get(uid, []))+1}"}
            self.notifications.setdefault(uid, []).insert(0, rec)
            return copy.deepcopy(rec)

    def list_notifications(self, uid: str) -> list[dict[str, Any]]:
        with self._lock:
            return copy.deepcopy(self.notifications.get(uid, []))

    def unread_count(self, uid: str) -> int:
        with self._lock:
            return sum(1 for n in self.notifications.get(uid, []) if not n.get("read"))

    def mark_read(self, uid: str, ids: list[str] | None) -> None:
        with self._lock:
            for n in self.notifications.get(uid, []):
                if ids is None or n.get("id") in ids:
                    n["read"] = True

    def add_report(self, rec: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self.reports.append(copy.deepcopy(rec))
            return rec

    def report_count(self, target_type: str, target_id: str) -> int:
        with self._lock:
            return sum(
                1
                for r in self.reports
                if r.get("targetType") == target_type and r.get("targetId") == target_id
            )

    def block(self, uid: str, other: str) -> None:
        with self._lock:
            self.blocks.setdefault(uid, set()).add(other)

    def is_blocked(self, a: str, b: str) -> bool:
        with self._lock:
            return b in self.blocks.get(a, set()) or a in self.blocks.get(b, set())

    def by_request_id(self, uid: str, request_id: str) -> dict[str, Any] | None:
        with self._lock:
            pid = self.request_ids.get(f"{uid}:{request_id}")
            if not pid:
                return None
            rec = self.posts.get(pid)
            return copy.deepcopy(rec) if rec else None

    def cascade_delete_user(self, uid: str) -> None:
        with self._lock:
            post_ids = [p["id"] for p in self.posts.values() if p.get("ownerUid") == uid]
            for pid in post_ids:
                self.posts.pop(pid, None)
                self.photos.pop(pid, None)
            drop_m = [
                mid
                for mid, m in self.matches.items()
                if m.get("lostOwnerUid") == uid or m.get("foundOwnerUid") == uid
            ]
            for mid in drop_m:
                self.matches.pop(mid, None)
            drop_c = [
                cid
                for cid, c in self.claims.items()
                if c.get("claimerUid") == uid
            ]
            for cid in drop_c:
                self.claims.pop(cid, None)
            self.notifications.pop(uid, None)
            self.users.pop(uid, None)


_STORE: Store | None = None


def get_store() -> Store:
    global _STORE
    if _STORE is None:
        from lf.config import get_settings

        settings = get_settings()
        if settings.store == "firestore":
            try:
                _STORE = FirestoreStore(settings.collection_prefix)
            except Exception:
                _STORE = MemoryStore()
        else:
            _STORE = MemoryStore()
    return _STORE


def reset_store_for_tests() -> MemoryStore:
    global _STORE
    _STORE = MemoryStore()
    return _STORE  # type: ignore[return-value]


class FirestoreStore:
    """Thin Firestore wrapper. Unused in local demo when ADC is missing."""

    def __init__(self, prefix: str) -> None:
        from google.cloud import firestore  # type: ignore

        self.prefix = prefix or ""
        self.db = firestore.Client()
        raise RuntimeError("Firestore store is documented but local demo uses memory")
