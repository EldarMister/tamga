from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from backend.database import get_db
from backend.dependencies import get_current_user, role_required
from backend.config import UPLOAD_DIR
import os
import uuid
import mimetypes
from datetime import datetime
from urllib.parse import quote

router = APIRouter(prefix="/api/orders", tags=["orders"])

# Allowed status transitions: {from_status: [(to_status, allowed_roles), ...]}
TRANSITIONS = {
    "created": [("design", ("manager", "director")), ("production", ("manager", "director")), ("cancelled", ("manager", "director")), ("defect", ("manager", "director"))],
    "design": [("production", ("designer", "manager", "director")), ("cancelled", ("manager", "director")), ("defect", ("manager", "director"))],
    "production": [("ready", ("master", "manager", "director")), ("cancelled", ("manager", "director")), ("defect", ("manager", "director"))],
    "ready": [("closed", ("manager", "director")), ("cancelled", ("manager", "director")), ("defect", ("manager", "director"))],
    # Compatibility for legacy statuses
    "design_done": [("production", ("manager", "director", "master")), ("ready", ("manager", "director")), ("cancelled", ("manager", "director")), ("defect", ("manager", "director"))],
    "printed": [("ready", ("manager", "director")), ("cancelled", ("manager", "director")), ("defect", ("manager", "director"))],
    "postprocess": [("ready", ("assistant", "manager", "director")), ("cancelled", ("manager", "director")), ("defect", ("manager", "director"))],
    "defect": [("cancelled", ("manager", "director"))],
}


class OrderItemCreate(BaseModel):
    service_id: int
    quantity: float
    width: float | None = None
    height: float | None = None
    options: dict = {}


class OrderCreate(BaseModel):
    client_name: str
    client_phone: str = ""
    client_type: str = "retail"
    items: list[OrderItemCreate]
    notes: str = ""
    deadline: str | None = None
    assigned_designer: int | None = None
    assigned_master: int | None = None
    assigned_assistant: int | None = None


class StatusUpdate(BaseModel):
    status: str
    note: str = ""


class NotifyRequest(BaseModel):
    message: str | None = None
    channels: list[str] | None = None


def generate_order_number(db) -> str:
    year = datetime.now().year
    prefix = f"POL-{year}-"
    row = db.execute(
        "SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY id DESC LIMIT 1",
        (f"{prefix}%",),
    ).fetchone()
    if row:
        last_num = int(row["order_number"].split("-")[-1])
        return f"{prefix}{last_num + 1:03d}"
    return f"{prefix}001"


def _is_area_unit(unit: str | None) -> bool:
    if not unit:
        return False
    u = unit.lower().replace(" ", "")
    return "м2" in u or "м²" in u or "m2" in u or "m²" in u


def _calc_item_total(unit: str, unit_price: float, quantity: float, width: float | None, height: float | None) -> tuple[float, float]:
    # Returns (item_total, calc_units) where calc_units is base quantity for materials
    if _is_area_unit(unit):
        if not width or not height:
            raise HTTPException(status_code=400, detail="Нужны ширина и высота для услуги в м²")
        area = width * height
        calc_units = area * quantity
        return calc_units * unit_price, calc_units
    calc_units = quantity
    return calc_units * unit_price, calc_units


def _order_select_columns(alias: str = "") -> str:
    p = f"{alias}." if alias else ""
    return (
        f"{p}id, {p}order_number, {p}client_name, {p}client_phone, {p}client_type, {p}status, "
        f"{p}total_price, {p}material_cost, {p}notes, {p}design_file, {p}photo_file, {p}photo_mime, "
        f"CASE WHEN {p}photo_blob IS NOT NULL THEN 1 ELSE 0 END AS has_photo_blob, "
        f"{p}assigned_designer, {p}assigned_master, {p}assigned_assistant, {p}deadline, "
        f"{p}created_by, {p}created_at, {p}updated_at"
    )


def _to_bytes(value) -> bytes | None:
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    if isinstance(value, memoryview):
        return value.tobytes()
    try:
        return bytes(value)
    except Exception:
        return None


def _build_photo_url(order_id: int, updated_at: str | None) -> str:
    if updated_at:
        return f"/api/orders/{order_id}/photo/raw?v={quote(str(updated_at))}"
    return f"/api/orders/{order_id}/photo/raw"


def _serialize_order_row(row) -> dict:
    order = dict(row)
    has_photo_blob = bool(order.get("has_photo_blob")) or bool(order.get("photo_blob"))
    has_photo = bool((order.get("photo_file") or "").strip()) or has_photo_blob
    if has_photo:
        order["photo_url"] = _build_photo_url(order["id"], order.get("updated_at"))
    else:
        order["photo_url"] = ""
    order.pop("photo_blob", None)
    order.pop("photo_mime", None)
    order.pop("has_photo_blob", None)
    return order


