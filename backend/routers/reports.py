import csv
import io
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from backend.database import get_db
from backend.dependencies import role_required

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _build_finance_data(db, date_from: str = "", date_to: str = ""):
    conditions = ["status != 'cancelled'"]
    params = []
    if date_from:
        conditions.append("created_at >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("created_at <= ?")
        params.append(date_to + " 23:59:59")
    where = " AND ".join(conditions)

    totals = db.execute(
        f"""SELECT
            COUNT(*) as orders_count,
            COALESCE(SUM(total_price), 0) as revenue,
            COALESCE(SUM(material_cost), 0) as material_cost
            FROM orders WHERE {where}""",
        params,
    ).fetchone()

    pen_conditions = ["1=1"]
    pen_params = []
    if date_from:
        pen_conditions.append("created_at >= ?")
        pen_params.append(date_from)
    if date_to:
        pen_conditions.append("created_at <= ?")
        pen_params.append(date_to + " 23:59:59")
    pen_where = " AND ".join(pen_conditions)

    penalties = db.execute(
        f"SELECT COALESCE(SUM(deduction_amount), 0) as total_penalties FROM incidents WHERE {pen_where} AND deduction_amount > 0",
        pen_params,
    ).fetchone()

    pay_conditions = ["1=1"]
    pay_params = []
    if date_from:
        pay_conditions.append("week_start >= ?")
        pay_params.append(date_from)
    if date_to:
        pay_conditions.append("week_end <= ?")
        pay_params.append(date_to)
    pay_where = " AND ".join(pay_conditions)

    payroll_total = db.execute(
        f"SELECT COALESCE(SUM(total), 0) as total_payroll FROM payroll WHERE {pay_where}",
        pay_params,
    ).fetchone()

    daily = db.execute(
        f"""SELECT date(created_at) as day,
            COUNT(*) as orders_count,
            COALESCE(SUM(total_price), 0) as revenue,
            COALESCE(SUM(material_cost), 0) as cost
            FROM orders WHERE {where}
            GROUP BY date(created_at)
            ORDER BY day DESC
            LIMIT 31""",
        params,
    ).fetchall()

    top_services = db.execute(
        f"""SELECT s.name_ru, COUNT(oi.id) as order_count, COALESCE(SUM(oi.total), 0) as revenue
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN services s ON s.id = oi.service_id
            WHERE o.status != 'cancelled'
            {'AND o.created_at >= ?' if date_from else ''} {'AND o.created_at <= ?' if date_to else ''}
            GROUP BY s.id, s.name_ru
            ORDER BY revenue DESC
            LIMIT 5""",
        ([date_from] if date_from else []) + ([date_to + " 23:59:59"] if date_to else []),
    ).fetchall()

    revenue = totals["revenue"]
    material_cost = totals["material_cost"]
    payroll_sum = payroll_total["total_payroll"]
    penalties_sum = penalties["total_penalties"]
    profit = revenue - material_cost - payroll_sum

    return {
        "revenue": revenue,
        "material_cost": material_cost,
        "payroll": payroll_sum,
        "penalties": penalties_sum,
        "profit": profit,
        "orders_count": totals["orders_count"],
        "daily": [dict(d) for d in daily],
        "top_services": [dict(s) for s in top_services],
    }


@router.get("/orders-summary")
def orders_summary(date_from: str = "", date_to: str = "", user=Depends(role_required("director", "manager"))):
    db = get_db()
    conditions = ["1=1"]
    params = []
    if date_from:
        conditions.append("created_at >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("created_at <= ?")
        params.append(date_to + " 23:59:59")
    where = " AND ".join(conditions)

    by_status = db.execute(
        f"SELECT status, COUNT(*) as count, COALESCE(SUM(total_price), 0) as revenue FROM orders WHERE {where} GROUP BY status",
        params,
    ).fetchall()

    totals = db.execute(
        f"SELECT COUNT(*) as total_orders, COALESCE(SUM(total_price), 0) as total_revenue, COALESCE(SUM(material_cost), 0) as total_cost FROM orders WHERE {where} AND status != 'cancelled'",
        params,
    ).fetchone()

    db.close()
    return {
        "by_status": [dict(r) for r in by_status],
        "totals": dict(totals),
        "profit": totals["total_revenue"] - totals["total_cost"] if totals else 0,
    }


@router.get("/material-usage")
def material_usage(date_from: str = "", date_to: str = "", user=Depends(role_required("director", "manager"))):
    db = get_db()
    conditions = ["ml.action = 'consume'"]
    params = []
    if date_from:
        conditions.append("ml.created_at >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("ml.created_at <= ?")
        params.append(date_to + " 23:59:59")
    where = " AND ".join(conditions)

    rows = db.execute(
        f"""SELECT m.name_ru, m.unit, COALESCE(SUM(ABS(ml.quantity)), 0) as used
            FROM material_ledger ml
            JOIN materials m ON m.id = ml.material_id
            WHERE {where}
            GROUP BY m.id, m.name_ru, m.unit""",
        params,
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.get("/employee-stats")
def employee_stats(date_from: str = "", date_to: str = "", user=Depends(role_required("director"))):
    db = get_db()
    employees = db.execute("SELECT id, full_name, role FROM users WHERE is_active = 1 ORDER BY full_name").fetchall()

    conditions_time = []
    params_base = []
    if date_from:
        conditions_time.append("date >= ?")
        params_base.append(date_from)
    if date_to:
        conditions_time.append("date <= ?")
        params_base.append(date_to)
    time_where = " AND ".join(conditions_time) if conditions_time else "1=1"

    conditions_hist = []
    params_hist = []
    if date_from:
        conditions_hist.append("created_at >= ?")
        params_hist.append(date_from)
    if date_to:
        conditions_hist.append("created_at <= ?")
        params_hist.append(date_to + " 23:59:59")
    hist_where = " AND ".join(conditions_hist) if conditions_hist else "1=1"

    # Batch: attendance days per user
    att_rows = db.execute(
        f"SELECT user_id, COUNT(*) as cnt FROM attendance WHERE {time_where} GROUP BY user_id",
        params_base,
    ).fetchall()
    att_map = {r["user_id"]: r["cnt"] for r in att_rows}

    # Batch: order_history tasks per user
    hist_rows = db.execute(
        f"SELECT changed_by, COUNT(*) as cnt FROM order_history WHERE {hist_where} GROUP BY changed_by",
        params_hist,
    ).fetchall()
    hist_map = {r["changed_by"]: r["cnt"] for r in hist_rows}

    # Batch: incidents per user
    inc_rows = db.execute(
        f"SELECT user_id, COUNT(*) as cnt FROM incidents WHERE {hist_where} GROUP BY user_id",
        params_hist,
    ).fetchall()
    inc_map = {r["user_id"]: r["cnt"] for r in inc_rows}

    result = []
    for emp in employees:
        result.append({
            "id": emp["id"],
            "full_name": emp["full_name"],
            "role": emp["role"],
            "days_worked": att_map.get(emp["id"], 0),
            "tasks_done": hist_map.get(emp["id"], 0),
            "incidents": inc_map.get(emp["id"], 0),
        })

    db.close()
    return result


@router.get("/finance")
def finance_report(date_from: str = "", date_to: str = "", user=Depends(role_required("director"))):
    db = get_db()
    data = _build_finance_data(db, date_from, date_to)
    db.close()
    return data


@router.get("/finance-export.csv")
def finance_export_csv(date_from: str = "", date_to: str = "", user=Depends(role_required("director"))):
    db = get_db()
    data = _build_finance_data(db, date_from, date_to)
    db.close()

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')

    writer.writerow(["Отчет", "Финансы директора"])
    writer.writerow(["Период", f"{date_from or '-'} — {date_to or '-'}"])
    writer.writerow([])

    writer.writerow(["Сводка", "Сумма"])
    writer.writerow(["Выручка", data["revenue"]])
    writer.writerow(["Материалы", data["material_cost"]])
    writer.writerow(["Зарплаты", data["payroll"]])
    writer.writerow(["Штрафы", data["penalties"]])
    writer.writerow(["Прибыль", data["profit"]])
    writer.writerow(["Заказов", data["orders_count"]])
    writer.writerow([])

    writer.writerow(["Динамика по дням"])
    writer.writerow(["Дата", "Заказов", "Доход", "Расход"])
    for d in data["daily"]:
        writer.writerow([d["day"], d["orders_count"], d["revenue"], d["cost"]])
    writer.writerow([])

    writer.writerow(["Топ услуг"])
    writer.writerow(["Услуга", "Кол-во", "Доход"])
    for s in data["top_services"]:
        writer.writerow([s["name_ru"], s["order_count"], s["revenue"]])

    content = output.getvalue()
    output.close()

    filename = f"finance_{date_from or 'all'}_{date_to or 'all'}.csv"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8-sig")),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
