from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.database import get_db
from backend.auth import hash_password
from backend.dependencies import role_required, get_current_user
from backend.config import ALLOWED_ROLES

router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str
    phone: str = ""


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    phone: str | None = None
    lang: str | None = None


class SelfUpdate(BaseModel):
    username: str | None = None
    phone: str | None = None


@router.get("")
def list_users(user=Depends(role_required("director", "manager"))):
    db = get_db()
    rows = db.execute("SELECT id, username, full_name, role, phone, is_active, lang, created_at FROM users ORDER BY full_name").fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("")
def create_user(data: UserCreate, user=Depends(role_required("director"))):
    if data.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"Недопустимая роль: {data.role}")
    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (data.username,)).fetchone()
    if existing:
        db.close()
        raise HTTPException(status_code=400, detail="Пользователь с таким логином уже существует")

    cur = db.execute(
        "INSERT INTO users (username, password_hash, full_name, role, phone) VALUES (?, ?, ?, ?, ?)",
        (data.username, hash_password(data.password), data.full_name, data.role, data.phone),
    )
    db.commit()
    row = db.execute(
        "SELECT id, username, full_name, role, phone, is_active, lang, created_at FROM users WHERE id = ?",
        (cur.lastrowid,),
    ).fetchone()
    db.close()
    return dict(row)


@router.put("/{user_id}")
def update_user(user_id: int, data: UserUpdate, user=Depends(role_required("director"))):
    db = get_db()
    target = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not target:
        db.close()
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    updates = {}
    if data.full_name is not None:
        updates["full_name"] = data.full_name
    if data.role is not None:
        if data.role not in ALLOWED_ROLES:
            db.close()
            raise HTTPException(status_code=400, detail=f"Недопустимая роль: {data.role}")
        updates["role"] = data.role
    if data.phone is not None:
        updates["phone"] = data.phone
    if data.lang is not None:
        updates["lang"] = data.lang

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [user_id]
        db.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
        db.commit()

    row = db.execute(
        "SELECT id, username, full_name, role, phone, is_active, lang, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    db.close()
    return dict(row)


@router.patch("/{user_id}/active")
def toggle_active(user_id: int, user=Depends(role_required("director"))):
    db = get_db()
    target = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not target:
        db.close()
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    new_status = 0 if target["is_active"] else 1
    db.execute("UPDATE users SET is_active = ? WHERE id = ?", (new_status, user_id))
    db.commit()
    db.close()
    return {"id": user_id, "is_active": new_status}


@router.post("/{user_id}/reset-password")
def reset_password(user_id: int, user=Depends(role_required("director"))):
    db = get_db()
    target = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not target:
        db.close()
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    new_pass = "12345"
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new_pass), user_id))
    db.commit()
    db.close()
    return {"message": f"Пароль сброшен на: {new_pass}"}


@router.patch("/me/lang")
def update_my_lang(lang: str, user=Depends(get_current_user)):
    if lang not in ("ru", "ky"):
        raise HTTPException(status_code=400, detail="Язык должен быть 'ru' или 'ky'")
    db = get_db()
    db.execute("UPDATE users SET lang = ? WHERE id = ?", (lang, user["id"]))
    db.commit()
    db.close()
    return {"lang": lang}


@router.patch("/me")
def update_me(data: SelfUpdate, user=Depends(get_current_user)):
    if user["role"] != "director":
        raise HTTPException(status_code=403, detail="Нет доступа")

    updates = {}
    if data.username is not None:
        new_username = data.username.strip()
        if not new_username:
            raise HTTPException(status_code=400, detail="Логин пустой")
        db = get_db()
        existing = db.execute(
            "SELECT id FROM users WHERE username = ? AND id != ?",
            (new_username, user["id"]),
        ).fetchone()
        if existing:
            db.close()
            raise HTTPException(status_code=400, detail="Логин уже занят")
        updates["username"] = new_username
    if data.phone is not None:
        updates["phone"] = data.phone.strip()

    if not updates:
        return {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role": user["role"],
            "lang": user["lang"],
            "phone": user["phone"],
        }

    if "db" not in locals():
        db = get_db()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [user["id"]]
    db.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
    db.commit()
    row = db.execute(
        "SELECT id, username, full_name, role, phone, is_active, lang, created_at FROM users WHERE id = ?",
        (user["id"],),
    ).fetchone()
    db.close()
    return dict(row)
