from fastapi import Request, HTTPException
from backend.auth import decode_token
from backend.database import get_db


def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ? AND is_active = 1", (payload["sub"],)).fetchone()
    db.close()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or deactivated")
    return dict(user)


def role_required(*roles):
    def checker(request: Request):
        user = get_current_user(request)
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker
