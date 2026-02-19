from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.database import get_db
from backend.dependencies import get_current_user, role_required

router = APIRouter(tags=["work_journal"])

MAX_RANGE_DAYS = 93


class LeaveRequestCreate(BaseModel):
    user_id: int | None = None
    type: str
    reason: str
    date_start: str
    date_end: str | None = None
    days_count: int | None = None


class LeaveRequestStatusUpdate(BaseModel):
    status: str
    review_note: str = ""


def _parse_date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Некорректная дата: {field}")


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None


def _date_range(from_date: date, to_date: date):
    days = (to_date - from_date).days
    for i in range(days + 1):
        yield from_date + timedelta(days=i)


def _validate_period(date_from: str = "", date_to: str = "") -> tuple[date, date]:
    today = date.today()
    if date_from and date_to:
        from_d = _parse_date(date_from, "date_from")
        to_d = _parse_date(date_to, "date_to")
    elif date_from:
        from_d = _parse_date(date_from, "date_from")
        to_d = today
    elif date_to:
        to_d = _parse_date(date_to, "date_to")
        from_d = to_d - timedelta(days=29)
    else:
        to_d = today
        from_d = today - timedelta(days=29)

    if from_d > to_d:
        raise HTTPException(status_code=400, detail="date_from не может быть больше date_to")
    if (to_d - from_d).days + 1 > MAX_RANGE_DAYS:
        raise HTTPException(status_code=400, detail=f"Максимальный диапазон: {MAX_RANGE_DAYS} дней")
    return from_d, to_d


def _calc_hours(check_in: str | None, check_out: str | None) -> float:
    start_dt = _parse_datetime(check_in)
    end_dt = _parse_datetime(check_out)
    if not start_dt or not end_dt:
        return 0.0
    hours = (end_dt - start_dt).total_seconds() / 3600.0
    return round(max(hours, 0.0), 2)


def _is_weekday(day: date) -> bool:
    return day.weekday() < 5


def _leave_row_dict(row):
    result = dict(row)
    for key in ("reviewed_by", "reviewed_at", "review_note"):
        if key not in result:
            result[key] = None
    return result


def _fetch_leave_requests(db, where: str, params: list, limit: int | None = None, offset: int = 0):
    paging = ""
    paging_params = []
    if limit is not None:
        paging = " LIMIT ? OFFSET ?"
        paging_params.extend([limit, offset])

    rows = db.execute(
        f"""SELECT lr.*,
                   u.full_name as user_name,
                   c.full_name as created_by_name,
                   rv.full_name as reviewed_by_name
            FROM leave_requests lr
            JOIN users u ON u.id = lr.user_id
            JOIN users c ON c.id = lr.created_by
            LEFT JOIN users rv ON rv.id = lr.reviewed_by
            WHERE {where}
            ORDER BY lr.created_at DESC{paging}""",
        params + paging_params,
    ).fetchall()
    return [_leave_row_dict(r) for r in rows]


@router.get("/api/work-journal")
def get_work_journal(
    date_from: str = "",
    date_to: str = "",
    user_id: int = 0,
    sort_by: str = "",
    sort_dir: str = "desc",
    user=Depends(get_current_user),
):
    from_d, to_d = _validate_period(date_from, date_to)
    from_iso = from_d.isoformat()
    to_iso = to_d.isoformat()
    to_ts = f"{to_iso} 23:59:59"
    day_list = [d.isoformat() for d in _date_range(from_d, to_d)]

    db = get_db()
    conditions = ["is_active = 1"]
    params: list = []
    if user_id:
        conditions.append("id = ?")
        params.append(user_id)
    where_users = " AND ".join(conditions)
    users = db.execute(
        f"SELECT id, full_name, role FROM users WHERE {where_users} ORDER BY full_name",
        params,
    ).fetchall()

    if not users:
        db.close()
        return {
            "period": {"date_from": from_iso, "date_to": to_iso, "days": day_list},
            "items": [],
            "insights": {"most_hours": None, "most_fines": None, "best_tasks": None},
        }

    user_ids = [u["id"] for u in users]
    placeholders = ",".join(["?"] * len(user_ids))

    attendance_rows = db.execute(
        f"""SELECT user_id, date, check_in, check_out
            FROM attendance
            WHERE user_id IN ({placeholders}) AND date BETWEEN ? AND ?""",
        user_ids + [from_iso, to_iso],
    ).fetchall()
    attendance_map = {(r["user_id"], r["date"]): dict(r) for r in attendance_rows}

    fine_rows = db.execute(
        f"""SELECT user_id,
                   COUNT(*) as fines_count,
                   COALESCE(SUM(deduction_amount), 0) as fines_sum
            FROM incidents
            WHERE user_id IN ({placeholders})
              AND deduction_amount > 0
              AND created_at BETWEEN ? AND ?
            GROUP BY user_id""",
        user_ids + [from_iso, to_ts],
    ).fetchall()
    fine_map = {r["user_id"]: {"fines_count": int(r["fines_count"]), "fines_sum": float(r["fines_sum"] or 0)} for r in fine_rows}

    task_rows = db.execute(
        f"""SELECT assigned_to as user_id, COUNT(*) as tasks_done_count
            FROM tasks
            WHERE assigned_to IN ({placeholders})
              AND is_done = 1
              AND done_at IS NOT NULL
              AND done_at BETWEEN ? AND ?
            GROUP BY assigned_to""",
        user_ids + [from_iso, to_ts],
    ).fetchall()
    task_map = {r["user_id"]: int(r["tasks_done_count"]) for r in task_rows}

    leave_rows = db.execute(
        f"""SELECT user_id, type, date_start, date_end
            FROM leave_requests
            WHERE user_id IN ({placeholders})
              AND status = 'approved'
              AND date_start <= ?
              AND date_end >= ?""",
        user_ids + [to_iso, from_iso],
    ).fetchall()
    db.close()

    leave_days_map: dict[int, dict[str, str]] = {uid: {} for uid in user_ids}
    for row in leave_rows:
        uid = row["user_id"]
        leave_type = row["type"]
        start = max(_parse_date(row["date_start"], "date_start"), from_d)
        end = min(_parse_date(row["date_end"], "date_end"), to_d)
        for day in _date_range(start, end):
            leave_days_map[uid][day.isoformat()] = leave_type

    items = []
    for u in users:
        uid = u["id"]
        total_hours = 0.0
        absent_days = 0
        worked_days = 0
        leave_days = 0
        conflict_days = 0
        daily = []

        for day in _date_range(from_d, to_d):
            day_iso = day.isoformat()
            attendance = attendance_map.get((uid, day_iso))
            leave_type = leave_days_map.get(uid, {}).get(day_iso)

            if attendance:
                hours = _calc_hours(attendance.get("check_in"), attendance.get("check_out"))
                total_hours += hours
                worked_days += 1
                if leave_type:
                    status = "conflict"
                    conflict_days += 1
                else:
                    status = "worked"
            elif leave_type:
                status = "leave"
                hours = 0.0
                leave_days += 1
            elif _is_weekday(day):
                status = "absent"
                hours = 0.0
                absent_days += 1
            else:
                status = "weekend"
                hours = 0.0

            daily.append(
                {
                    "date": day_iso,
                    "status": status,
                    "hours": round(hours, 2),
                    "leave_type": leave_type if status in ("leave", "conflict") else None,
                }
            )

        fines = fine_map.get(uid, {"fines_count": 0, "fines_sum": 0.0})
        tasks_done = task_map.get(uid, 0)

        items.append(
            {
                "user_id": uid,
                "full_name": u["full_name"],
                "role": u["role"],
                "total_hours": round(total_hours, 2),
                "worked_days": worked_days,
                "absent_days": absent_days,
                "leave_days": leave_days,
                "conflict_days": conflict_days,
                "fines_count": fines["fines_count"],
                "fines_sum": round(fines["fines_sum"], 2),
                "tasks_done_count": tasks_done,
                "days": daily,
            }
        )

    key_map = {
        "hours": lambda x: x["total_hours"],
        "fines": lambda x: x["fines_sum"],
        "tasks": lambda x: x["tasks_done_count"],
    }
    reverse = str(sort_dir).lower() != "asc"
    if sort_by in key_map:
        items.sort(key=key_map[sort_by], reverse=reverse)
    else:
        items.sort(key=lambda x: x["full_name"])

    def _top_by(field: str):
        if not items:
            return None
        top = max(items, key=lambda x: x[field])
        return {
            "user_id": top["user_id"],
            "full_name": top["full_name"],
            "role": top["role"],
            "value": top[field],
        }

    return {
        "period": {"date_from": from_iso, "date_to": to_iso, "days": day_list},
        "items": items,
        "insights": {
            "most_hours": _top_by("total_hours"),
            "most_fines": _top_by("fines_sum"),
            "best_tasks": _top_by("tasks_done_count"),
        },
    }


