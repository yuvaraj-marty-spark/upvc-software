import base64
import hashlib
import hmac
import json
import os
import secrets
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.models.passcode_session import PasscodeSession
from app.models.shop import Shop

ENV_PATH = Path(__file__).resolve().parent.parent.parent.parent / ".env"
load_dotenv(ENV_PATH, override=False)

SESSION_TIMEOUT_SECONDS = 60
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 5

router = APIRouter(prefix="/passcode", tags=["Passcode"])
bearer_scheme = HTTPBearer()

# Track failed passcode attempts per client IP to block combination guessing
_failed_attempts: dict[str, list[datetime]] = defaultdict(list)
_locked_until: dict[str, datetime] = {}


class PasscodeLoginRequest(BaseModel):
    passcode: str = Field(min_length=4, max_length=64)


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _get_configured_passcodes() -> list[str]:
    raw = os.getenv("APP_PASSCODES", "")
    codes = [c.strip() for c in raw.split(",") if c.strip()]
    return codes[:2]


def _get_signing_key() -> bytes:
    material = os.getenv("SECRET_KEY") or os.getenv("APP_PASSCODES") or "ls-interiors-passcode-key"
    return hashlib.sha256(material.encode("utf-8")).digest()


def _sign_session_token(code_hash: str, label: str, session_id: str) -> str:
    payload_bytes = json.dumps(
        {"c": code_hash, "l": label, "s": session_id},
        separators=(",", ":"),
    ).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode("ascii")
    sig = hmac.new(_get_signing_key(), payload_b64.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def _verify_session_token(token: str) -> dict | None:
    if "." not in token:
        return None
    payload_b64, sig = token.rsplit(".", 1)
    expected_sig = hmac.new(
        _get_signing_key(), payload_b64.encode("ascii"), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(payload_b64.encode("ascii")).decode("utf-8"))
        if not isinstance(data, dict) or not data.get("c") or not data.get("l"):
            return None
        valid_hashes = {_hash_value(c) for c in _get_configured_passcodes()}
        if data["c"] not in valid_hashes:
            return None
        return data
    except Exception:
        return None


def _ensure_passcode_session(db: Session, code_hash: str, label: str) -> PasscodeSession:
    ps = db.scalar(
        select(PasscodeSession).where(PasscodeSession.passcode_hash == code_hash)
    )
    if ps is not None:
        return ps

    slug = f"passcode-{code_hash[:12]}"
    shop = db.scalar(select(Shop).where(Shop.slug == slug))
    if shop is None:
        shop = Shop(
            name=f"LS Interiors {label}",
            slug=slug,
            is_active=True,
        )
        db.add(shop)
        db.flush()

    ps = PasscodeSession(
        passcode_hash=code_hash,
        label=label,
        shop_id=shop.id,
        is_in_use=False,
    )
    db.add(ps)
    db.commit()
    db.refresh(ps)
    return ps


def _sync_passcode_shops(db: Session) -> list[PasscodeSession]:
    codes = _get_configured_passcodes()
    if not codes:
        return []
    return [
        _ensure_passcode_session(db, _hash_value(code), f"User {idx}")
        for idx, code in enumerate(codes, start=1)
    ]


def _check_rate_limit(client_ip: str) -> None:
    now = datetime.now(timezone.utc)
    lock_expiry = _locked_until.get(client_ip)
    if lock_expiry and now < lock_expiry:
        remaining = int((lock_expiry - now).total_seconds())
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many invalid passcode attempts. Try again in {remaining}s.",
        )
    if lock_expiry and now >= lock_expiry:
        _locked_until.pop(client_ip, None)
        _failed_attempts.pop(client_ip, None)


def _record_failure(client_ip: str) -> None:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=LOCKOUT_MINUTES)
    recent = [t for t in _failed_attempts[client_ip] if t > cutoff]
    recent.append(now)
    _failed_attempts[client_ip] = recent
    if len(recent) >= MAX_FAILED_ATTEMPTS:
        _locked_until[client_ip] = now + timedelta(minutes=LOCKOUT_MINUTES)


@router.post("/login")
def passcode_login(
    request: Request,
    payload: PasscodeLoginRequest,
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    entered = payload.passcode.strip()
    configured = _get_configured_passcodes()
    matched_idx: int | None = None
    for idx, code in enumerate(configured, start=1):
        if secrets.compare_digest(entered, code):
            matched_idx = idx

    if matched_idx is None:
        _record_failure(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid passcode.",
        )

    entered_hash = _hash_value(entered)
    ps = _ensure_passcode_session(db, entered_hash, f"User {matched_idx}")

    now = datetime.now(timezone.utc)
    last_seen = _as_utc(ps.last_seen_at)
    is_stale = (
        last_seen is None
        or (now - last_seen).total_seconds() > SESSION_TIMEOUT_SECONDS
    )

    if ps.is_in_use and not is_stale:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This passcode is already in use by another active session.",
        )

    _failed_attempts.pop(client_ip, None)
    _locked_until.pop(client_ip, None)

    session_id = secrets.token_hex(16)
    signed_token = _sign_session_token(entered_hash, ps.label, session_id)
    ps.is_in_use = True
    ps.session_token_hash = _hash_value(signed_token)
    ps.last_seen_at = now
    db.commit()

    return {
        "session_token": signed_token,
        "label": ps.label,
    }


def get_active_passcode_session(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> PasscodeSession:
    raw_token = credentials.credentials
    token_data = _verify_session_token(raw_token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or logged out.",
        )

    ps = _ensure_passcode_session(db, token_data["c"], token_data["l"])
    token_hash = _hash_value(raw_token)
    now = datetime.now(timezone.utc)

    # Fresh serverless container (/tmp DB) without this session yet: hydrate safely
    if not ps.is_in_use and ps.session_token_hash is None:
        ps.is_in_use = True
        ps.session_token_hash = token_hash
        ps.last_seen_at = now
        db.commit()
        return ps

    if not ps.is_in_use or ps.session_token_hash != token_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or logged out.",
        )

    last_seen = _as_utc(ps.last_seen_at)
    if last_seen and (now - last_seen).total_seconds() > SESSION_TIMEOUT_SECONDS:
        ps.is_in_use = False
        ps.session_token_hash = None
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session timed out.",
        )

    if last_seen is None or (now - last_seen).total_seconds() >= 45:
        ps.last_seen_at = now
        db.commit()
    return ps


@router.post("/heartbeat")
def passcode_heartbeat(
    ps: PasscodeSession = Depends(get_active_passcode_session),
    db: Session = Depends(get_db),
):
    ps.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "active", "label": ps.label}


@router.post("/logout")
def passcode_logout(
    ps: PasscodeSession = Depends(get_active_passcode_session),
    db: Session = Depends(get_db),
):
    ps.is_in_use = False
    ps.session_token_hash = None
    ps.last_seen_at = None
    db.commit()
    return {"message": "Logged out and passcode released."}
