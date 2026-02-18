from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.database import get_db
from backend.dependencies import get_current_user, role_required

router = APIRouter(prefix="/api/announcements", tags=["announcements"])


class AnnouncementCreate(BaseModel):
    message: str
    target_user_id: int | None = None


@router.get("")
def list_announcements(unread: int = 0, user=Depends(get_current_user)):
    db = get_db()
    conditions = ["(a.target_user_id IS NULL OR a.target_user_id = ?)"]
    params = [user["id"]]
    if unread:
        conditions.append("r.id IS NULL")

    where = " AND ".join(conditions)
    rows = db.execute(
        f"""SELECT a.*, u.full_name as created_by_name,
            CASE WHEN r.id IS NULL THEN 0 ELSE 1 END as is_read
            FROM announcements a
            JOIN users u ON u.id = a.created_by
            LEFT JOIN announcement_reads r
              ON r.announcement_id = a.id AND r.user_id = ?
            WHERE {where}
            ORDER BY a.created_at DESC
            LIMIT 100""",
        [user["id"]] + params,
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("")
def create_announcement(data: AnnouncementCreate, user=Depends(role_required("director"))):
    if not data.message.strip():
        raise HTTPException(status_code=400, detail="Сообщение пустое")

    db = get_db()
    cur = db.execute(
        "INSERT INTO announcements (message, target_user_id, created_by) VALUES (?, ?, ?)",
        (data.message.strip(), data.target_user_id, user["id"]),
    )
    ann_id = cur.lastrowid
    row = db.execute("SELECT * FROM announcements WHERE id = ?", (ann_id,)).fetchone()
    db.commit()
    db.close()
    return dict(row)


@router.post("/{announcement_id}/read")
def mark_read(announcement_id: int, user=Depends(get_current_user)):
    db = get_db()
    db.execute(
        """INSERT INTO announcement_reads (announcement_id, user_id)
           VALUES (?, ?)
           ON CONFLICT(announcement_id, user_id) DO NOTHING""",
        (announcement_id, user["id"]),
    )
    db.commit()
    db.close()
    return {"ok": True}
