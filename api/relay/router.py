"""FastAPI router for /api/relay/* endpoints."""

from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request

from .models import (
    CreateRoomRequest,
    CreateRoomResponse,
    EndRoomRequest,
    EndRoomResponse,
    JoinRoomRequest,
    JoinRoomResponse,
    UpdateSettingsRequest,
    UpdateSettingsResponse,
)
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
