from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.database import get_db
from backend.dependencies import get_current_user, role_required

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


class MaterialAdjust(BaseModel):
    quantity: float
    note: str = ""


@router.get("")
async def get_inventory(user=Depends(get_current_user)):
    if user["role"] not in ("director", "manager", "master"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    db = get_db()
    rows = db.execute("SELECT * FROM materials ORDER BY id").fetchall()
    db.close()
    result = []
    for r in rows:
        m = dict(r)
        m["available"] = m["quantity"] - m["reserved"]
        m["is_low"] = m["available"] < m["low_threshold"]
        result.append(m)
    return result


@router.get("/alerts")
async def get_alerts(user=Depends(get_current_user)):
    if user["role"] not in ("director", "manager"):
        raise HTTPException(status_code=403, detail="Нет доступа")
    db = get_db()
    rows = db.execute("SELECT * FROM materials WHERE (quantity - reserved) < low_threshold ORDER BY id").fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.get("/{material_id}/ledger")
async def get_ledger(material_id: int, limit: int = 50, offset: int = 0, user=Depends(role_required("director", "manager"))):
    db = get_db()
    rows = db.execute(
        """SELECT ml.*, u.full_name, o.order_number
           FROM material_ledger ml
           JOIN users u ON u.id = ml.performed_by
           LEFT JOIN orders o ON o.id = ml.order_id
           WHERE ml.material_id = ?
           ORDER BY ml.created_at DESC LIMIT ? OFFSET ?""",
        (material_id, limit, offset),
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("/{material_id}/receive")
async def receive_material(material_id: int, data: MaterialAdjust, user=Depends(role_required("director", "manager"))):
    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Количество должно быть положительным")
    db = get_db()
    mat = db.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    if not mat:
        db.close()
        raise HTTPException(status_code=404, detail="Материал не найден")

    db.execute("UPDATE materials SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?", (data.quantity, material_id))
    db.execute(
        "INSERT INTO material_ledger (material_id, action, quantity, note, performed_by) VALUES (?, 'receive', ?, ?, ?)",
        (material_id, data.quantity, data.note or "Приход материала", user["id"]),
    )
    db.commit()
    updated = db.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    db.close()
    result = dict(updated)
    result["available"] = result["quantity"] - result["reserved"]
    return result


@router.post("/{material_id}/correction")
async def correct_material(material_id: int, data: MaterialAdjust, user=Depends(role_required("director", "manager"))):
    db = get_db()
    mat = db.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    if not mat:
        db.close()
        raise HTTPException(status_code=404, detail="Материал не найден")

    db.execute("UPDATE materials SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?", (data.quantity, material_id))
    db.execute(
        "INSERT INTO material_ledger (material_id, action, quantity, note, performed_by) VALUES (?, 'correction', ?, ?, ?)",
        (material_id, data.quantity, data.note or "Корректировка", user["id"]),
    )
    db.commit()
    updated = db.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    db.close()
    result = dict(updated)
    result["available"] = result["quantity"] - result["reserved"]
    return result
