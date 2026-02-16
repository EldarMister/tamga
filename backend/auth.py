from datetime import datetime, timedelta, timezone
from hashlib import sha256
import hmac
import json
import base64
from backend.config import SECRET_KEY, JWT_EXPIRY_HOURS


def hash_password(password: str) -> str:
    return sha256((password + SECRET_KEY).encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    return hmac.compare_digest(hash_password(password), hashed)


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64decode(s: str) -> bytes:
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)


def create_token(user_id: int, role: str) -> str:
    header = _b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    now = datetime.now(timezone.utc)
    payload_data = {
        "sub": user_id,
        "role": role,
        "exp": int((now + timedelta(hours=JWT_EXPIRY_HOURS)).timestamp()),
        "iat": int(now.timestamp()),
    }
    payload = _b64encode(json.dumps(payload_data).encode())
    signature = _b64encode(
        hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), sha256).digest()
    )
    return f"{header}.{payload}.{signature}"


def decode_token(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload, signature = parts
        expected_sig = _b64encode(
            hmac.new(SECRET_KEY.encode(), f"{header}.{payload}".encode(), sha256).digest()
        )
        if not hmac.compare_digest(signature, expected_sig):
            return None
        data = json.loads(_b64decode(payload))
        if data.get("exp", 0) < datetime.now(timezone.utc).timestamp():
            return None
        return data
    except Exception:
        return None
