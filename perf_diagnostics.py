import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta

from fastapi.testclient import TestClient
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
BASE_URL = "http://127.0.0.1:8010"
os.environ["POLYCONTROL_DATABASE_URL"] = "sqlite:///local.db"
os.environ["DATABASE_URL"] = "sqlite:///local.db"
PERF_DB_PATH = os.path.join(ROOT, "polycontrol.perf.db")
os.environ["POLYCONTROL_DB_PATH"] = PERF_DB_PATH


class HttpError(Exception):
    pass


def prepare_perf_db():
    src = os.path.join(ROOT, "polycontrol.db")
    if os.path.exists(PERF_DB_PATH):
        os.remove(PERF_DB_PATH)
    shutil.copyfile(src, PERF_DB_PATH)


def ensure_diag_user():
    from backend.auth import hash_password
    from backend.database import get_db

    username = "perfdiag"
    password = "perfdiag123"
    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        db.execute(
            """UPDATE users
               SET password_hash = ?, full_name = ?, role = 'director', is_active = 1
               WHERE username = ?""",
            (hash_password(password), "Perf Diag", username),
        )
    else:
        db.execute(
            """INSERT INTO users (username, password_hash, full_name, role, phone, is_active, lang)
               VALUES (?, ?, ?, 'director', ?, 1, 'ru')""",
            (username, hash_password(password), "Perf Diag", "+10000000000"),
        )
    db.commit()
    db.close()
    return username, password


def http_json(path, method="GET", token=None, payload=None, headers=None):
    url = BASE_URL + path
    body = None
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    if token:
        req_headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
            text = data.decode("utf-8") if data else ""
            return {
                "status": resp.getcode(),
                "headers": dict(resp.headers.items()),
                "bytes": len(data),
                "json": json.loads(text) if text else None,
            }
    except urllib.error.HTTPError as e:
        data = e.read()
        text = data.decode("utf-8") if data else ""
        try:
            parsed = json.loads(text) if text else None
        except Exception:
            parsed = None
        raise HttpError({"status": e.code, "body": parsed or text})


def wait_server(timeout=30):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(BASE_URL + "/", timeout=2) as resp:
                if resp.getcode() == 200:
                    return True
        except Exception:
            time.sleep(0.2)
    return False


def ensure_order_http(token):
    orders = http_json("/api/orders?limit=1", token=token)["json"]
    if orders and orders.get("orders"):
        return orders["orders"][0]["id"]
    services = http_json("/api/pricelist", token=token)["json"] or []
    service = next((s for s in services if s.get("code") == "table"), services[0] if services else None)
    if not service:
        return None
    created = http_json(
        "/api/orders",
        method="POST",
        token=token,
        payload={
            "client_name": "Perf Test",
            "client_phone": "+1000000000",
            "client_type": "retail",
            "items": [{"service_id": service["id"], "quantity": 1, "options": {}}],
            "notes": "perf",
        },
    )["json"]
    return created["id"]


