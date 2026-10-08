"""sarvam-lf-api: Lost & Found. Stores posts. Explain API is a different service."""

from __future__ import annotations

import asyncio
import io
import json
import logging
import uuid
from datetime import date, timedelta
from typing import Any

from fastapi import Depends, FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError

from lf.auth import Principal, mint_demo_guest, optional_user, require_user
from lf.config import ID_CATEGORIES, get_settings
from lf.crypto import decrypt_field, encrypt_field
from lf.demo import DEMO_FINDER_UID, demo_finder_respond, seed_demo
from lf.dicts import tokens_from
from lf.extract import extract_from_image
from lf.geo import city_centre, geohash_encode, lookup_city
from lf.ids import (
    aadhaar_lite_key,
    last4_masked,
    match_key,
    name_keys,
    normalize_id,
    validate_id,
)
from lf.matching import decide, is_candidate
from lf.models import (
    BlockIn,
    ClaimIn,
    DecisionIn,
    PostIn,
    ProfileIn,
    ReportIn,
    ShareIn,
    error_body,
)
from lf.notify import notify
from lf.pii import CardNumberRejected, mask_pii, reject_card_numbers, sanitise_private, sanitise_public, sanitise_title
from lf.ratelimit import limiter
from lf.serializers import claim_view, match_view, owner_view, public_card
from lf.store import get_store, iso, utcnow

logging.basicConfig(level=logging.INFO, format="%(name)s %(levelname)s %(message)s")
log = logging.getLogger("lf")


class RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        banned = ("Z1234567", "Z7654321", "+91", "@gmail", "Aadhaar", "aadhaar")
        # Still allow the word Aadhaar in reason codes; block digit-like payloads.
        if any(ch.isdigit() for ch in msg) and ("body" in msg.lower() or "idNumber" in msg):
            record.msg = "redacted"
            record.args = ()
        for token in banned:
            if token in msg and any(c.isdigit() for c in msg):
                record.msg = "redacted"
                record.args = ()
                break
        return True


log.addFilter(RedactFilter())
logging.getLogger("lf.auth").addFilter(RedactFilter())
logging.getLogger("lf.demo").addFilter(RedactFilter())

settings = get_settings()
app = FastAPI(title="sarvam-lf-api", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    from fastapi import HTTPException
    from starlette.exceptions import HTTPException as StarletteHTTPException

    if isinstance(exc, (HTTPException, StarletteHTTPException)):
        detail = exc.detail
        if isinstance(detail, dict) and "error" in detail:
            return JSONResponse(status_code=exc.status_code, content=detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body("http_error", str(detail)),
        )
    log.info("unhandled_error type=%s", type(exc).__name__)
    return JSONResponse(status_code=500, content=error_body("server_error", "Something went wrong."))


@app.middleware("http")
async def no_store_headers(request: Request, call_next):
    path = request.url.path
    # Never log request bodies.
    log.info("req %s %s", request.method, path)
    response = await call_next(request)
    if not path.startswith("/lf/photos/") and path != "/lf/feed":
        response.headers["Cache-Control"] = "no-store"
    return response


@app.on_event("startup")
def on_startup() -> None:
    if settings.port != 8100:
        log.info("listen_port=%s (override PORT; default 8100)", settings.port)
    if settings.demo_mode:
        seed_demo()
        log.info(
            "demo_mode=true store=%s aadhaar_lite=%s pepper_demo=%s",
            settings.store,
            settings.aadhaar_lite,
            settings.demo_pepper,
        )


def fail(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content=error_body(code, message))


@app.get("/lf/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "sarvam-lf-api",
        "demoMode": settings.demo_mode,
        "aadhaarLite": settings.aadhaar_lite,
        "store": settings.store,
        "port": settings.port,
        "firebase": False if settings.demo_mode else None,
    }


@app.post("/lf/demo/guest")
def demo_guest() -> dict[str, Any]:
    if not settings.demo_mode:
        return fail(403, "demo_disabled", "Demo guests are only available when LF_DEMO_MODE is true")
    token, principal = mint_demo_guest()
    return {"token": token, "uid": principal.uid, "guest": True, "label": "Demo guest"}


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _rate(request: Request, user: Principal | None, bucket: str, limit: int, window: int) -> bool:
    key_id = user.uid if user else _client_ip(request)
    return limiter.hit(f"{bucket}:{key_id}", limit, window)


def _fingerprint_identifiers(raw_list: list[Any], category: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in raw_list[:3]:
        id_type = item.idType
        if id_type in {"aadhaar", "aadhaar_card"}:
            if not settings.aadhaar_lite:
                continue
            last4 = item.last4 or (normalize_id(item.idNumber or "")[-4:] if item.idNumber else "")
            key = aadhaar_lite_key(settings.id_pepper, last4, item.birthYear or "")
            out.append({"idType": "aadhaar_lite", "matchKey": key, "pv": settings.pepper_version})
            continue
        if not item.idNumber:
            continue
        normalised = validate_id(id_type, item.idNumber)
        out.append(
            {
                "idType": id_type,
                "matchKey": match_key(settings.id_pepper, id_type, normalised),
                "pv": settings.pepper_version,
                "last4Masked": last4_masked(id_type, normalised),
            }
        )
    if category == "aadhaar_card" and not settings.aadhaar_lite:
        return []
    return out


def _process_photos(files: list[UploadFile]) -> list[dict[str, Any]]:
    from PIL import Image

    out: list[dict[str, Any]] = []
    for upload in files[:3]:
        raw = upload.file.read()
        if len(raw) > 2_000_000:
            raise ValueError("photo_too_large")
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")
        img.thumbnail((800, 800))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70, optimize=True)
        data = buf.getvalue()
        if len(data) > 150_000:
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=55, optimize=True)
            data = buf.getvalue()
        import base64

        out.append(
            {
                "mime": "image/jpeg",
                "dataB64": base64.b64encode(data).decode("ascii"),
                "w": img.width,
                "h": img.height,
            }
        )
    return out


