from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.database import get_db
from backend.dependencies import get_current_user, role_required

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    type: str = "daily"
    assigned_to: int
    due_date: str = None


@router.get("")
def list_tasks(type: str = "", assigned_to: int = 0, done: str = "", user=Depends(get_current_user)):
    db = get_db()
    conditions = ["1=1"]
    params = []

    # Regular employees only see their own tasks
    if user["role"] in ("designer", "master", "assistant"):
        conditions.append("t.assigned_to = ?")
        params.append(user["id"])
    elif assigned_to:
        conditions.append("t.assigned_to = ?")
        params.append(assigned_to)

    if type:
        conditions.append("t.type = ?")
        params.append(type)

    if done == "0":
        conditions.append("t.is_done = 0")
    elif done == "1":
        conditions.append("t.is_done = 1")

    where = " AND ".join(conditions)
    rows = db.execute(
        f"""SELECT t.*, u.full_name as assigned_name, c.full_name as assigned_by_name
            FROM tasks t
            JOIN users u ON u.id = t.assigned_to
            JOIN users c ON c.id = t.assigned_by
            WHERE {where}
            ORDER BY t.is_done ASC, t.created_at DESC
            LIMIT 100""",
        params,
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("")
def create_task(data: TaskCreate, user=Depends(role_required("director", "manager"))):
    if data.type not in ("daily", "weekly"):
        raise HTTPException(status_code=400, detail="Тип задачи: daily или weekly")
    db = get_db()
    target = db.execute("SELECT id FROM users WHERE id = ? AND is_active = 1", (data.assigned_to,)).fetchone()
    if not target:
        db.close()
        raise HTTPException(status_code=400, detail="Сотрудник не найден")

    cur = db.execute(
        "INSERT INTO tasks (title, description, type, assigned_to, assigned_by, due_date) VALUES (?, ?, ?, ?, ?, ?)",
        (data.title, data.description, data.type, data.assigned_to, user["id"], data.due_date),
    )
    db.commit()
    row = db.execute(
        """SELECT t.*, u.full_name as assigned_name, c.full_name as assigned_by_name
           FROM tasks t JOIN users u ON u.id = t.assigned_to JOIN users c ON c.id = t.assigned_by
           WHERE t.id = ?""",
        (cur.lastrowid,),
    ).fetchone()
    db.close()
    return dict(row)


@router.patch("/{task_id}/done")
def toggle_task(task_id: int, user=Depends(get_current_user)):
    db = get_db()
    task = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not task:
        db.close()
        raise HTTPException(status_code=404, detail="Задача не найдена")

    # Only assignee, manager, or director can toggle
    if user["role"] in ("designer", "master", "assistant") and task["assigned_to"] != user["id"]:
        db.close()
        raise HTTPException(status_code=403, detail="Нет доступа")

    new_done = 0 if task["is_done"] else 1
    done_at = "datetime('now')" if new_done else "NULL"
    db.execute(f"UPDATE tasks SET is_done = ?, done_at = {done_at} WHERE id = ?", (new_done, task_id))
    db.commit()
    db.close()
    return {"id": task_id, "is_done": new_done}


@router.delete("/{task_id}")
def delete_task(task_id: int, user=Depends(role_required("director", "manager"))):
    db = get_db()
    db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    db.commit()
    db.close()
    return {"ok": True}
