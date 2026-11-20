"""Pydantic models for the Live Relay API."""

from typing import Optional
from pydantic import BaseModel, Field


class CreateRoomRequest(BaseModel):
    hostName: str = Field(default="Host", min_length=1, max_length=60)
    language: str = Field(default="en", max_length=16)


class CreateRoomResponse(BaseModel):
    code: str
    joinUrl: str
    hostKey: str
    livekitUrl: str
    token: str
    expiresAt: int


class JoinRoomRequest(BaseModel):
    code: str = Field(min_length=4, max_length=8)
    name: str = Field(min_length=1, max_length=60)
    language: str = Field(default="en", max_length=16)


class JoinRoomResponse(BaseModel):
    code: str
    livekitUrl: str
    token: str
    allowGuestCamera: bool
    hostName: str
    guestIdentity: str


class UpdateSettingsRequest(BaseModel):
    code: Optional[str] = None
    allowGuestCamera: bool


class UpdateSettingsResponse(BaseModel):
    code: str
    allowGuestCamera: bool


class EndRoomRequest(BaseModel):
    code: Optional[str] = None


class EndRoomResponse(BaseModel):
    ok: bool
    code: str
