"""In-memory Live Relay room store, rate limiter, and LiveKit Cloud helpers.

Per docs/buildathon/09_UPDATE_SAME_PROJECT.md:
- No Firestore collection; room state lives in memory and is mirrored into
  LiveKit room metadata so public state survives restarts.
- Secrets (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) come ONLY from
  environment variables and are never logged.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
import datetime
import json
import logging
import os
import secrets
import time
from typing import Dict, List, Optional, Tuple

from livekit import api as lk_api
from livekit.protocol import models as lk_models

logger = logging.getLogger("sarvam-relay")

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 4
INITIAL_TTL_SEC = 30 * 60       # 30 minutes
MAX_LIFETIME_SEC = 3 * 60 * 60  # 3 hours cap
MAX_GUESTS = 3
RATE_LIMIT_MAX_PER_HOUR = 30
RATE_LIMIT_WINDOW_SEC = 3600


def get_livekit_config() -> Tuple[str, str, str]:
    url = os.environ.get("LIVEKIT_URL", "").strip()
    key = os.environ.get("LIVEKIT_API_KEY", "").strip()
    secret = os.environ.get("LIVEKIT_API_SECRET", "").strip()
    return url, key, secret


def livekit_http_url(ws_url: str) -> str:
    if ws_url.startswith("wss://"):
        return "https://" + ws_url[len("wss://"):]
    if ws_url.startswith("ws://"):
        return "http://" + ws_url[len("ws://"):]
    return ws_url


def normalize_code(raw: str) -> str:
    return "".join(ch for ch in (raw or "").upper().strip() if ch.isalnum())


def generate_room_code(existing: Dict[str, "RelayRoom"]) -> str:
    for _ in range(200):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if code not in existing:
            return code
    raise RuntimeError("Unable to allocate unique room code")


@dataclass
class RelayRoom:
    code: str
    room_name: str
    host_name: str
    host_language: str
    host_key: str
    created_at: float
    expires_at: float
    allow_guest_camera: bool = False
    ended: bool = False
    guests: List[str] = field(default_factory=list)

    @property
    def member_count(self) -> int:
        return 1 + len(self.guests)

    def public_metadata_json(self) -> str:
        return json.dumps({
            "code": self.code,
            "allowGuestCamera": self.allow_guest_camera,
            "ended": self.ended,
            "hostName": self.host_name,
        })

    def is_expired(self, now: float) -> bool:
        return now >= self.expires_at

    def touch(self, now: float) -> None:
        max_exp = self.created_at + MAX_LIFETIME_SEC
        self.expires_at = min(max_exp, max(self.expires_at, now + INITIAL_TTL_SEC))


class RelayRoomStore:
    def __init__(self, clock=time.time) -> None:
        self._clock = clock
        self._rooms: Dict[str, RelayRoom] = {}
        self._by_host_key: Dict[str, str] = {}
        self._ip_creations: Dict[str, List[float]] = defaultdict(list)

    def clear(self) -> None:
        self._rooms.clear()
        self._by_host_key.clear()
        self._ip_creations.clear()

    def check_and_record_rate_limit(self, client_ip: str) -> bool:
        now = self._clock()
        cutoff = now - RATE_LIMIT_WINDOW_SEC
        history = [ts for ts in self._ip_creations[client_ip] if ts > cutoff]
        self._ip_creations[client_ip] = history
        if len(history) >= RATE_LIMIT_MAX_PER_HOUR:
            return False
        history.append(now)
        return True

    def create_room(self, host_name: str, language: str) -> RelayRoom:
        now = self._clock()
        self._prune_stale(now)
        code = generate_room_code(self._rooms)
        host_key = secrets.token_urlsafe(32)
        room = RelayRoom(
            code=code,
            room_name=f"relay-{code}",
            host_name=host_name.strip() or "Host",
            host_language=language.strip() or "en",
            host_key=host_key,
            created_at=now,
            expires_at=now + INITIAL_TTL_SEC,
        )
        self._rooms[code] = room
        self._by_host_key[host_key] = code
        logger.info("relay_room_created code=%s count=%d", code, len(self._rooms))
        return room

    def get_room(self, code: str) -> Optional[RelayRoom]:
        norm = normalize_code(code)
        return self._rooms.get(norm)

    def get_by_host_key(self, host_key: str, code: Optional[str] = None) -> Optional[RelayRoom]:
        if not host_key:
            return None
        mapped_code = self._by_host_key.get(host_key)
        if not mapped_code:
            return None
        if code and normalize_code(code) != mapped_code:
            return None
        room = self._rooms.get(mapped_code)
        if room and secrets.compare_digest(room.host_key, host_key):
            return room
        return None

    def join_guest(self, code: str, guest_name: str) -> Tuple[Optional[RelayRoom], Optional[str], Optional[str]]:
        """Returns (room, guest_identity, error_code)."""
        now = self._clock()
        room = self.get_room(code)
        if not room:
            return None, None, "not_found"
        if room.ended:
            return None, None, "ended"
        if room.is_expired(now):
            return None, None, "expired"
        if len(room.guests) >= MAX_GUESTS:
            return None, None, "full"

        guest_identity = f"guest-{len(room.guests) + 1}-{secrets.token_hex(3)}"
        room.guests.append(guest_identity)
        room.touch(now)
        logger.info("relay_guest_joined code=%s members=%d", room.code, room.member_count)
        return room, guest_identity, None

    def update_settings(self, host_key: str, allow_guest_camera: bool, code: Optional[str] = None) -> Optional[RelayRoom]:
        room = self.get_by_host_key(host_key, code)
        if not room:
            return None
        room.allow_guest_camera = allow_guest_camera
        room.touch(self._clock())
        return room

    def end_room(self, host_key: str, code: Optional[str] = None) -> Optional[RelayRoom]:
        room = self.get_by_host_key(host_key, code)
        if not room:
            return None
        room.ended = True
        logger.info("relay_room_ended code=%s", room.code)
        return room

    def _prune_stale(self, now: float) -> None:
        # Keep recently ended/expired rooms for 15 min so guests see clear "ended"/"expired" errors
        stale_codes = [
            c for c, r in self._rooms.items()
            if (r.ended or r.is_expired(now)) and (now - r.expires_at > 900)
        ]
        for c in stale_codes:
            room = self._rooms.pop(c, None)
            if room:
                self._by_host_key.pop(room.host_key, None)


def mint_host_token(
    room: RelayRoom,
    api_key: str,
    api_secret: str,
) -> str:
    grants = lk_api.VideoGrants(
        room_join=True,
        room=room.room_name,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
    )
    meta = json.dumps({
        "role": "host",
        "name": room.host_name,
        "lang": room.host_language,
    })
    return (
        lk_api.AccessToken(api_key, api_secret)
        .with_identity(f"host-{room.code}")
        .with_name(room.host_name)
        .with_metadata(meta)
        .with_ttl(datetime.timedelta(hours=3))
        .with_grants(grants)
        .to_jwt()
    )


def mint_guest_token(
    room: RelayRoom,
    guest_identity: str,
    guest_name: str,
    language: str,
    api_key: str,
    api_secret: str,
) -> str:
    # Guest starts with microphone publish only; camera publish granted later via server permission update (P3)
    grants = lk_api.VideoGrants(
        room_join=True,
        room=room.room_name,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
        can_publish_sources=["microphone"],
    )
    meta = json.dumps({
        "role": "guest",
        "name": guest_name.strip() or "Guest",
        "lang": language.strip() or "en",
    })
    return (
        lk_api.AccessToken(api_key, api_secret)
        .with_identity(guest_identity)
        .with_name(guest_name.strip() or "Guest")
        .with_metadata(meta)
        .with_ttl(datetime.timedelta(hours=3))
        .with_grants(grants)
        .to_jwt()
    )


class LiveKitRoomServiceClient:
    """Thin async wrapper around LiveKitAPI room operations (easily mocked in pytest)."""

    async def ensure_room_metadata(self, room: RelayRoom) -> None:
        url, key, secret = get_livekit_config()
        if not (url and key and secret):
            return
        lk = lk_api.LiveKitAPI(livekit_http_url(url), key, secret)
        try:
            await lk.room.create_room(
                lk_api.CreateRoomRequest(
                    name=room.room_name,
                    empty_timeout=INITIAL_TTL_SEC,
                    max_participants=MAX_GUESTS + 2,
                    metadata=room.public_metadata_json(),
                )
            )
        except Exception as exc:
            logger.info("livekit_create_room_note kind=%s", type(exc).__name__)
        finally:
            await lk.aclose()

    async def update_room_metadata(self, room: RelayRoom) -> None:
        url, key, secret = get_livekit_config()
        if not (url and key and secret):
            return
        lk = lk_api.LiveKitAPI(livekit_http_url(url), key, secret)
        try:
            await lk.room.update_room_metadata(
                lk_api.UpdateRoomMetadataRequest(
                    room=room.room_name,
                    metadata=room.public_metadata_json(),
                )
            )
        except Exception as exc:
            logger.info("livekit_update_meta_note kind=%s", type(exc).__name__)
        finally:
            await lk.aclose()

    async def delete_room(self, room_name: str) -> None:
        url, key, secret = get_livekit_config()
        if not (url and key and secret):
            return
        lk = lk_api.LiveKitAPI(livekit_http_url(url), key, secret)
        try:
            await lk.room.delete_room(lk_api.DeleteRoomRequest(room=room_name))
        except Exception as exc:
            logger.info("livekit_delete_room_note kind=%s", type(exc).__name__)
        finally:
            await lk.aclose()

    async def update_participant_camera_permission(
        self,
        room_name: str,
        identity: str,
        can_publish_camera: bool,
    ) -> None:
        url, key, secret = get_livekit_config()
        if not (url and key and secret):
            return
        sources = (
            [lk_models.TrackSource.MICROPHONE, lk_models.TrackSource.CAMERA]
            if can_publish_camera
            else [lk_models.TrackSource.MICROPHONE]
        )
        lk = lk_api.LiveKitAPI(livekit_http_url(url), key, secret)
        try:
            await lk.room.update_participant(
                lk_api.UpdateParticipantRequest(
                    room=room_name,
                    identity=identity,
                    permission=lk_api.ParticipantPermission(
                        can_subscribe=True,
                        can_publish=True,
                        can_publish_data=True,
                        can_publish_sources=sources,
                    ),
                )
            )
        except Exception as exc:
            logger.info("livekit_update_perm_note kind=%s", type(exc).__name__)
        finally:
            await lk.aclose()