def _locate(payload: PostIn) -> dict[str, Any]:
    city = lookup_city(payload.city)
    city_key = city["key"] if city else (payload.city or "other").lower()
    lat, lng = payload.lat, payload.lng
    if lat is None or lng is None:
        centre = city_centre(city_key)
        if centre:
            lat, lng = centre
    geo7 = geohash_encode(lat, lng) if lat is not None and lng is not None else None
    return {"city": city_key, "lat": lat, "lng": lng, "geo7": geo7}


def _run_matching(post: dict[str, Any]) -> list[dict[str, Any]]:
    store = get_store()
    others = store.list_open_found_all() if post["type"] == "lost" else store.list_open_lost()
    created: list[dict[str, Any]] = []
    for other in others:
        if store.is_blocked(post["ownerUid"], other.get("ownerUid") or ""):
            continue
        lost, found = (post, other) if post["type"] == "lost" else (other, post)
        if not is_candidate(post, other):
            continue
        result = decide(lost, found, threshold=settings.match_threshold)
        if not result:
            continue
        rec = {
            "id": result["id"],
            "lostPostId": lost["id"],
            "foundPostId": found["id"],
            "lostOwnerUid": lost["ownerUid"],
            "foundOwnerUid": found["ownerUid"],
            "kind": result["kind"],
            "score": result["score"],
            "reasons": result["reasons"],
            "state": "suggested",
            "createdAt": iso(),
        }
        stored = store.put_match(rec)
        notify(lost["ownerUid"], "match_suggested", stored["id"])
        notify(found["ownerUid"], "match_suggested", stored["id"])
        created.append(stored)
    return created