@router.post("/api/leave-requests")
def create_leave_request(data: LeaveRequestCreate, user=Depends(get_current_user)):
    req_type = (data.type or "").strip().lower()
    if req_type not in ("sick", "rest"):
        raise HTTPException(status_code=400, detail="Тип заявки: sick или rest")

    reason = (data.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Укажите причину")

    start = _parse_date(data.date_start, "date_start")
    if data.date_end:
        end = _parse_date(data.date_end, "date_end")
        if end < start:
            raise HTTPException(status_code=400, detail="date_end не может быть раньше date_start")
        days_count = (end - start).days + 1
    elif data.days_count is not None:
        if data.days_count < 1:
            raise HTTPException(status_code=400, detail="days_count должен быть больше 0")
        days_count = int(data.days_count)
        end = start + timedelta(days=days_count - 1)
    else:
        raise HTTPException(status_code=400, detail="Укажите date_end или days_count")

    db = get_db()
    if user["role"] in ("director", "manager"):
        target_user_id = int(data.user_id) if data.user_id else user["id"]
    else:
        target_user_id = user["id"]

    target = db.execute(
        "SELECT id FROM users WHERE id = ? AND is_active = 1",
        (target_user_id,),
    ).fetchone()
    if not target:
        db.close()
        raise HTTPException(status_code=400, detail="Сотрудник не найден или неактивен")

    cur = db.execute(
        """INSERT INTO leave_requests (user_id, type, reason, date_start, date_end, days_count, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)""",
        (
            target_user_id,
            req_type,
            reason,
            start.isoformat(),
            end.isoformat(),
            days_count,
            user["id"],
        ),
    )
    db.commit()
    rows = _fetch_leave_requests(db, "lr.id = ?", [cur.lastrowid])
    db.close()
    return rows[0]


@router.get("/api/leave-requests")
def list_leave_requests(
    status: str = "",
    user_id: int = 0,
    date_from: str = "",
    date_to: str = "",
    limit: int = 100,
    offset: int = 0,
    user=Depends(get_current_user),
):
    db = get_db()
    conditions = ["1=1"]
    params: list = []

    if user["role"] in ("director", "manager"):
        if user_id:
            conditions.append("lr.user_id = ?")
            params.append(user_id)
    else:
        conditions.append("lr.user_id = ?")
        params.append(user["id"])

    if status:
        s = status.strip().lower()
        if s not in ("pending", "approved", "rejected"):
            db.close()
            raise HTTPException(status_code=400, detail="status: pending|approved|rejected")
        conditions.append("lr.status = ?")
        params.append(s)

    if date_from:
        from_d = _parse_date(date_from, "date_from")
        conditions.append("lr.date_end >= ?")
        params.append(from_d.isoformat())
    if date_to:
        to_d = _parse_date(date_to, "date_to")
        conditions.append("lr.date_start <= ?")
        params.append(to_d.isoformat())

    safe_limit = max(1, min(int(limit), 500))
    safe_offset = max(0, int(offset))
    where = " AND ".join(conditions)
    rows = _fetch_leave_requests(db, where, params, safe_limit, safe_offset)

    count_row = db.execute(
        f"SELECT COUNT(*) as cnt FROM leave_requests lr WHERE {where}",
        params,
    ).fetchone()
    db.close()
    return {"items": rows, "total": int(count_row["cnt"])}


@router.patch("/api/leave-requests/{request_id}/status")
def review_leave_request(
    request_id: int,
    data: LeaveRequestStatusUpdate,
    user=Depends(role_required("director", "manager")),
):
    new_status = (data.status or "").strip().lower()
    if new_status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status: approved|rejected")

    db = get_db()
    row = db.execute("SELECT * FROM leave_requests WHERE id = ?", (request_id,)).fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    row = dict(row)

    if row["status"] != "pending":
        db.close()
        raise HTTPException(status_code=400, detail="Можно менять только pending-заявки")
    if row["user_id"] == user["id"]:
        db.close()
        raise HTTPException(status_code=403, detail="Нельзя одобрять или отклонять свою заявку")

    db.execute(
        """UPDATE leave_requests
           SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ?
           WHERE id = ?""",
        (new_status, user["id"], (data.review_note or "").strip(), request_id),
    )
    db.commit()
    rows = _fetch_leave_requests(db, "lr.id = ?", [request_id])
    db.close()
    return rows[0]