@router.get("")
def list_orders(
    status: str = "",
    search: str = "",
    assigned: str = "",
    limit: int = 100,
    offset: int = 0,
    user=Depends(get_current_user),
):
    db = get_db()
    conditions = ["1=1"]
    params = []

    if status:
        if status == "closed":
            conditions.append("o.status IN ('closed','cancelled')")
        else:
            conditions.append("o.status = ?")
            params.append(status)

    if search:
        conditions.append("(o.order_number LIKE ? OR o.client_name LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])

    # Role-based filtering
    if user["role"] == "designer":
        conditions.append("(o.assigned_designer = ? OR o.status = 'design')")
        params.append(user["id"])
    elif user["role"] == "master":
        conditions.append("(o.assigned_master = ? OR o.status IN ('design_done', 'production', 'printed'))")
        params.append(user["id"])
    elif user["role"] == "assistant":
        conditions.append("(o.assigned_assistant = ? OR o.status = 'postprocess')")
        params.append(user["id"])

    where = " AND ".join(conditions)
    rows = db.execute(
        f"SELECT {_order_select_columns('o')} FROM orders o WHERE {where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()

    count = db.execute(f"SELECT COUNT(*) FROM orders o WHERE {where}", params).fetchone()[0]

    orders = [_serialize_order_row(r) for r in rows]
    if orders:
        order_ids = [o["id"] for o in orders]
        placeholders = ",".join(["?"] * len(order_ids))
        all_items = db.execute(
            f"SELECT oi.*, s.name_ru, s.unit FROM order_items oi JOIN services s ON s.id = oi.service_id WHERE oi.order_id IN ({placeholders})",
            order_ids,
        ).fetchall()
        items_by_order = {}
        for item in all_items:
            items_by_order.setdefault(item["order_id"], []).append(dict(item))
        for order in orders:
            order["items"] = items_by_order.get(order["id"], [])
            if user["role"] not in ("director",):
                order.pop("material_cost", None)

    db.close()
    return {"orders": orders, "total": count}


@router.get("/{order_id}")
def get_order(order_id: int, user=Depends(get_current_user)):
    db = get_db()
    order = db.execute(f"SELECT {_order_select_columns()} FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        db.close()
        raise HTTPException(status_code=404, detail="Заказ не найден")

    order = _serialize_order_row(order)
    items = db.execute(
        "SELECT oi.*, s.name_ru, s.code, s.unit FROM order_items oi JOIN services s ON s.id = oi.service_id WHERE oi.order_id = ?",
        (order_id,),
    ).fetchall()
    order["items"] = [dict(i) for i in items]

    history = db.execute(
        "SELECT oh.*, u.full_name FROM order_history oh JOIN users u ON u.id = oh.changed_by WHERE oh.order_id = ? ORDER BY oh.created_at",
        (order_id,),
    ).fetchall()
    order["history"] = [dict(h) for h in history]

    if user["role"] != "director":
        order.pop("material_cost", None)

    db.close()
    return order


@router.get("/{order_id}/photo/raw")
def get_order_photo_raw(order_id: int):
    db = get_db()
    row = db.execute(
        "SELECT id, photo_file, photo_mime, photo_blob FROM orders WHERE id = ?",
        (order_id,),
    ).fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Заказ не найден")

    order = dict(row)
    photo_file = (order.get("photo_file") or "").strip()
    photo_mime = (order.get("photo_mime") or "").strip() or "application/octet-stream"

    if photo_file:
        filepath = os.path.join(UPLOAD_DIR, photo_file)
        if os.path.isfile(filepath):
            db.close()
            media_type = photo_mime if photo_mime.startswith("image/") else None
            return FileResponse(filepath, media_type=media_type)

    photo_blob = _to_bytes(order.get("photo_blob"))
    db.close()
    if photo_blob:
        return Response(
            content=photo_blob,
            media_type=photo_mime,
            headers={"Cache-Control": "public, max-age=300"},
        )

    raise HTTPException(status_code=404, detail="Фото не найдено")


@router.post("")
def create_order(data: OrderCreate, user=Depends(role_required("manager", "director"))):
    db = get_db()
    order_number = generate_order_number(db)

    total_price = 0
    material_cost = 0
    items_data = []

    for item in data.items:
        svc = db.execute("SELECT * FROM services WHERE id = ? AND is_active = 1", (item.service_id,)).fetchone()
        if not svc:
            db.close()
            raise HTTPException(status_code=400, detail=f"Услуга {item.service_id} не найдена")

        unit_price = svc["price_dealer"] if data.client_type == "dealer" and svc["price_dealer"] > 0 else svc["price_retail"]
        item_total, calc_units = _calc_item_total(svc["unit"], unit_price, item.quantity, item.width, item.height)
        total_price += item_total

        # Find material mapping
        mapping = db.execute(
            "SELECT sm.*, m.code as mat_code FROM service_material_map sm JOIN materials m ON m.id = sm.material_id WHERE sm.service_id = ?",
            (svc["id"],),
        ).fetchone()

        material_id = None
        material_qty = 0
        if mapping:
            material_id = mapping["material_id"]
            material_qty = calc_units * mapping["ratio"]
            material_cost += material_qty * svc["cost_price"]

            # Reserve material
            mat = db.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
            available = mat["quantity"] - mat["reserved"]
            if available < material_qty:
                db.close()
                raise HTTPException(
                    status_code=400,
                    detail=f"Недостаточно материала '{mat['name_ru']}': доступно {available:.1f}, нужно {material_qty:.1f}",
                )
            db.execute(
                "UPDATE materials SET reserved = reserved + ?, updated_at = datetime('now') WHERE id = ?",
                (material_qty, material_id),
            )

        items_data.append({
            "service_id": svc["id"],
            "material_id": material_id,
            "quantity": item.quantity,
            "width": item.width,
            "height": item.height,
            "unit_price": unit_price,
            "total": item_total,
            "material_qty": material_qty,
            "options": str(item.options),
        })

    cur = db.execute(
        """INSERT INTO orders (order_number, client_name, client_phone, client_type, total_price, material_cost,
           notes, deadline, assigned_designer, assigned_master, assigned_assistant, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            order_number, data.client_name, data.client_phone, data.client_type,
            total_price, material_cost, data.notes, data.deadline,
            data.assigned_designer, data.assigned_master, data.assigned_assistant, user["id"],
        ),
    )
    order_id = cur.lastrowid

    for it in items_data:
        db.execute(
            """INSERT INTO order_items (order_id, service_id, material_id, quantity, width, height, unit_price, total, material_qty, options)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                order_id, it["service_id"], it["material_id"], it["quantity"],
                it["width"], it["height"], it["unit_price"], it["total"],
                it["material_qty"], it["options"],
            ),
        )
        # Ledger entry for reservation
        if it["material_id"] and it["material_qty"] > 0:
            db.execute(
                "INSERT INTO material_ledger (material_id, order_id, action, quantity, note, performed_by) VALUES (?, ?, 'reserve', ?, 'Резерв при создании заказа', ?)",
                (it["material_id"], order_id, -it["material_qty"], user["id"]),
            )

    # Order history
    db.execute(
        "INSERT INTO order_history (order_id, old_status, new_status, changed_by, note) VALUES (?, NULL, 'created', ?, 'Заказ создан')",
        (order_id, user["id"]),
    )

    db.commit()
    result = db.execute(f"SELECT {_order_select_columns()} FROM orders WHERE id = ?", (order_id,)).fetchone()
    db.close()
    return _serialize_order_row(result)


@router.patch("/{order_id}/status")
def update_status(order_id: int, data: StatusUpdate, user=Depends(get_current_user)):
    db = get_db()
    order = db.execute("SELECT id, status FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        db.close()
        raise HTTPException(status_code=404, detail="Заказ не найден")

    current = order["status"]
    new_status = data.status

    # Validate transition
    allowed = TRANSITIONS.get(current, [])
    valid = False
    for to_status, roles in allowed:
        if to_status == new_status and user["role"] in roles:
            valid = True
            break

    # Director can force any transition
    if user["role"] == "director":
        valid = True

    if not valid:
        db.close()
        raise HTTPException(status_code=400, detail=f"Переход '{current}' -> '{new_status}' не разрешён для роли '{user['role']}'")

    # Side effects
    if new_status == "production":
        # Consume material (move from reserved to consumed)
        items = db.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()
        for item in items:
            if item["material_id"] and item["material_qty"] > 0:
                db.execute(
                    "UPDATE materials SET quantity = quantity - ?, reserved = reserved - ?, updated_at = datetime('now') WHERE id = ?",
                    (item["material_qty"], item["material_qty"], item["material_id"]),
                )
                db.execute(
                    "INSERT INTO material_ledger (material_id, order_id, action, quantity, note, performed_by) VALUES (?, ?, 'consume', ?, 'Списание при печати', ?)",
                    (item["material_id"], order_id, -item["material_qty"], user["id"]),
                )

    elif new_status == "cancelled":
        # Return reserved material
        items = db.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()
        for item in items:
            if item["material_id"] and item["material_qty"] > 0:
                # Only unreserve if not yet consumed (status was before 'printed')
                if current in ("created", "design", "design_done"):
                    db.execute(
                        "UPDATE materials SET reserved = reserved - ?, updated_at = datetime('now') WHERE id = ?",
                        (item["material_qty"], item["material_id"]),
                    )
                    db.execute(
                        "INSERT INTO material_ledger (material_id, order_id, action, quantity, note, performed_by) VALUES (?, ?, 'unreserve', ?, 'Возврат при отмене заказа', ?)",
                        (item["material_id"], order_id, item["material_qty"], user["id"]),
                    )

    db.execute("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", (new_status, order_id))
    db.execute(
        "INSERT INTO order_history (order_id, old_status, new_status, changed_by, note) VALUES (?, ?, ?, ?, ?)",
        (order_id, current, new_status, user["id"], data.note or f"{current} -> {new_status}"),
    )

    if new_status == "ready":
        db.execute(
            "INSERT INTO client_notifications (order_id, channel, message, status) VALUES (?, 'manual', 'Ваш заказ готов. Можете забирать. PolyControl.', 'queued')",
            (order_id,),
        )

    db.commit()
    updated = db.execute(f"SELECT {_order_select_columns()} FROM orders WHERE id = ?", (order_id,)).fetchone()
    db.close()
    return _serialize_order_row(updated)


@router.post("/{order_id}/notify")
def notify_client(order_id: int, data: NotifyRequest, user=Depends(role_required("manager", "director"))):
    db = get_db()
    order = db.execute(f"SELECT {_order_select_columns()} FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        db.close()
        raise HTTPException(status_code=404, detail="Заказ не найден")

    message = data.message or "Ваш заказ готов. Можете забирать. PolyControl."
    channels = data.channels or ["manual"]

    created = []
    for ch in channels:
        cur = db.execute(
            "INSERT INTO client_notifications (order_id, channel, message, status) VALUES (?, ?, ?, 'queued')",
            (order_id, ch, message),
        )
        created.append({"id": cur.lastrowid, "channel": ch})

    db.commit()
    db.close()
    return {"ok": True, "notifications": created}


@router.post("/{order_id}/design")
async def upload_design(order_id: int, file: UploadFile = File(...), user=Depends(get_current_user)):
    if user["role"] not in ("designer", "manager", "director"):
        raise HTTPException(status_code=403, detail="Нет доступа")

    db = get_db()
    order = db.execute("SELECT id FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        db.close()
        raise HTTPException(status_code=404, detail="Заказ не найден")

    # Save file
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    filename = f"design_{order_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    db.execute("UPDATE orders SET design_file = ?, updated_at = datetime('now') WHERE id = ?", (filename, order_id))
    db.commit()
    db.close()
    return {"filename": filename}


@router.post("/{order_id}/photo")
async def upload_photo(order_id: int, file: UploadFile = File(...), user=Depends(get_current_user)):
    db = get_db()
    order = db.execute("SELECT id FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        db.close()
        raise HTTPException(status_code=404, detail="Заказ не найден")

    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    filename = f"order_{order_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()

    photo_mime = (file.content_type or "").strip().lower()
    if not photo_mime.startswith("image/"):
        guessed, _ = mimetypes.guess_type(file.filename or "")
        if guessed and guessed.startswith("image/"):
            photo_mime = guessed
    if not photo_mime:
        photo_mime = "application/octet-stream"

    stored_filename = None
    try:
        with open(filepath, "wb") as f:
            f.write(content)
        stored_filename = filename
    except OSError:
        stored_filename = None

    db.execute(
        "UPDATE orders SET photo_file = ?, photo_mime = ?, photo_blob = ?, updated_at = datetime('now') WHERE id = ?",
        (stored_filename, photo_mime, content, order_id),
    )
    db.commit()
    db.close()
    return {
        "filename": stored_filename,
        "stored_in_fs": bool(stored_filename),
        "stored_in_db": True,
        "url": _build_photo_url(order_id, datetime.now().isoformat()),
    }


@router.put("/{order_id}")
def update_order(order_id: int, data: dict, user=Depends(role_required("manager", "director"))):
    db = get_db()
    order = db.execute(f"SELECT {_order_select_columns()} FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        db.close()
        raise HTTPException(status_code=404, detail="Заказ не найден")

    allowed_fields = ["client_name", "client_phone", "notes", "deadline", "assigned_designer", "assigned_master", "assigned_assistant"]
    updates = {k: v for k, v in data.items() if k in allowed_fields}
    if not updates:
        db.close()
        return _serialize_order_row(order)

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [order_id]
    db.execute(f"UPDATE orders SET {set_clause}, updated_at = datetime('now') WHERE id = ?", values)
    db.commit()

    updated = db.execute(f"SELECT {_order_select_columns()} FROM orders WHERE id = ?", (order_id,)).fetchone()
    db.close()
    return _serialize_order_row(updated)
