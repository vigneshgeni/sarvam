"""Pydantic request models. Identifier plaintext is accepted only on create and then discarded."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from lf.config import CATEGORIES, HELD_AT
from lf.pii import CardNumberRejected, reject_card_numbers


class IdentifierIn(BaseModel):
    idType: str
    idNumber: str | None = None
    last4: str | None = None
    birthYear: str | None = None


class PoliceReportIn(BaseModel):
    kind: Literal["e_lost", "fir", "other"] = "other"
    number: str | None = None
    date: str | None = None
    station: str | None = None
    selfDeclared: bool = True


class PostIn(BaseModel):
    type: Literal["lost", "found"]
    category: str
    title: str
    publicDescription: str = ""
    privateDescription: str = ""
    city: str
    area: str | None = None
    lat: float | None = None
    lng: float | None = None
    radiusKm: int | None = None
    dateFrom: str | None = None
    dateTo: str | None = None
    foundAt: str | None = None
    heldAt: str | None = None
    identifiers: list[IdentifierIn] = Field(default_factory=list)
    nameOnItem: str | None = None
    questions: list[str] = Field(default_factory=list)
    policeReport: PoliceReportIn | None = None
    publicPhoto: bool = True
    consent: bool = False
    ageConfirmed: bool = False
    autoMatchIds: bool = True
    requestId: str | None = None
    lang: str = "en"

    @field_validator("category")
    @classmethod
    def cat_ok(cls, value: str) -> str:
        if value not in CATEGORIES:
            raise ValueError("unknown_category")
        return value

    @field_validator("heldAt")
    @classmethod
    def held_ok(cls, value: str | None) -> str | None:
        if value is None or value in HELD_AT:
            return value
        raise ValueError("unknown_held_at")

    @field_validator("title", "publicDescription", "privateDescription", "area")
    @classmethod
    def no_cards(cls, value: str | None) -> str | None:
        reject_card_numbers(value)
        return value


class ProfileIn(BaseModel):
    displayName: str | None = None
    upiVpa: str | None = None
    phone: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    consent: bool | None = None
    ageConfirmed: bool | None = None

    @field_validator("displayName")
    @classmethod
    def first_name_only(cls, value: str | None) -> str | None:
        if not value:
            return value
        return value.strip().split()[0][:40]


class ClaimIn(BaseModel):
    postId: str | None = None
    matchId: str | None = None
    answers: list[str] = Field(default_factory=list)
    message: str | None = None
    policeReport: PoliceReportIn | None = None

    @field_validator("answers")
    @classmethod
    def cap_answers(cls, value: list[str]) -> list[str]:
        reject_card_numbers(*value)
        return [a.strip()[:300] for a in value[:3]]

    @field_validator("message")
    @classmethod
    def cap_msg(cls, value: str | None) -> str | None:
        reject_card_numbers(value)
        return (value or "")[:300] or None


class DecisionIn(BaseModel):
    decision: Literal["approve", "decline"]
    reason: str | None = None


class ShareIn(BaseModel):
    channels: list[Literal["phone", "whatsapp", "email"]]


class ReportIn(BaseModel):
    targetType: Literal["post", "claim", "user"]
    targetId: str
    reason: str


class BlockIn(BaseModel):
    uid: str


def error_body(code: str, message: str) -> dict[str, Any]:
    return {"error": code, "message": message}


__all__ = [
    "IdentifierIn",
    "PoliceReportIn",
    "PostIn",
    "ProfileIn",
    "ClaimIn",
    "DecisionIn",
    "ShareIn",
    "ReportIn",
    "BlockIn",
    "CardNumberRejected",
    "error_body",
]
