from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from backend.database import get_db
from backend.dependencies import get_current_user, role_required
from backend.config import UPLOAD_DIR
import os
import uuid
from datetime import date

router = APIRouter(prefix="/api/hr", tags=["hr"])


class IncidentCreate(BaseModel):
    user_id: int
    type: str  # defect, late, complaint, other
    description: str
    order_id: int | None = None
    material_waste: float | None = None
    deduction_amount: float | None = None


class ShiftTaskUpdate(BaseModel):
    completed: bool = True


class ShiftTaskCreate(BaseModel):
    role: str
    title: str
    is_required: bool = True


class ShiftTaskDefUpdate(BaseModel):
    role: str | None = None
    title: str | None = None
    is_required: bool | None = None


def _today_iso() -> str:
    return date.today().isoformat()


@router.post("/checkin")
def checkin(user=Depends(get_current_user)):
    db = get_db()
    today = _today_iso()
    existing = db.execute(
        "SELECT * FROM attendance WHERE user_id = ? AND date = ?",
        (user["id"], today),
    ).fetchone()
    if existing:
        db.close()
        raise HTTPException(status_code=400, detail="Р’С‹ СѓР¶Рµ РѕС‚РјРµС‚РёР»РёСЃСЊ СЃРµРіРѕРґРЅСЏ")
    db.execute("INSERT INTO attendance (user_id) VALUES (?)", (user["id"],))
    db.commit()
    row = db.execute(
        "SELECT * FROM attendance WHERE user_id = ? AND date = ?",
        (user["id"], today),
    ).fetchone()
    db.close()
    return dict(row)


@router.post("/checkout")
def checkout(user=Depends(get_current_user)):
    db = get_db()
    today = _today_iso()
    existing = db.execute(
        "SELECT * FROM attendance WHERE user_id = ? AND date = ?",
        (user["id"], today),
    ).fetchone()
    if not existing:
        db.close()
        raise HTTPException(status_code=400, detail="Вы не начинали смену сегодня")
    if existing["check_out"]:
        db.close()
        raise HTTPException(status_code=400, detail="Смена уже завершена")

    # Do not block checkout: mark all untouched tasks as not completed for reporting.
    role_tasks = db.execute(
        "SELECT id FROM shift_tasks WHERE role = ?",
        (user["role"],),
    ).fetchall()
    for task in role_tasks:
        db.execute(
            """INSERT INTO shift_task_logs (user_id, task_id, date, completed)
               VALUES (?, ?, ?, 0)
               ON CONFLICT(user_id, task_id, date) DO NOTHING""",
            (user["id"], task["id"], today),
        )

    done_count = db.execute(
        "SELECT COUNT(*) FROM shift_task_logs WHERE user_id = ? AND date = ? AND completed = 1",
        (user["id"], today),
    ).fetchone()[0]
    total_count = len(role_tasks)
    not_completed_count = max(total_count - done_count, 0)

    db.execute(
        "UPDATE attendance SET check_out = datetime('now') WHERE id = ?", (existing["id"],)
    )
    db.commit()
    row = db.execute("SELECT * FROM attendance WHERE id = ?", (existing["id"],)).fetchone()
    db.close()
    result = dict(row)
    result["shift_tasks_summary"] = {
        "total": total_count,
        "completed": done_count,
        "not_completed": not_completed_count,
    }
    return result