@app.post("/lf/posts")
async def create_post(
    request: Request,
    user: Principal = Depends(require_user),
    data: str = Form(...),
    photos: list[UploadFile] | None = File(default=None),
):
    if not _rate(request, user, "posts", 5, 86400):
        return fail(429, "rate_limited", "You can post 5 times a day.")
    try:
        payload = PostIn.model_validate_json(data)
    except CardNumberRejected as exc:
        return fail(400, "card_number_forbidden", str(exc))
    except ValidationError as exc:
        blob = str(exc)
        if "card_number_forbidden" in blob or "card number" in blob.lower():
            return fail(400, "card_number_forbidden", "That looks like a bank card number. Sarvam never accepts card numbers.")
        return fail(422, "invalid_post", "Check the form and try again.")
    try:
        reject_card_numbers(
            payload.title,
            payload.publicDescription,
            payload.privateDescription,
            *(payload.questions or []),
        )
    except CardNumberRejected as exc:
        return fail(400, "card_number_forbidden", str(exc))
    if not payload.consent or not payload.ageConfirmed:
        return fail(400, "consent_required", "Confirm you are 18 or older and agree to the privacy notice.")
    store = get_store()
    if payload.requestId:
        existing = store.by_request_id(user.uid, payload.requestId)
        if existing:
            return {"post": owner_view(existing), "matches": []}
    mine = store.list_posts_by_owner(user.uid)
    active_lost = sum(1 for p in mine if p.get("type") == "lost" and p.get("status") == "open")
    active_found = sum(1 for p in mine if p.get("type") == "found" and p.get("status") == "open")
    if payload.type == "lost" and active_lost >= 3:
        return fail(409, "cap_lost", "You already have 3 open lost posts.")
    if payload.type == "found" and active_found >= 5:
        return fail(409, "cap_found", "You already have 5 open found posts.")
    duplicate = any(
        p.get("category") == payload.category
        and p.get("status") == "open"
        and (utcnow().isoformat()[:10] == (p.get("createdAt") or "")[:10])
        for p in mine
    )
    loc = _locate(payload)
    title = sanitise_title(payload.title)
    public = sanitise_public(payload.publicDescription)
    private = sanitise_private(payload.privateDescription)
    try:
        identifiers = _fingerprint_identifiers(payload.identifiers, payload.category) if payload.autoMatchIds else []
    except ValueError:
        return fail(400, "invalid_id_format", "That ID number does not look right. Check it against the original.")
    names = name_keys(settings.id_pepper, payload.nameOnItem or "")
    public_photo = bool(payload.publicPhoto)
    if payload.category in ID_CATEGORIES:
        public_photo = False
    processed = []
    if photos:
        try:
            processed = _process_photos(photos)
        except ValueError:
            return fail(400, "photo_rejected", "Use a JPEG or PNG under 150 KB after resize.")
        except Exception:
            return fail(400, "photo_rejected", "Could not read that photo.")
    ttl_days = 1 if user.guest else settings.post_ttl_days
    if payload.type == "lost":
        date_from, date_to = payload.dateFrom, payload.dateTo
        if not date_from:
            date_from = (date.today() - timedelta(days=14)).isoformat()
            date_to = date.today().isoformat()
        found_at = None
        held = None
        questions = None
    else:
        date_from = date_to = None
        found_at = payload.foundAt or date.today().isoformat()
        held = payload.heldAt or "with_me"
        qs = [q.strip()[:200] for q in (payload.questions or []) if q.strip()][:3]
        if not qs:
            return fail(400, "questions_required", "Add 1 to 3 private questions only the owner could answer.")
        questions = {"questions": qs}
    post = {
        "id": uuid.uuid4().hex[:16],
        "type": payload.type,
        "status": "open",
        "ownerUid": user.uid,
        "category": payload.category,
        "title": title,
        "publicDescription": public,
        "privateDescription": private,
        **loc,
        "area": mask_pii(payload.area or "")[:80] or None,
        "radiusKm": payload.radiusKm if payload.type == "lost" else None,
        "dateFrom": date_from,
        "dateTo": date_to,
        "foundAt": found_at,
        "heldAt": held,
        "identifiers": identifiers,
        "nameKeys": names,
        "keywords": sorted(tokens_from(title, public, private)),
        "photoCount": len(processed),
        "publicPhoto": public_photo,
        "verification": questions,
        "policeReport": payload.policeReport.model_dump() if payload.policeReport else None,
        "demo": user.demo or settings.demo_mode and user.guest,
        "guest": user.guest,
        "reportCount": 0,
        "createdAt": iso(),
        "expiresAt": iso(utcnow() + timedelta(days=ttl_days)),
        "requestId": payload.requestId,
        "lang": payload.lang,
    }
    store.put_post(post)
    for i, rec in enumerate(processed):
        store.put_photo(post["id"], i, rec)
    matches = _run_matching(post)
    store.upsert_user(
        user.uid,
        {"consentAt": iso(), "ageConfirmed": True, "guest": user.guest},
    )
    log.info("post_created type=%s category=%s matches=%s", payload.type, payload.category, len(matches))
    warning = "similar_post_today" if duplicate else None
    return {
        "post": owner_view(post),
        "matches": [
            match_view(m, store.get_post(m["foundPostId"] if post["type"] == "lost" else m["lostPostId"]) or {}, user.uid)
            for m in matches
        ],
        "warning": warning,
    }


@app.get("/lf/posts/mine")
def posts_mine(user: Principal = Depends(require_user)):
    store = get_store()
    return {"posts": [owner_view(p) for p in store.list_posts_by_owner(user.uid)]}


