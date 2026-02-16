from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from backend.database import get_db
from backend.auth import verify_password, create_token, hash_password
from backend.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/login")
def login(data: LoginRequest):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username = ? AND is_active = 1", (data.username,)).fetchone()
    db.close()
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    token = create_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "lang": user["lang"],
            "phone": user["phone"],
        },
    }


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {
        "id": user["id"],
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"],
        "lang": user["lang"],
        "phone": user["phone"],
    }


@router.post("/change-password")
async def change_password(data: ChangePasswordRequest, user=Depends(get_current_user)):
    if not verify_password(data.old_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    db = get_db()
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(data.new_password), user["id"]))
    db.commit()
    db.close()
    return {"ok": True}
