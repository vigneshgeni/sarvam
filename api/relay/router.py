"""FastAPI router for /api/relay/* endpoints."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from .models import (
    CreateRoomRequest,
    CreateRoomResponse,
    EndRoomRequest,
    EndRoomResponse,
    JoinRoomRequest,
    JoinRoomResponse,
    TranslateCaptionRequest,
    TranslateCaptionResponse,
    UpdatePermissionsRequest,
    UpdatePermissionsResponse,
    UpdateSettingsRequest,
    UpdateSettingsResponse,
)

logger = logging.getLogger("sarvam-relay")
from .rooms import (
    LiveKitRoomServiceClient,
    RelayRoomStore,
    get_livekit_config,
    mint_guest_token,
    mint_host_token,
)

router = APIRouter(prefix="/api/relay", tags=["relay"])

store = RelayRoomStore()
lk_service = LiveKitRoomServiceClient()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _require_livekit():
    url, key, secret = get_livekit_config()
    if not (url and key and secret):
        raise HTTPException(
            status_code=503,
            detail={"code": "livekit_not_configured", "message": "Video rooms are not configured on this server."},
        )
    return url, key, secret


def _build_join_url(request: Request, code: str) -> str:
    public_origin = os.environ.get("RELAY_PUBLIC_ORIGIN", "").strip().rstrip("/")
    if not public_origin:
        origin = request.headers.get("origin", "").strip().rstrip("/")
        if origin.startswith("http://") or origin.startswith("https://"):
            public_origin = origin
    if public_origin:
        return f"{public_origin}/r/{code}"
    return f"/r/{code}"


@router.get("/health")
async def relay_health():
    url, key, secret = get_livekit_config()
    return {
        "ok": True,
        "livekitConfigured": bool(url and key and secret),
    }


@router.post("/rooms", response_model=CreateRoomResponse)
async def create_room(body: CreateRoomRequest, request: Request):
    url, key, secret = _require_livekit()
    ip = _client_ip(request)
    if not store.check_and_record_rate_limit(ip):
        raise HTTPException(
            status_code=429,
            detail={"code": "rate_limited", "message": "Too many rooms created. Please try again later."},
        )

    room = store.create_room(host_name=body.hostName, language=body.language)
    await lk_service.ensure_room_metadata(room)
    token = mint_host_token(room, api_key=key, api_secret=secret)

    return CreateRoomResponse(
        code=room.code,
        joinUrl=_build_join_url(request, room.code),
        hostKey=room.host_key,
        livekitUrl=url,
        token=token,
        expiresAt=int(room.expires_at),
    )


@router.post("/join", response_model=JoinRoomResponse)
async def join_room(body: JoinRoomRequest):
    url, key, secret = _require_livekit()
    room, guest_identity, err = store.join_guest(code=body.code, guest_name=body.name)
    if err == "not_found":
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Room not found. Check the 4-letter code and try again."},
        )
    if err == "expired":
        raise HTTPException(
            status_code=410,
            detail={"code": "expired", "message": "This room has expired. Ask the host for a new link."},
        )
    if err == "ended":
        raise HTTPException(
            status_code=410,
            detail={"code": "ended", "message": "This room has ended."},
        )
    if err == "full":
        raise HTTPException(
            status_code=409,
            detail={"code": "full", "message": "This room is full (maximum 3 guests)."},
        )
    assert room is not None and guest_identity is not None

    token = mint_guest_token(
        room=room,
        guest_identity=guest_identity,
        guest_name=body.name,
        language=body.language,
        api_key=key,
        api_secret=secret,
    )
    return JoinRoomResponse(
        code=room.code,
        livekitUrl=url,
        token=token,
        allowGuestCamera=room.allow_guest_camera,
        hostName=room.host_name,
        guestIdentity=guest_identity,
    )


@router.post("/settings", response_model=UpdateSettingsResponse)
async def update_settings(
    body: UpdateSettingsRequest,
    x_host_key: Optional[str] = Header(default=None, alias="X-Host-Key"),
):
    if not x_host_key:
        raise HTTPException(status_code=401, detail={"code": "missing_host_key", "message": "Host key is required."})
    room = store.update_settings(host_key=x_host_key, allow_guest_camera=body.allowGuestCamera, code=body.code)
    if not room:
        raise HTTPException(status_code=403, detail={"code": "invalid_host_key", "message": "Invalid host key."})
    await lk_service.update_room_metadata(room)
    return UpdateSettingsResponse(code=room.code, allowGuestCamera=room.allow_guest_camera)


@router.post("/end", response_model=EndRoomResponse)
async def end_room(
    body: Optional[EndRoomRequest] = None,
    x_host_key: Optional[str] = Header(default=None, alias="X-Host-Key"),
):
    if not x_host_key:
        raise HTTPException(status_code=401, detail={"code": "missing_host_key", "message": "Host key is required."})
    code = body.code if body else None
    room = store.end_room(host_key=x_host_key, code=code)
    if not room:
        raise HTTPException(status_code=403, detail={"code": "invalid_host_key", "message": "Invalid host key."})
    await lk_service.update_room_metadata(room)
    await lk_service.delete_room(room.room_name)
    return EndRoomResponse(ok=True, code=room.code)


@router.post("/permissions", response_model=UpdatePermissionsResponse)
async def update_permissions(
    body: UpdatePermissionsRequest,
    x_host_key: Optional[str] = Header(default=None, alias="X-Host-Key"),
):
    if not x_host_key:
        raise HTTPException(status_code=401, detail={"code": "missing_host_key", "message": "Host key is required."})
    room = store.get_by_host_key(host_key=x_host_key, code=body.code)
    if not room:
        raise HTTPException(status_code=403, detail={"code": "invalid_host_key", "message": "Invalid host key."})
    await lk_service.update_participant_camera_permission(
        room_name=room.room_name,
        identity=body.identity,
        can_publish_camera=body.canPublishCamera,
    )
    return UpdatePermissionsResponse(
        ok=True,
        identity=body.identity,
        canPublishCamera=body.canPublishCamera,
    )


def _translate_caption_sync(text: str, from_lang: str, to_lang: str) -> str:
    """Translate one short caption via Vertex Gemini Flash (api/reader.py get_client)."""
    from reader import get_client  # Lazy import to reuse existing Vertex client

    client = get_client()
    prompt = (
        f"Translate the following spoken caption from {from_lang} to {to_lang}. "
        "Keep names, numbers and dates exact. Return ONLY the translated text with no quotes or emoji.\n\n"
        f"{text}"
    )
    resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    out = (getattr(resp, "text", None) or "").strip()
    return out or text


@router.post("/translate", response_model=TranslateCaptionResponse)
async def translate_caption(body: TranslateCaptionRequest):
    if body.from_lang.lower() == body.to_lang.lower():
        return TranslateCaptionResponse(translated=body.text, fallback=False)
    try:
        translated = await asyncio.wait_for(
            run_in_threadpool(_translate_caption_sync, body.text, body.from_lang, body.to_lang),
            timeout=2.0,
        )
        return TranslateCaptionResponse(translated=translated, fallback=False)
    except Exception as exc:
        logger.info("relay_translate_fallback kind=%s", type(exc).__name__)
        return TranslateCaptionResponse(translated=body.text, fallback=True)