@app.get("/lf/posts/{post_id}")
def get_post(post_id: str, user: Principal = Depends(require_user)):
    store = get_store()
    post = store.get_post(post_id)
    if not post:
        return fail(404, "not_found", "That post is gone.")
    if post["ownerUid"] != user.uid:
        return fail(403, "forbidden", "You can only open the owner view of your own post.")
    return owner_view(post)


@app.patch("/lf/posts/{post_id}")
async def patch_post(post_id: str, request: Request, user: Principal = Depends(require_user)):
    store = get_store()
    post = store.get_post(post_id)
    if not post or post["ownerUid"] != user.uid:
        return fail(404, "not_found", "That post is gone.")
    body = await request.json()
    for key in ("title", "publicDescription", "privateDescription", "area"):
        if key in body:
            reject_card_numbers(body[key])
    if "title" in body:
        post["title"] = sanitise_title(body["title"])
    if "publicDescription" in body:
        post["publicDescription"] = sanitise_public(body["publicDescription"])
    if "privateDescription" in body:
        post["privateDescription"] = sanitise_private(body["privateDescription"])
    if "area" in body:
        post["area"] = mask_pii(str(body["area"]))[:80]
    post["keywords"] = sorted(tokens_from(post["title"], post["publicDescription"], post["privateDescription"]))
    store.put_post(post)
    matches = _run_matching(post)
    return {"post": owner_view(post), "matches": len(matches)}


@app.delete("/lf/posts/{post_id}")
def delete_post(post_id: str, user: Principal = Depends(require_user)):
    store = get_store()
    post = store.get_post(post_id)
    if not post or post["ownerUid"] != user.uid:
        return fail(404, "not_found", "That post is gone.")
    store.delete_matches_for_post(post_id)
    store.delete_post(post_id)
    return {"ok": True}


@app.post("/lf/posts/{post_id}/close")
def close_post(post_id: str, user: Principal = Depends(require_user)):
    store = get_store()
    post = store.get_post(post_id)
    if not post or post["ownerUid"] != user.uid:
        return fail(404, "not_found", "That post is gone.")
    post["status"] = "closed"
    store.put_post(post)
    return owner_view(post)


@app.get("/lf/feed")
def feed(
    request: Request,
    city: str | None = None,
    category: str | None = None,
    days: int | None = 90,
    cursor: int = 0,
    user: Principal | None = Depends(optional_user),
):
    if not _rate(request, user, "feed", 60, 60):
        return fail(429, "rate_limited", "Slow down a little.")
    store = get_store()
    city_key = lookup_city(city)["key"] if city and lookup_city(city) else (city.lower() if city else None)
    since = None
    if days:
        since = (date.today() - timedelta(days=int(days))).isoformat()
    rows = store.list_open_found(city_key, category, since)
    page = rows[cursor : cursor + 20]
    return {
        "posts": [public_card(p) for p in page],
        "nextCursor": cursor + 20 if cursor + 20 < len(rows) else None,
    }


@app.get("/lf/feed/lost")
def feed_lost(user: Principal = Depends(require_user)):
    if not settings.public_lost_feed:
        return fail(403, "disabled", "The public lost feed is off.")
    store = get_store()
    cards = []
    for post in store.list_open_lost():
        slim = {
            "id": post["id"],
            "type": "lost",
            "category": post.get("category"),
            "city": post.get("city"),
            "createdAt": post.get("createdAt"),
            "demo": bool(post.get("demo")),
        }
        cards.append(slim)
    return {"posts": cards}


@app.get("/lf/photos/{post_id}/{n}")
def get_photo(post_id: str, n: int, user: Principal | None = Depends(optional_user)):
    store = get_store()
    post = store.get_post(post_id)
    photo = store.get_photo(post_id, n)
    if not post or not photo:
        return fail(404, "not_found", "Photo not found.")
    allowed = False
    if post.get("publicPhoto") and post.get("category") not in ID_CATEGORIES:
        allowed = True
    if user and post.get("ownerUid") == user.uid:
        allowed = True
    if user:
        for match in store.list_matches_for_uid(user.uid):
            if match.get("state") in {"approved", "returned"} and post_id in {
                match.get("lostPostId"),
                match.get("foundPostId"),
            }:
                allowed = True
    if not allowed:
        return fail(403, "forbidden", "This photo is private.")
    import base64

    data = base64.b64decode(photo["dataB64"])
    return Response(content=data, media_type=photo.get("mime") or "image/jpeg")