def run_http_api_scan(token, order_id):
    today = date.today()
    month_ago = today - timedelta(days=30)
    endpoints = [
        ("GET", "/api/orders?limit=100&offset=0", None),
        ("GET", f"/api/orders/{order_id}", None),
        ("GET", "/api/inventory", None),
        ("GET", "/api/pricelist", None),
        ("GET", "/api/hr/my-attendance", None),
        ("GET", "/api/hr/shift-tasks", None),
        ("GET", "/api/hr/attendance/today", None),
        ("GET", "/api/users", None),
        ("GET", "/api/tasks?type=daily", None),
        ("GET", f"/api/reports/orders-summary?date_from={month_ago}&date_to={today}", None),
        ("GET", f"/api/reports/finance?date_from={month_ago}&date_to={today}", None),
        ("GET", f"/api/payroll/month-report?month_start={today.replace(day=1)}&month_end={today}", None),
        ("GET", "/api/training", None),
        ("GET", "/api/announcements", None),
        ("GET", f"/api/hr/incidents?date_from={month_ago}&date_to={today}", None),
    ]

    results = []
    for method, path, payload in endpoints:
        runs = []
        for _ in range(5):
            try:
                t0 = time.perf_counter()
                resp = http_json(path, method=method, token=token, payload=payload)
                elapsed = (time.perf_counter() - t0) * 1000
                runs.append(
                    {
                        "elapsed_ms": round(elapsed, 2),
                        "bytes": resp["bytes"],
                        "x_response_time_s": resp["headers"].get("X-Response-Time"),
                        "status": resp["status"],
                    }
                )
            except Exception as err:
                runs.append({"error": str(err)})
                break
        results.append({"endpoint": f"{method} {path}", "runs": runs})

    static_checks = []
    for path in ["/js/app.js", "/css/app.css", "/js/api.js"]:
        try:
            req = urllib.request.Request(
                BASE_URL + path,
                headers={"Accept-Encoding": "gzip, br"},
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                body = resp.read()
                static_checks.append(
                    {
                        "path": path,
                        "status": resp.getcode(),
                        "bytes": len(body),
                        "cache_control": resp.headers.get("Cache-Control"),
                        "etag": resp.headers.get("ETag"),
                        "content_encoding": resp.headers.get("Content-Encoding"),
                        "last_modified": resp.headers.get("Last-Modified"),
                    }
                )
        except Exception as err:
            static_checks.append({"path": path, "error": str(err)})

    return {"api": results, "static": static_checks}


async def run_frontend_scan(order_id, token, user_obj):
    routes = [
        "/dashboard",
        "/orders",
        "/orders/new",
        f"/orders/{order_id}",
        "/inventory",
        "/pricelist",
        "/hr",
        "/payroll",
        "/users",
        "/reports",
        "/fines",
        "/announcements",
        "/shift-checklist",
        "/profile",
        "/more",
        "/tasks",
        "/training",
    ]

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        route_stats = []
        init_script = """
            (() => {
                window.__pcFetchLog = [];
                window.__pcLongTasks = [];
                const origFetch = window.fetch.bind(window);
                window.fetch = async (...args) => {
                    const input = args[0];
                    const init = args[1] || {};
                    const method = (init.method || 'GET').toUpperCase();
                    const url = typeof input === 'string' ? input : input.url;
                    const started = performance.now();
                    try {
                        const res = await origFetch(...args);
                        let bytes = 0;
                        try {
                            const buf = await res.clone().arrayBuffer();
                            bytes = buf.byteLength;
                        } catch (_) {}
                        window.__pcFetchLog.push({
                            url,
                            method,
                            status: res.status,
                            duration: performance.now() - started,
                            bytes,
                            contentType: res.headers.get('content-type') || ''
                        });
                        return res;
                    } catch (err) {
                        window.__pcFetchLog.push({
                            url,
                            method,
                            status: 0,
                            duration: performance.now() - started,
                            bytes: 0,
                            contentType: '',
                            error: String(err)
                        });
                        throw err;
                    }
                };

                if ('PerformanceObserver' in window) {
                    try {
                        const obs = new PerformanceObserver((list) => {
                            for (const e of list.getEntries()) {
                                window.__pcLongTasks.push({
                                    start: e.startTime,
                                    duration: e.duration,
                                    name: e.name
                                });
                            }
                        });
                        obs.observe({ type: 'longtask', buffered: true });
                    } catch (_) {}
                }
            })();
        """

        for route in routes:
            context = await browser.new_context()
            page = await context.new_page()
            await page.add_init_script(init_script)
            try:
                await page.goto(BASE_URL + "/", timeout=20000)
                await page.evaluate(
                    """(payload) => {
                        localStorage.setItem('pc_token', payload.token);
                        localStorage.setItem('pc_user', JSON.stringify(payload.user));
                    }""",
                    {"token": token, "user": user_obj},
                )
                await page.evaluate(
                    """
                    () => {
                        window.__pcFetchLog = [];
                        window.__pcLongTasks = [];
                        window.__pcRouteStart = performance.now();
                    }
                    """
                )

                await page.goto(BASE_URL + f"/#{route}", timeout=20000)
                await page.wait_for_function(
                    """
                    (route) => {
                        return window.location.hash === '#' + route;
                    }
                    """,
                    arg=route,
                    timeout=15000,
                )

                stable_loops = 0
                prev_count = -1
                for _ in range(30):
                    await page.wait_for_timeout(250)
                    count = await page.evaluate("window.__pcFetchLog.length")
                    if count == prev_count:
                        stable_loops += 1
                    else:
                        stable_loops = 0
                    prev_count = count
                    if stable_loops >= 4:
                        break

                data = await page.evaluate(
                    """
                    () => ({
                        fetches: window.__pcFetchLog,
                        longTasks: window.__pcLongTasks,
                        routeMs: performance.now() - (window.__pcRouteStart || 0),
                        domNodes: document.querySelectorAll('*').length
                    })
                    """
                )

                fetches = [f for f in data["fetches"] if "/api/" in (f.get("url") or "")]
                by_key = {}
                for f in fetches:
                    url = f.get("url", "")
                    key = f"{f.get('method', 'GET')} {url}"
                    by_key[key] = by_key.get(key, 0) + 1

                duplicates = {k: v for k, v in by_key.items() if v > 1}
                json_bytes = sum(f.get("bytes", 0) for f in fetches if "application/json" in (f.get("contentType") or ""))
                slowest = sorted(fetches, key=lambda x: x.get("duration", 0), reverse=True)[:3]

                route_stats.append(
                    {
                        "route": route,
                        "fetch_count": len(fetches),
                        "json_bytes": json_bytes,
                        "duplicates": duplicates,
                        "route_open_ms": round(data.get("routeMs", 0), 2),
                        "dom_nodes": data.get("domNodes", 0),
                        "long_task_count": len(data.get("longTasks", [])),
                        "long_task_total_ms": round(sum(t.get("duration", 0) for t in data.get("longTasks", [])), 2),
                        "long_task_max_ms": round(max([t.get("duration", 0) for t in data.get("longTasks", [])] + [0]), 2),
                        "slowest_fetches": [
                            {
                                "url": s.get("url"),
                                "duration_ms": round(s.get("duration", 0), 2),
                                "bytes": s.get("bytes", 0),
                                "status": s.get("status", 0),
                            }
                            for s in slowest
                        ],
                    }
                )
            except Exception as err:
                route_stats.append({"route": route, "error": str(err)})
            finally:
                await context.close()

        await browser.close()
        return route_stats


def run_sql_count_scan(username, password):
    import backend.routers.announcements as r_ann
    import backend.routers.hr as r_hr
    import backend.routers.inventory as r_inv
    import backend.routers.orders as r_orders
    import backend.routers.payroll as r_payroll
    import backend.routers.pricelist as r_price
    import backend.routers.reports as r_reports
    import backend.routers.tasks as r_tasks
    import backend.routers.training as r_training
    import backend.routers.users as r_users
    from backend.main import app

    modules = [r_ann, r_hr, r_inv, r_orders, r_payroll, r_price, r_reports, r_tasks, r_training, r_users]
    state = {"count": 0}
    original_getters = {}

    def wrap_get_db(orig):
        def wrapped():
            inner = orig()

            class CountingDB:
                def execute(self, query, params=()):
                    state["count"] += 1
                    return inner.execute(query, params)

                def __getattr__(self, name):
                    return getattr(inner, name)

            return CountingDB()

        return wrapped

    for mod in modules:
        original_getters[mod] = mod.get_db
        mod.get_db = wrap_get_db(mod.get_db)

    def call(client, method, path, token=None, payload=None):
        state["count"] = 0
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        t0 = time.perf_counter()
        resp = client.request(method, path, headers=headers, json=payload)
        elapsed = (time.perf_counter() - t0) * 1000
        return {
            "endpoint": f"{method} {path}",
            "status": resp.status_code,
            "elapsed_ms": round(elapsed, 2),
            "bytes": len(resp.content),
            "sql_queries": state["count"],
        }

    results = []
    today = date.today()
    month_ago = today - timedelta(days=30)

    with TestClient(app) as client:
        login_resp = client.post("/api/auth/login", json={"username": username, "password": password})
        login_resp.raise_for_status()
        token = login_resp.json()["token"]

        existing = client.get("/api/orders?limit=1", headers={"Authorization": f"Bearer {token}"}).json()
        if existing.get("orders"):
            order_id = existing["orders"][0]["id"]
        else:
            services = client.get("/api/pricelist", headers={"Authorization": f"Bearer {token}"}).json()
            service = next((s for s in services if s.get("code") == "table"), services[0])
            created = client.post(
                "/api/orders",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "client_name": "Perf SQL",
                    "client_phone": "+1000000000",
                    "client_type": "retail",
                    "items": [{"service_id": service["id"], "quantity": 1, "options": {}}],
                    "notes": "sql",
                },
            ).json()
            order_id = created["id"]

        endpoints = [
            ("GET", "/api/orders?limit=100&offset=0", None),
            ("GET", f"/api/orders/{order_id}", None),
            ("GET", "/api/inventory", None),
            ("GET", "/api/pricelist", None),
            ("GET", "/api/hr/my-attendance", None),
            ("GET", "/api/hr/shift-tasks", None),
            ("GET", "/api/hr/attendance/today", None),
            ("GET", "/api/hr/incidents?status=pending", None),
            ("GET", "/api/users", None),
            ("GET", "/api/tasks?type=daily", None),
            ("GET", f"/api/reports/orders-summary?date_from={month_ago}&date_to={today}", None),
            ("GET", f"/api/reports/employee-stats?date_from={month_ago}&date_to={today}", None),
            ("GET", f"/api/reports/finance?date_from={month_ago}&date_to={today}", None),
            ("GET", f"/api/payroll/month-report?month_start={today.replace(day=1)}&month_end={today}", None),
            ("GET", "/api/training", None),
            ("GET", "/api/announcements", None),
        ]

        for method, path, payload in endpoints:
            results.append(call(client, method, path, token=token, payload=payload))

    for mod, orig in original_getters.items():
        mod.get_db = orig

    return results


async def main():
    prepare_perf_db()
    username, password = ensure_diag_user()
    sql_scan = run_sql_count_scan(username, password)

    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8010"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        if not wait_server(timeout=40):
            raise RuntimeError("Server did not start")

        login = http_json("/api/auth/login", method="POST", payload={"username": username, "password": password})
        token = login["json"]["token"]
        order_id = ensure_order_http(token)

        frontend_scan = await run_frontend_scan(order_id, username, password)
        http_scan = run_http_api_scan(token, order_id)

        result = {
            "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "sql_scan": sql_scan,
            "http_scan": http_scan,
            "frontend_scan": frontend_scan,
        }

        out_path = os.path.join(ROOT, "perf-diagnostics.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        print(out_path)
    finally:
        server.terminate()
        try:
            server.wait(timeout=8)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    asyncio.run(main())
