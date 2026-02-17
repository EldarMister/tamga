from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.database import get_db
from backend.dependencies import role_required

router = APIRouter(prefix="/api/payroll", tags=["payroll"])


class PayrollEntry(BaseModel):
    user_id: int
    month_start: str | None = None
    month_end: str | None = None
    # Backward compatibility
    week_start: str | None = None
    week_end: str | None = None
    base_salary: float = 0
    bonus: float = 0
    deductions: float = 0
    note: str = ""


def _period_start(data: PayrollEntry) -> str | None:
    return data.month_start or data.week_start


def _period_end(data: PayrollEntry) -> str | None:
    return data.month_end or data.week_end


@router.get("")
async def list_payroll(month_start: str = "", week_start: str = "", user=Depends(role_required("director"))):
    db = get_db()
    target_start = month_start or week_start
    if target_start:
        rows = db.execute(
            """SELECT p.*, u.full_name, u.role FROM payroll p
               JOIN users u ON u.id = p.user_id
               WHERE p.week_start = ?
               ORDER BY u.full_name""",
            (target_start,),
        ).fetchall()
    else:
        rows = db.execute(
            """SELECT p.*, u.full_name, u.role FROM payroll p
               JOIN users u ON u.id = p.user_id
               ORDER BY p.week_start DESC, u.full_name
               LIMIT 50""",
        ).fetchall()
    db.close()
    return [dict(r) for r in rows]


async def _period_report(period_start: str, period_end: str):
    db = get_db()
    employees = db.execute("SELECT * FROM users WHERE is_active = 1 AND role != 'director' ORDER BY full_name").fetchall()

    period_end_ts = period_end + " 23:59:59"

    # Batch: attendance days
    att_rows = db.execute(
        "SELECT user_id, COUNT(*) as cnt FROM attendance WHERE date BETWEEN ? AND ? GROUP BY user_id",
        (period_start, period_end),
    ).fetchall()
    att_map = {r["user_id"]: r["cnt"] for r in att_rows}

    # Batch: order_history tasks (design_done for designers)
    design_rows = db.execute(
        "SELECT changed_by, COUNT(*) as cnt FROM order_history WHERE new_status = 'design_done' AND created_at BETWEEN ? AND ? GROUP BY changed_by",
        (period_start, period_end_ts),
    ).fetchall()
    design_map = {r["changed_by"]: r["cnt"] for r in design_rows}

    # Batch: order_history tasks (printed/ready for master/assistant)
    prod_rows = db.execute(
        "SELECT changed_by, COUNT(*) as cnt FROM order_history WHERE new_status IN ('printed', 'ready') AND created_at BETWEEN ? AND ? GROUP BY changed_by",
        (period_start, period_end_ts),
    ).fetchall()
    prod_map = {r["changed_by"]: r["cnt"] for r in prod_rows}

    # Batch: all order_history tasks (for manager)
    all_hist_rows = db.execute(
        "SELECT changed_by, COUNT(*) as cnt FROM order_history WHERE created_at BETWEEN ? AND ? GROUP BY changed_by",
        (period_start, period_end_ts),
    ).fetchall()
    all_hist_map = {r["changed_by"]: r["cnt"] for r in all_hist_rows}

    # Batch: incidents
    all_incidents = db.execute(
        "SELECT * FROM incidents WHERE created_at BETWEEN ? AND ?",
        (period_start, period_end_ts),
    ).fetchall()
    incidents_by_user = {}
    for i in all_incidents:
        incidents_by_user.setdefault(i["user_id"], []).append(i)

    # Batch: payroll
    payroll_rows = db.execute(
        "SELECT * FROM payroll WHERE week_start = ?",
        (period_start,),
    ).fetchall()
    payroll_map = {r["user_id"]: r for r in payroll_rows}

    report = []
    for emp in employees:
        uid = emp["id"]
        if emp["role"] == "designer":
            tasks = design_map.get(uid, 0)
        elif emp["role"] in ("master", "assistant"):
            tasks = prod_map.get(uid, 0)
        else:
            tasks = all_hist_map.get(uid, 0)

        user_incidents = incidents_by_user.get(uid, [])
        penalties_total = sum((i["deduction_amount"] or 0) for i in user_incidents)
        payroll = payroll_map.get(uid)

        report.append({
            "employee": dict(emp),
            "days_worked": att_map.get(uid, 0),
            "tasks_done": tasks,
            "incidents": [dict(i) for i in user_incidents],
            "penalties_total": penalties_total,
            "payroll": dict(payroll) if payroll else None,
        })

    db.close()
    return report


@router.get("/month-report")
async def month_report(month_start: str, month_end: str, user=Depends(role_required("director"))):
    return await _period_report(month_start, month_end)


@router.get("/week-report")
async def week_report(week_start: str, week_end: str, user=Depends(role_required("director"))):
    # Backward compatibility route.
    return await _period_report(week_start, week_end)


@router.post("")
async def save_payroll(data: PayrollEntry, user=Depends(role_required("director"))):
    period_start = _period_start(data)
    period_end = _period_end(data)
    if not period_start or not period_end:
        raise HTTPException(status_code=400, detail="Нужны month_start и month_end")

    db = get_db()
    total = data.base_salary + data.bonus - data.deductions

    existing = db.execute(
        "SELECT * FROM payroll WHERE user_id = ? AND week_start = ?",
        (data.user_id, period_start),
    ).fetchone()

    if existing:
        db.execute(
            """UPDATE payroll SET base_salary = ?, bonus = ?, deductions = ?, total = ?, note = ?, week_end = ?
               WHERE id = ?""",
            (data.base_salary, data.bonus, data.deductions, total, data.note, period_end, existing["id"]),
        )
        payroll_id = existing["id"]
    else:
        cur = db.execute(
            """INSERT INTO payroll (user_id, week_start, week_end, base_salary, bonus, deductions, total, note, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (data.user_id, period_start, period_end, data.base_salary, data.bonus, data.deductions, total, data.note, user["id"]),
        )
        payroll_id = cur.lastrowid

    db.commit()
    row = db.execute("SELECT * FROM payroll WHERE id = ?", (payroll_id,)).fetchone()
    db.close()
    return dict(row)


@router.patch("/{payroll_id}/pay")
async def mark_paid(payroll_id: int, user=Depends(role_required("director"))):
    db = get_db()
    row = db.execute("SELECT * FROM payroll WHERE id = ?", (payroll_id,)).fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Запись не найдена")
    db.execute("UPDATE payroll SET is_paid = 1, paid_at = datetime('now') WHERE id = ?", (payroll_id,))
    db.commit()
    updated = db.execute("SELECT * FROM payroll WHERE id = ?", (payroll_id,)).fetchone()
    db.close()
    return dict(updated)