@app.get("/lf/matches")
def list_matches(user: Principal = Depends(require_user)):
    store = get_store()
    out = []
    for match in store.list_matches_for_uid(user.uid):
        other_id = match["foundPostId"] if match["lostOwnerUid"] == user.uid else match["lostPostId"]
        other = store.get_post(other_id)
        if not other:
            continue
        out.append(match_view(match, other, user.uid))
    return {"matches": out}


@app.get("/lf/matches/{match_id}")
def get_match(match_id: str, user: Principal = Depends(require_user)):
    store = get_store()
    match = store.get_match(match_id)
    if not match or user.uid not in {match.get("lostOwnerUid"), match.get("foundOwnerUid")}:
        return fail(404, "not_found", "Match not found.")
    other_id = match["foundPostId"] if match["lostOwnerUid"] == user.uid else match["lostPostId"]
    return match_view(match, store.get_post(other_id) or {}, user.uid)


@app.get("/lf/found/{post_id}/questions")
def found_questions(post_id: str, user: Principal = Depends(require_user)):
    store = get_store()
    post = store.get_post(post_id)
    if not post or post.get("type") != "found":
        return fail(404, "not_found", "Post not found.")
    if post.get("ownerUid") == user.uid:
        return fail(403, "forbidden", "Those are your own questions.")
    questions = (post.get("verification") or {}).get("questions") or []
    return {"questions": questions, "postId": post_id, "demo": bool(post.get("demo"))}


@app.post("/lf/claims")
async def create_claim(request: Request, user: Principal = Depends(require_user), body: ClaimIn | None = None):
    if not _rate(request, user, "claims", 3, 86400):
        return fail(429, "rate_limited", "You can send 3 claims a day.")
    payload = body or ClaimIn.model_validate(await request.json())
    store = get_store()
    match = None
    found = None
    if payload.matchId:
        match = store.get_match(payload.matchId)
        if not match:
            return fail(404, "not_found", "Match not found.")
        found = store.get_post(match["foundPostId"])
        if match["lostOwnerUid"] != user.uid:
            return fail(403, "forbidden", "Only the owner of the lost post can claim.")
    elif payload.postId:
        found = store.get_post(payload.postId)
        if not found or found.get("type") != "found":
            return fail(404, "not_found", "Found post not found.")
        lost_posts = [p for p in store.list_posts_by_owner(user.uid) if p.get("type") == "lost" and p.get("status") == "open"]
        lost = lost_posts[0] if lost_posts else {
            "id": f"ephemeral-{user.uid[:8]}",
            "type": "lost",
            "status": "open",
            "ownerUid": user.uid,
            "category": found.get("category"),
            "title": "Claim from feed",
            "publicDescription": "",
            "city": found.get("city"),
            "lat": found.get("lat"),
            "lng": found.get("lng"),
            "geo7": found.get("geo7"),
            "dateFrom": (date.today() - timedelta(days=14)).isoformat(),
            "dateTo": date.today().isoformat(),
            "identifiers": [],
            "nameKeys": [],
            "keywords": [],
        }
        if not is_candidate(lost, found) and not (lost.get("category") == found.get("category")):
            pass
        result = decide(lost, found, threshold=0)
        if result:
            match = store.put_match(
                {
                    "id": result["id"],
                    "lostPostId": lost["id"],
                    "foundPostId": found["id"],
                    "lostOwnerUid": user.uid,
                    "foundOwnerUid": found["ownerUid"],
                    "kind": result["kind"],
                    "score": result["score"],
                    "reasons": result["reasons"],
                    "state": "suggested",
                    "createdAt": iso(),
                }
            )
        else:
            match = store.put_match(
                {
                    "id": f"{lost['id']}_{found['id']}",
                    "lostPostId": lost["id"],
                    "foundPostId": found["id"],
                    "lostOwnerUid": user.uid,
                    "foundOwnerUid": found["ownerUid"],
                    "kind": "possible",
                    "score": 40,
                    "reasons": [{"code": "SAME_CATEGORY", "text": "You said this might be yours"}],
                    "state": "suggested",
                    "createdAt": iso(),
                }
            )
    else:
        return fail(400, "need_target", "Send a postId or matchId.")
    existing = store.get_claim_by_match(match["id"])
    if existing and existing.get("claimerUid") == user.uid:
        return fail(409, "already_claimed", "You already claimed this match.")
    answers = payload.answers or []
    if not answers:
        return fail(400, "answers_required", "Answer the finder's questions.")
    claim = {
        "id": uuid.uuid4().hex[:16],
        "matchId": match["id"],
        "claimerUid": user.uid,
        "answers": answers,
        "message": payload.message,
        "policeReport": payload.policeReport.model_dump() if payload.policeReport else None,
        "state": "pending",
        "shared": {"lostOwner": [], "finder": []},
        "createdAt": iso(),
        "decidedAt": None,
    }
    store.put_claim(claim)
    match["state"] = "claimed"
    store.put_match(match)
    notify(found["ownerUid"], "claim_received", claim["id"])
    if found.get("ownerUid") == DEMO_FINDER_UID and settings.demo_mode:
        asyncio.create_task(demo_finder_respond(claim["id"], found["id"]))
    questions = (found.get("verification") or {}).get("questions") or []
    return claim_view(claim, viewer_uid=user.uid, is_finder=False, questions=questions)


