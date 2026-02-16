from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.database import get_db
from backend.dependencies import get_current_user, role_required

router = APIRouter(prefix="/api/pricelist", tags=["pricelist"])


class PriceUpdate(BaseModel):
    price_retail: float
    price_dealer: float
    cost_price: float | None = None


@router.get("")
async def get_pricelist(user=Depends(get_current_user)):
    db = get_db()
    rows = db.execute("SELECT * FROM services WHERE is_active = 1 ORDER BY id").fetchall()
    db.close()
    result = []
    for r in rows:
        item = dict(r)
        # Hide cost_price from non-director
        if user["role"] != "director":
            item.pop("cost_price", None)
        result.append(item)
    return result


@router.put("/{service_id}")
async def update_price(service_id: int, data: PriceUpdate, user=Depends(role_required("director"))):
    db = get_db()
    svc = db.execute("SELECT * FROM services WHERE id = ?", (service_id,)).fetchone()
    if not svc:
        db.close()
        raise HTTPException(status_code=404, detail="Услуга не найдена")

    # Save price history
    db.execute(
        "INSERT INTO price_history (service_id, price_retail, price_dealer, changed_by) VALUES (?, ?, ?, ?)",
        (service_id, svc["price_retail"], svc["price_dealer"], user["id"]),
    )

    update_fields = {"price_retail": data.price_retail, "price_dealer": data.price_dealer}
    if data.cost_price is not None:
        update_fields["cost_price"] = data.cost_price

    set_clause = ", ".join(f"{k} = ?" for k in update_fields)
    values = list(update_fields.values()) + [service_id]
    db.execute(f"UPDATE services SET {set_clause}, updated_at = datetime('now') WHERE id = ?", values)
    db.commit()

    updated = db.execute("SELECT * FROM services WHERE id = ?", (service_id,)).fetchone()
    db.close()
    return dict(updated)
