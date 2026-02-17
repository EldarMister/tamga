import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from backend.database import get_db
from backend.dependencies import get_current_user, role_required
from backend.config import UPLOAD_DIR

router = APIRouter(prefix="/api/training", tags=["training"])


class TrainingCreate(BaseModel):
    title: str
    description: str = ""
    youtube_url: str = ""
    photo_url: str | None = None
    role_target: str = None
    assigned_to: int = None
    is_required: bool = False


@router.get("")
async def list_training(user=Depends(get_current_user)):
    db = get_db()
    rows = db.execute(
        """SELECT tr.*, u.full_name as created_by_name,
           COALESCE(tp.watched, 0) as watched
           FROM training tr
           JOIN users u ON u.id = tr.created_by
           LEFT JOIN training_progress tp ON tp.training_id = tr.id AND tp.user_id = ?
           ORDER BY tr.created_at DESC""",
        (user["id"],),
    ).fetchall()

    result = []
    for r in rows:
        item = dict(r)
        item["watched"] = bool(item["watched"])
        result.append(item)

    db.close()
    return result


@router.post("")
async def create_training(data: TrainingCreate, user=Depends(role_required("director"))):
    youtube_url = (data.youtube_url or "").strip()
    photo_url = (data.photo_url or "").strip() or None
    db = get_db()
    cur = db.execute(
        """INSERT INTO training (title, description, youtube_url, photo_url, role_target, assigned_to, created_by, is_required)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (data.title, data.description, youtube_url, photo_url, data.role_target, data.assigned_to, user["id"], int(data.is_required)),
    )
    db.commit()
    row = db.execute("SELECT * FROM training WHERE id = ?", (cur.lastrowid,)).fetchone()
    db.close()
    return dict(row)


@router.patch("/{training_id}/watch")
async def mark_watched(training_id: int, user=Depends(get_current_user)):
    db = get_db()
    existing = db.execute(
        "SELECT * FROM training_progress WHERE training_id = ? AND user_id = ?",
        (training_id, user["id"]),
    ).fetchone()

    if existing:
        new_val = 0 if existing["watched"] else 1
        db.execute(
            "UPDATE training_progress SET watched = ?, watched_at = datetime('now') WHERE id = ?",
            (new_val, existing["id"]),
        )
    else:
        db.execute(
            "INSERT INTO training_progress (training_id, user_id, watched, watched_at) VALUES (?, ?, 1, datetime('now'))",
            (training_id, user["id"]),
        )

    db.commit()
    db.close()
    return {"ok": True}


@router.delete("/{training_id}")
async def delete_training(training_id: int, user=Depends(role_required("director"))):
    db = get_db()
    db.execute("DELETE FROM training_progress WHERE training_id = ?", (training_id,))
    db.execute("DELETE FROM training WHERE id = ?", (training_id,))
    db.commit()
    db.close()
    return {"ok": True}


@router.post("/{training_id}/photo")
async def upload_training_photo(training_id: int, file: UploadFile = File(...), user=Depends(role_required("director"))):
    db = get_db()
    item = db.execute("SELECT * FROM training WHERE id = ?", (training_id,)).fetchone()
    if not item:
        db.close()
        raise HTTPException(status_code=404, detail="Урок не найден")

    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    filename = f"training_{training_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    db.execute("UPDATE training SET photo_file = ? WHERE id = ?", (filename, training_id))
    db.commit()
    db.close()
    return {"filename": filename}


@router.get("/progress")
async def training_progress(user=Depends(role_required("director", "manager"))):
    """Get training progress for all employees."""
    db = get_db()
    employees = db.execute("SELECT id, full_name, role FROM users WHERE is_active = 1 ORDER BY full_name").fetchall()
    trainings = db.execute("SELECT id, title, is_required FROM training ORDER BY created_at DESC").fetchall()

    all_progress = db.execute(
        "SELECT user_id, training_id, watched FROM training_progress WHERE watched = 1"
    ).fetchall()
    watched_by_user = {}
    for p in all_progress:
        watched_by_user.setdefault(p["user_id"], set()).add(p["training_id"])

    total = len(trainings)
    result = []
    for emp in employees:
        done = len(watched_by_user.get(emp["id"], set()))
        result.append({
            "employee": dict(emp),
            "total": total,
            "watched": done,
            "percent": round(done / total * 100) if total else 0,
        })

    db.close()
    return result