@app.get("/lf/claims/{claim_id}")
def get_claim(claim_id: str, user: Principal = Depends(require_user)):
    store = get_store()
    claim = store.get_claim(claim_id)
    if not claim:
        return fail(404, "not_found", "Claim not found.")
    match = store.get_match(claim["matchId"])
    if not match or user.uid not in {match.get("lostOwnerUid"), match.get("foundOwnerUid")}:
        return fail(403, "forbidden", "Not your claim.")
    found = store.get_post(match["foundPostId"])
    is_finder = user.uid == match.get("foundOwnerUid")
    questions = (found.get("verification") or {}).get("questions") or []
    counterpart = None
    if claim.get("state") == "approved":
        counterpart = _counterpart_contact(claim, match, user.uid)
    return claim_view(
        claim,
        viewer_uid=user.uid,
        is_finder=is_finder,
        questions=questions if (is_finder or True) else None,
        counterpart_contact=counterpart,
    )


@app.post("/lf/claims/{claim_id}/decision")
def decide_claim(claim_id: str, body: DecisionIn, user: Principal = Depends(require_user)):
    store = get_store()
    claim = store.get_claim(claim_id)
    if not claim:
        return fail(404, "not_found", "Claim not found.")
    match = store.get_match(claim["matchId"])
    if not match or match.get("foundOwnerUid") != user.uid:
        return fail(403, "forbidden", "Only the finder can approve or decline.")
    if claim.get("state") != "pending":
        return fail(409, "already_decided", "This claim was already decided.")
    claim["state"] = "approved" if body.decision == "approve" else "declined"
    claim["decidedAt"] = iso()
    claim["decisionReason"] = body.reason
    store.put_claim(claim)
    match["state"] = "approved" if body.decision == "approve" else "declined"
    store.put_match(match)
    notify(claim["claimerUid"], "claim_approved" if body.decision == "approve" else "claim_declined", claim["id"])
    if body.decision == "approve":
        for other in store.list_claims_for_match(match["id"]):
            if other["id"] != claim["id"] and other.get("state") == "pending":
                other["state"] = "declined"
                other["decisionReason"] = "no_longer_available"
                other["decidedAt"] = iso()
                store.put_claim(other)
                notify(other["claimerUid"], "claim_declined", other["id"])
    found = store.get_post(match["foundPostId"])
    questions = (found.get("verification") or {}).get("questions") or []
    return claim_view(claim, viewer_uid=user.uid, is_finder=True, questions=questions)


def _counterpart_contact(claim: dict, match: dict, viewer_uid: str) -> dict[str, Any]:
    store = get_store()
    if viewer_uid == match.get("lostOwnerUid"):
        channels = (claim.get("shared") or {}).get("finder") or []
        other = store.get_user(match.get("foundOwnerUid"))
        role = "finder"
    else:
        channels = (claim.get("shared") or {}).get("lostOwner") or []
        other = store.get_user(match.get("lostOwnerUid"))
        role = "owner"
    contact_enc = (other or {}).get("contactEnc") or {}
    revealed = {}
    for ch in channels:
        revealed[ch] = decrypt_field(contact_enc.get(ch))
    display = (other or {}).get("displayName") or ("Demo finder" if (other or {}).get("demo") else None)
    if role == "finder" and (other or {}).get("uid") == DEMO_FINDER_UID:
        display = "Demo finder"
        if "phone" in channels and not revealed.get("phone"):
            revealed["phone"] = "+91 00000 00000"
    return {"role": role, "displayName": display, "channels": revealed, "demo": bool((other or {}).get("demo"))}