@router.get("/attendance/today")
def today_attendance(user=Depends(role_required("director", "manager"))):
    db = get_db()
    today = _today_iso()
    rows = db.execute(
        """SELECT a.*, u.full_name, u.role FROM attendance a
           JOIN users u ON u.id = a.user_id
           WHERE a.date = ?
           ORDER BY a.check_in""",
        (today,),
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.get("/attendance")
def list_attendance(
    date_from: str = "",
    date_to: str = "",
    user_id: int = 0,
    user=Depends(role_required("director", "manager")),
):
    db = get_db()
    conditions = ["1=1"]
    params = []
    if date_from:
        conditions.append("a.date >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("a.date <= ?")
        params.append(date_to)
    if user_id:
        conditions.append("a.user_id = ?")
        params.append(user_id)

    where = " AND ".join(conditions)
    rows = db.execute(
        f"""SELECT a.*, u.full_name, u.role FROM attendance a
            JOIN users u ON u.id = a.user_id
            WHERE {where}
            ORDER BY a.date DESC, a.check_in DESC
            LIMIT 200""",
        params,
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.get("/shift-tasks")
def list_shift_tasks(role: str = "", user=Depends(get_current_user)):
    db = get_db()
    today = _today_iso()
    target_role = role or user["role"]
    if role and user["role"] not in ("director",):
        db.close()
        raise HTTPException(status_code=403, detail="РќРµС‚ РґРѕСЃС‚СѓРїР°")

    rows = db.execute(
        """SELECT st.*, COALESCE(l.completed, 0) as completed
           FROM shift_tasks st
           LEFT JOIN shift_task_logs l
             ON l.task_id = st.id AND l.user_id = ? AND l.date = ?
           WHERE st.role = ?
           ORDER BY st.id""",
        (user["id"], today, target_role),
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("/shift-tasks/{task_id}/complete")
def complete_shift_task(task_id: int, data: ShiftTaskUpdate, user=Depends(get_current_user)):
    db = get_db()
    task = db.execute("SELECT * FROM shift_tasks WHERE id = ?", (task_id,)).fetchone()
    if not task:
        db.close()
        raise HTTPException(status_code=404, detail="Р—Р°РґР°С‡Р° РЅРµ РЅР°Р№РґРµРЅР°")
    if task["role"] != user["role"] and user["role"] != "director":
        db.close()
        raise HTTPException(status_code=403, detail="РќРµС‚ РґРѕСЃС‚СѓРїР°")

    today = _today_iso()
    if data.completed:
        db.execute(
            """INSERT INTO shift_task_logs (user_id, task_id, date, completed)
               VALUES (?, ?, ?, 1)
               ON CONFLICT(user_id, task_id, date) DO UPDATE SET completed = 1""",
            (user["id"], task_id, today),
        )
    else:
        db.execute(
            """INSERT INTO shift_task_logs (user_id, task_id, date, completed)
               VALUES (?, ?, ?, 0)
               ON CONFLICT(user_id, task_id, date) DO UPDATE SET completed = 0""",
            (user["id"], task_id, today),
        )

    db.commit()
    db.close()
    return {"ok": True}


@router.get("/shift-tasks/catalog")
def list_shift_task_defs(role: str = "", user=Depends(role_required("director"))):
    # Director-only: manage checklist definitions
    db = get_db()
    conditions = ["1=1"]
    params = []
    if role:
        conditions.append("role = ?")
        params.append(role)
    where = " AND ".join(conditions)
    rows = db.execute(
        f"SELECT * FROM shift_tasks WHERE {where} ORDER BY role, id",
        params,
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("/shift-tasks")
def create_shift_task(data: ShiftTaskCreate, user=Depends(role_required("director"))):
    if not data.title.strip():
        raise HTTPException(status_code=400, detail="Название задачи пустое")
    db = get_db()
    cur = db.execute(
        "INSERT INTO shift_tasks (role, title, is_required) VALUES (?, ?, ?)",
        (data.role, data.title.strip(), 1 if data.is_required else 0),
    )
    db.commit()
    row = db.execute("SELECT * FROM shift_tasks WHERE id = ?", (cur.lastrowid,)).fetchone()
    db.close()
    return dict(row)


@router.patch("/shift-tasks/{task_id}")
def update_shift_task(task_id: int, data: ShiftTaskDefUpdate, user=Depends(role_required("director"))):
    db = get_db()
    row = db.execute("SELECT * FROM shift_tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Задача не найдена")

    updates = {}
    if data.role is not None:
        updates["role"] = data.role
    if data.title is not None:
        updates["title"] = data.title.strip()
    if data.is_required is not None:
        updates["is_required"] = 1 if data.is_required else 0

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [task_id]
        db.execute(f"UPDATE shift_tasks SET {set_clause} WHERE id = ?", values)
        db.commit()

    updated = db.execute("SELECT * FROM shift_tasks WHERE id = ?", (task_id,)).fetchone()
    db.close()
    return dict(updated)


@router.delete("/shift-tasks/{task_id}")
def delete_shift_task(task_id: int, user=Depends(role_required("director"))):
    db = get_db()
    db.execute("DELETE FROM shift_tasks WHERE id = ?", (task_id,))
    db.commit()
    db.close()
    return {"ok": True}


@router.get("/shift-tasks/report")
def shift_tasks_report(date: str = "", role: str = "", user=Depends(role_required("director"))):
    # Director-only: view completion by user
    db = get_db()
    target_date = date or _today_iso()
    if not role:
        db.close()
        raise HTTPException(status_code=400, detail="Нужна роль")

    tasks = db.execute(
        "SELECT id, title, is_required FROM shift_tasks WHERE role = ? ORDER BY id",
        (role,),
    ).fetchall()
    users = db.execute(
        "SELECT id, full_name FROM users WHERE role = ? AND is_active = 1 ORDER BY full_name",
        (role,),
    ).fetchall()
    logs = db.execute(
        "SELECT user_id, task_id, completed FROM shift_task_logs WHERE date = ?",
        (target_date,),
    ).fetchall()

    log_map = {(l["user_id"], l["task_id"]): l["completed"] for l in logs}
    result = []
    for u in users:
        entries = []
        for t in tasks:
            completed = bool(log_map.get((u["id"], t["id"]), 0))
            entries.append({
                "id": t["id"],
                "title": t["title"],
                "is_required": t["is_required"],
                "completed": completed,
            })
        result.append({"user_id": u["id"], "full_name": u["full_name"], "tasks": entries})

    db.close()
    return {"date": target_date, "role": role, "items": result, "tasks": [dict(t) for t in tasks]}


@router.get("/my-attendance")
def my_attendance(user=Depends(get_current_user)):
    db = get_db()
    today = _today_iso()
    row = db.execute(
        "SELECT * FROM attendance WHERE user_id = ? AND date = ?",
        (user["id"], today),
    ).fetchone()
    db.close()
    return dict(row) if row else None


@router.post("/incidents")
def create_incident(data: IncidentCreate, user=Depends(role_required("director", "manager"))):
    db = get_db()
    target = db.execute("SELECT * FROM users WHERE id = ?", (data.user_id,)).fetchone()
    if not target:
        db.close()
        raise HTTPException(status_code=400, detail="РЎРѕС‚СЂСѓРґРЅРёРє РЅРµ РЅР°Р№РґРµРЅ")

    cur = db.execute(
        """INSERT INTO incidents (user_id, type, description, order_id, material_waste, deduction_amount, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (data.user_id, data.type, data.description, data.order_id, data.material_waste, data.deduction_amount, user["id"]),
    )
    incident_id = cur.lastrowid

    # If defect with material waste, record additional write-off
    if data.type == "defect" and data.material_waste and data.order_id:
        order = db.execute("SELECT * FROM orders WHERE id = ?", (data.order_id,)).fetchone()
        if order:
            items = db.execute("SELECT * FROM order_items WHERE order_id = ? AND material_id IS NOT NULL LIMIT 1", (data.order_id,)).fetchall()
            for item in items:
                db.execute(
                    "UPDATE materials SET quantity = quantity - ?, updated_at = datetime('now') WHERE id = ?",
                    (data.material_waste, item["material_id"]),
                )
                db.execute(
                    "INSERT INTO material_ledger (material_id, order_id, action, quantity, note, performed_by) VALUES (?, ?, 'defect', ?, ?, ?)",
                    (item["material_id"], data.order_id, -data.material_waste, f"Р‘СЂР°Рє: {data.description}", user["id"]),
                )

    db.commit()
    row = db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    db.close()
    return dict(row)


@router.get("/incidents")
def list_incidents(
    status: str = "",
    user_id: int = 0,
    date_from: str = "",
    date_to: str = "",
    penalties_only: int = 0,
    user=Depends(role_required("director", "manager")),
):
    db = get_db()
    conditions = ["1=1"]
    params = []
    if status:
        conditions.append("i.status = ?")
        params.append(status)
    if user_id:
        conditions.append("i.user_id = ?")
        params.append(user_id)
    if date_from:
        conditions.append("i.created_at >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("i.created_at <= ?")
        params.append(date_to + " 23:59:59")
    if penalties_only:
        conditions.append("COALESCE(i.deduction_amount, 0) > 0")
    where = " AND ".join(conditions)
    rows = db.execute(
        f"""SELECT i.*, u.full_name as employee_name, c.full_name as created_by_name
            FROM incidents i
            JOIN users u ON u.id = i.user_id
            JOIN users c ON c.id = i.created_by
            WHERE {where}
            ORDER BY i.created_at DESC
            LIMIT 200""",
        params,
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.patch("/incidents/{incident_id}/review")
def review_incident(incident_id: int, user=Depends(role_required("director"))):
    db = get_db()
    db.execute("UPDATE incidents SET status = 'reviewed' WHERE id = ?", (incident_id,))
    db.commit()
    row = db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(status_code=404, detail="РРЅС†РёРґРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ")
    return dict(row)


@router.post("/incidents/{incident_id}/photo")
async def upload_incident_photo(incident_id: int, file: UploadFile = File(...), user=Depends(role_required("director", "manager"))):
    db = get_db()
    incident = db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    if not incident:
        db.close()
        raise HTTPException(status_code=404, detail="РРЅС†РёРґРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ")

    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    filename = f"incident_{incident_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    db.execute("UPDATE incidents SET photo = ? WHERE id = ?", (filename, incident_id))
    db.commit()
    db.close()
    return {"filename": filename}