@app.post("/lf/claims/{claim_id}/share")
def share_contact(claim_id: str, body: ShareIn, user: Principal = Depends(require_user)):
    store = get_store()
    claim = store.get_claim(claim_id)
    match = store.get_match(claim["matchId"]) if claim else None
    if not claim or not match or user.uid not in {match.get("lostOwnerUid"), match.get("foundOwnerUid")}:
        return fail(404, "not_found", "Claim not found.")
    if claim.get("state") != "approved":
        return fail(409, "not_approved", "Share contact only after the finder approves.")
    me = store.get_user(user.uid) or {}
    enc = me.get("contactEnc") or {}
    missing = [ch for ch in body.channels if not enc.get(ch)]
    if missing:
        return fail(400, "missing_channel", "Add that contact on your profile first.")
    shared = claim.setdefault("shared", {"lostOwner": [], "finder": []})
    slot = "lostOwner" if user.uid == match.get("lostOwnerUid") else "finder"
    shared[slot] = list(dict.fromkeys(body.channels))
    store.put_claim(claim)
    other = match.get("foundOwnerUid") if slot == "lostOwner" else match.get("lostOwnerUid")
    notify(other, "contact_shared", claim["id"])
    return {"shared": shared, "counterpart": _counterpart_contact(claim, match, user.uid)}


@app.get("/lf/claims/{claim_id}/contact")
def get_contact(claim_id: str, user: Principal = Depends(require_user)):
    store = get_store()
    claim = store.get_claim(claim_id)
    match = store.get_match(claim["matchId"]) if claim else None
    if not claim or not match or user.uid not in {match.get("lostOwnerUid"), match.get("foundOwnerUid")}:
        return fail(404, "not_found", "Claim not found.")
    if claim.get("state") != "approved":
        return {"counterpart": None}
    return {"counterpart": _counterpart_contact(claim, match, user.uid)}


@app.post("/lf/matches/{match_id}/returned")
def mark_returned(match_id: str, user: Principal = Depends(require_user)):
    store = get_store()
    match = store.get_match(match_id)
    if not match or user.uid not in {match.get("lostOwnerUid"), match.get("foundOwnerUid")}:
        return fail(404, "not_found", "Match not found.")
    flags = match.setdefault("returnedBy", [])
    if user.uid not in flags:
        flags.append(user.uid)
    match["state"] = "returned"
    store.put_match(match)
    other = match["foundOwnerUid"] if user.uid == match["lostOwnerUid"] else match["lostOwnerUid"]
    notify(other, "returned", match_id)
    return {"match": match, "needsConfirm": other not in flags}


@app.post("/lf/matches/{match_id}/returned/confirm")
def confirm_returned(match_id: str, user: Principal = Depends(require_user)):
    store = get_store()
    match = store.get_match(match_id)
    if not match or user.uid not in {match.get("lostOwnerUid"), match.get("foundOwnerUid")}:
        return fail(404, "not_found", "Match not found.")
    flags = match.setdefault("returnedBy", [])
    if user.uid not in flags:
        flags.append(user.uid)
    match["state"] = "returned"
    match["confirmedAt"] = iso()
    store.put_match(match)
    for pid in (match["lostPostId"], match["foundPostId"]):
        post = store.get_post(pid)
        if post:
            post["status"] = "returned"
            store.put_post(post)
    if set(flags) >= {match["lostOwnerUid"], match["foundOwnerUid"]}:
        finder = store.get_user(match["foundOwnerUid"]) or {}
        karma = finder.get("karma") or {"returned": 0}
        karma["returned"] = int(karma.get("returned") or 0) + 1
        store.upsert_user(match["foundOwnerUid"], {"karma": karma})
    notify(match["lostOwnerUid"], "thanks", match_id)
    return {"ok": True, "karmaCounted": set(flags) >= {match["lostOwnerUid"], match["foundOwnerUid"]}}


@app.get("/lf/notifications")
def notifications(user: Principal = Depends(require_user)):
    return {"notifications": get_store().list_notifications(user.uid)}


@app.get("/lf/notifications/count")
def notifications_count(user: Principal = Depends(require_user)):
    return {"unread": get_store().unread_count(user.uid)}


@app.post("/lf/notifications/read")
async def notifications_read(request: Request, user: Principal = Depends(require_user)):
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    get_store().mark_read(user.uid, body.get("ids"))
    return {"ok": True}


@app.get("/lf/me")
def get_me(user: Principal = Depends(require_user)):
    rec = get_store().get_user(user.uid) or {}
    return {
        "uid": user.uid,
        "guest": bool(rec.get("guest")),
        "demo": bool(rec.get("demo") or user.demo),
        "displayName": rec.get("displayName"),
        "karma": rec.get("karma") or {"returned": 0},
        "hasPhone": bool((rec.get("contactEnc") or {}).get("phone")),
        "hasWhatsapp": bool((rec.get("contactEnc") or {}).get("whatsapp")),
        "hasEmail": bool((rec.get("contactEnc") or {}).get("email")),
        "hasUpi": bool(rec.get("upiVpa")),
        "consentAt": rec.get("consentAt"),
        "ageConfirmed": bool(rec.get("ageConfirmed")),
    }


@app.put("/lf/me")
def put_me(body: ProfileIn, user: Principal = Depends(require_user)):
    store = get_store()
    rec = store.get_user(user.uid) or {"uid": user.uid}
    enc = rec.get("contactEnc") or {}
    if body.phone is not None:
        enc["phone"] = encrypt_field(body.phone)
    if body.whatsapp is not None:
        enc["whatsapp"] = encrypt_field(body.whatsapp)
    if body.email is not None:
        enc["email"] = encrypt_field(body.email)
    updates: dict[str, Any] = {"contactEnc": enc}
    if body.displayName is not None:
        updates["displayName"] = body.displayName
    if body.upiVpa is not None:
        updates["upiVpa"] = body.upiVpa.strip()[:80]
    if body.consent:
        updates["consentAt"] = iso()
    if body.ageConfirmed:
        updates["ageConfirmed"] = True
    store.upsert_user(user.uid, updates)
    return get_me(user)


@app.delete("/lf/me")
def delete_me(user: Principal = Depends(require_user)):
    get_store().cascade_delete_user(user.uid)
    return {"ok": True}


@app.post("/lf/report")
def report(body: ReportIn, request: Request, user: Principal = Depends(require_user)):
    if not _rate(request, user, "report", 10, 86400):
        return fail(429, "rate_limited", "Too many reports today.")
    store = get_store()
    target = store.get_post(body.targetId) if body.targetType == "post" else None
    if target and target.get("demo"):
        return {"ok": True, "ignored": True}
    store.add_report(
        {
            "id": uuid.uuid4().hex[:12],
            "targetType": body.targetType,
            "targetId": body.targetId,
            "reporterUid": user.uid,
            "reason": body.reason[:200],
            "createdAt": iso(),
        }
    )
    if body.targetType == "post" and target:
        count = store.report_count("post", body.targetId)
        target["reportCount"] = count
        if count >= 3:
            target["status"] = "hidden"
        store.put_post(target)
    return {"ok": True}


@app.post("/lf/block")
def block_user(body: BlockIn, user: Principal = Depends(require_user)):
    get_store().block(user.uid, body.uid)
    return {"ok": True}


@app.post("/lf/extract")
async def extract(
    request: Request,
    user: Principal = Depends(require_user),
    image: UploadFile = File(...),
):
    if not _rate(request, user, "extract", 10, 3600):
        return fail(429, "rate_limited", "You can scan 10 documents an hour.")
    raw = await image.read()
    result = await extract_from_image(raw, image.content_type or "image/jpeg")
    log.info("extract_done bytes=%s", len(raw))
    return result


@app.get("/lf/cities")
def cities():
    from lf.geo import load_cities

    return {
        "cities": [
            {"key": c["key"], "name": c["name"], "state": c["state"]}
            for c in load_cities()
        ]
    }


@app.get("/lf/thanks/{match_id}")
def thanks_payload(match_id: str, user: Principal = Depends(require_user)):
    store = get_store()
    match = store.get_match(match_id)
    if not match or user.uid != match.get("lostOwnerUid"):
        return fail(404, "not_found", "Match not found.")
    finder = store.get_user(match.get("foundOwnerUid")) or {}
    named = bool(finder.get("displayName")) and finder.get("nameOnThanks") is not False
    name = finder.get("displayName") if named else None
    vpa = finder.get("upiVpa") if finder.get("shareUpi", True) else None
    if match.get("foundOwnerUid") == DEMO_FINDER_UID:
        name = None
        vpa = "demo.finder@upi"
    return {
        "finderFirstName": name,
        "anonymous": name is None,
        "upiVpa": vpa,
        "demo": bool(finder.get("demo")),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(settings.port), reload=False)
