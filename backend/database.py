import sqlite3
from typing import Any, Iterable
import os
import mimetypes

from backend.config import DB_ENGINE, DB_PATH, DATABASE_URL, UPLOAD_DIR

try:
    import psycopg2
except Exception:  # pragma: no cover
    psycopg2 = None


class RowCompat(dict):
    """Dict-like row with both key and numeric index access."""

    def __init__(self, keys: list[str], values: list[Any]):
        super().__init__(zip(keys, values))
        self._values = values

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)


class CursorCompat:
    def __init__(self, cursor, engine: str, lastrowid: int | None = None):
        self._cursor = cursor
        self._engine = engine
        self.lastrowid = lastrowid

    def _wrap_row(self, row):
        if row is None:
            return None
        if isinstance(row, RowCompat):
            return row
        if isinstance(row, sqlite3.Row):
            keys = list(row.keys())
            vals = [row[k] for k in keys]
            return RowCompat(keys, vals)
        if isinstance(row, dict):
            keys = list(row.keys())
            vals = [row[k] for k in keys]
            return RowCompat(keys, vals)

        desc = self._cursor.description or []
        keys = [d[0] for d in desc]
        vals = list(row) if isinstance(row, (tuple, list)) else [row]
        return RowCompat(keys, vals)

    def fetchone(self):
        return self._wrap_row(self._cursor.fetchone())

    def fetchall(self):
        rows = self._cursor.fetchall()
        return [self._wrap_row(r) for r in rows]


class DBCompat:
    def __init__(self, conn, engine: str):
        self._conn = conn
        self._engine = engine

    def execute(self, query: str, params: Iterable[Any] | Any = ()):  # noqa: ANN401
        sql = _normalize_sql(query, self._engine)

        if params is None:
            args = ()
        elif isinstance(params, (tuple, list)):
            args = tuple(params)
        else:
            args = (params,)

        cur = self._conn.cursor()
        cur.execute(sql, args)

        lastrowid = getattr(cur, "lastrowid", None)
        if self._engine == "postgres" and sql.lstrip().upper().startswith("INSERT"):
            try:
                c2 = self._conn.cursor()
                c2.execute("SELECT LASTVAL()")
                lastrowid = c2.fetchone()[0]
                c2.close()
            except Exception:
                pass

        return CursorCompat(cur, self._engine, lastrowid=lastrowid)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


def _qmark_to_pyformat(sql: str) -> str:
    out = []
    in_single = False
    i = 0
    while i < len(sql):
        ch = sql[i]
        if ch == "'":
            if in_single and i + 1 < len(sql) and sql[i + 1] == "'":
                out.append("''")
                i += 2
                continue
            in_single = not in_single
            out.append(ch)
        elif ch == "?" and not in_single:
            out.append("%s")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


def _normalize_sql(sql: str, engine: str) -> str:
    normalized = (
        sql.replace("datetime('now')", "CURRENT_TIMESTAMP")
        .replace('datetime("now")', "CURRENT_TIMESTAMP")
        .replace("date('now')", "CURRENT_DATE")
        .replace('date("now")', "CURRENT_DATE")
    )

    if engine == "postgres":
        normalized = _qmark_to_pyformat(normalized)
    return normalized


_pg_pool = None


def _get_pg_pool():
    global _pg_pool
    if _pg_pool is None:
        from psycopg2.pool import SimpleConnectionPool
        _pg_pool = SimpleConnectionPool(2, 10, DATABASE_URL)
    return _pg_pool


class PooledDBCompat(DBCompat):
    """DBCompat that returns connection to pool on close()."""

    def __init__(self, conn, engine, pool):
        super().__init__(conn, engine)
        self._pool = pool

    def close(self):
        self._pool.putconn(self._conn)


def get_db():
    if DB_ENGINE == "postgres":
        if not DATABASE_URL:
            raise RuntimeError("POLYCONTROL_DATABASE_URL is not configured")
        if psycopg2 is None:
            raise RuntimeError("psycopg2 is not installed. Add psycopg2-binary to requirements")

        pool = _get_pg_pool()
        conn = pool.getconn()
        conn.autocommit = False
        return PooledDBCompat(conn, "postgres", pool)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return DBCompat(conn, "sqlite")


SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    full_name     TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK(role IN ('director','manager','designer','master','assistant')),
    phone         TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    lang          TEXT    NOT NULL DEFAULT 'ru' CHECK(lang IN ('ru','ky')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT    NOT NULL UNIQUE,
    name_ru       TEXT    NOT NULL,
    name_ky       TEXT    NOT NULL,
    category      TEXT    NOT NULL,
    unit          TEXT    NOT NULL,
    price_retail  REAL    NOT NULL DEFAULT 0,
    price_dealer  REAL    NOT NULL DEFAULT 0,
    cost_price    REAL    NOT NULL DEFAULT 0,
    min_order     INTEGER NOT NULL DEFAULT 1,
    options       TEXT    NOT NULL DEFAULT '{}',
    is_active     INTEGER NOT NULL DEFAULT 1,
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS price_history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id    INTEGER NOT NULL REFERENCES services(id),
    price_retail  REAL    NOT NULL,
    price_dealer  REAL    NOT NULL,
    changed_by    INTEGER NOT NULL REFERENCES users(id),
    changed_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS materials (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    NOT NULL UNIQUE,
    name_ru         TEXT    NOT NULL,
    name_ky         TEXT    NOT NULL,
    unit            TEXT    NOT NULL,
    quantity        REAL    NOT NULL DEFAULT 0,
    reserved        REAL    NOT NULL DEFAULT 0,
    low_threshold   REAL    NOT NULL DEFAULT 10,
    roll_size       REAL    NOT NULL DEFAULT 50,
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS service_material_map (
    service_id   INTEGER NOT NULL REFERENCES services(id),
    material_id  INTEGER NOT NULL REFERENCES materials(id),
    ratio        REAL    NOT NULL DEFAULT 1.0,
    PRIMARY KEY (service_id, material_id)
);

CREATE TABLE IF NOT EXISTS orders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number        TEXT    NOT NULL UNIQUE,
    client_name         TEXT    NOT NULL,
    client_phone        TEXT,
    client_type         TEXT    NOT NULL CHECK(client_type IN ('retail','dealer')),
    status              TEXT    NOT NULL DEFAULT 'created'
                        CHECK(status IN ('created','design','design_done','production','printed','postprocess','ready','closed','cancelled','defect')),
    total_price         REAL    NOT NULL DEFAULT 0,
    material_cost       REAL    NOT NULL DEFAULT 0,
    notes               TEXT,
    design_file         TEXT,
    photo_file          TEXT,
    photo_mime          TEXT,
    photo_blob          BLOB,
    assigned_designer   INTEGER REFERENCES users(id),
    assigned_master     INTEGER REFERENCES users(id),
    assigned_assistant  INTEGER REFERENCES users(id),
    deadline            TEXT,
    created_by          INTEGER NOT NULL REFERENCES users(id),
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id        INTEGER NOT NULL REFERENCES orders(id),
    service_id      INTEGER NOT NULL REFERENCES services(id),
    material_id     INTEGER REFERENCES materials(id),
    quantity        REAL    NOT NULL,
    width           REAL,
    height          REAL,
    unit_price      REAL    NOT NULL,
    total           REAL    NOT NULL,
    material_qty    REAL    NOT NULL DEFAULT 0,
    options         TEXT    NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS order_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL REFERENCES orders(id),
    old_status  TEXT,
    new_status  TEXT    NOT NULL,
    changed_by  INTEGER NOT NULL REFERENCES users(id),
    note        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS material_ledger (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id   INTEGER NOT NULL REFERENCES materials(id),
    order_id      INTEGER REFERENCES orders(id),
    action        TEXT    NOT NULL CHECK(action IN ('receive','reserve','unreserve','consume','correction','defect')),
    quantity      REAL    NOT NULL,
    note          TEXT,
    performed_by  INTEGER NOT NULL REFERENCES users(id),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    date        TEXT    NOT NULL DEFAULT (date('now')),
    check_in    TEXT    NOT NULL DEFAULT (datetime('now')),
    check_out   TEXT,
    UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS incidents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    type          TEXT    NOT NULL CHECK(type IN ('defect','late','complaint','other')),
    description   TEXT    NOT NULL,
    photo         TEXT,
    order_id      INTEGER REFERENCES orders(id),
    material_waste REAL,
    deduction_amount REAL,
    status        TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed')),
    created_by    INTEGER NOT NULL REFERENCES users(id),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payroll (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    week_start  TEXT    NOT NULL,
    week_end    TEXT    NOT NULL,
    base_salary REAL    NOT NULL DEFAULT 0,
    bonus       REAL    NOT NULL DEFAULT 0,
    deductions  REAL    NOT NULL DEFAULT 0,
    total       REAL    NOT NULL DEFAULT 0,
    is_paid     INTEGER NOT NULL DEFAULT 0,
    paid_at     TEXT,
    note        TEXT,
    created_by  INTEGER NOT NULL REFERENCES users(id),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, week_start)
);

CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    description   TEXT,
    type          TEXT    NOT NULL DEFAULT 'daily' CHECK(type IN ('daily','weekly')),
    assigned_to   INTEGER NOT NULL REFERENCES users(id),
    assigned_by   INTEGER NOT NULL REFERENCES users(id),
    due_date      TEXT,
    is_done       INTEGER NOT NULL DEFAULT 0,
    done_at       TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    type          TEXT    NOT NULL CHECK(type IN ('sick','rest')),
    reason        TEXT    NOT NULL,
    date_start    TEXT    NOT NULL,
    date_end      TEXT    NOT NULL,
    days_count    INTEGER NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    created_by    INTEGER NOT NULL REFERENCES users(id),
    reviewed_by   INTEGER REFERENCES users(id),
    reviewed_at   TEXT,
    review_note   TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS training (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    description   TEXT,
    youtube_url   TEXT    NOT NULL,
    role_target   TEXT,
    assigned_to   INTEGER REFERENCES users(id),
    created_by    INTEGER NOT NULL REFERENCES users(id),
    is_required   INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS training_progress (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    training_id   INTEGER NOT NULL REFERENCES training(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    watched       INTEGER NOT NULL DEFAULT 0,
    watched_at    TEXT,
    UNIQUE(training_id, user_id)
);

CREATE TABLE IF NOT EXISTS shift_tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    role          TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    is_required   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS shift_task_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    task_id       INTEGER NOT NULL REFERENCES shift_tasks(id),
    date          TEXT    NOT NULL DEFAULT (date('now')),
    completed     INTEGER NOT NULL DEFAULT 1,
    UNIQUE(user_id, task_id, date)
);

CREATE TABLE IF NOT EXISTS announcements (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    message       TEXT    NOT NULL,
    target_user_id INTEGER REFERENCES users(id),
    created_by    INTEGER NOT NULL REFERENCES users(id),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcement_reads (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    announcement_id INTEGER NOT NULL REFERENCES announcements(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    read_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS client_notifications (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id      INTEGER NOT NULL REFERENCES orders(id),
    channel       TEXT    NOT NULL,
    message       TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'queued',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    sent_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_designer ON orders(assigned_designer);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_master ON orders(assigned_master);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON order_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_changed_by ON order_history(changed_by, created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date_user ON attendance(date, user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_user_created ON incidents(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_material_ledger_material ON material_ledger(material_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shift_task_logs_user_date ON shift_task_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_dates ON leave_requests(user_id, date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status_dates ON leave_requests(status, date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_leave_requests_created_at ON leave_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_done_at_assigned ON tasks(done_at, assigned_to);
"""

SHIFT_TASK_SEED = [
    ("master", "Выключил оборудование", 1),
    ("master", "Убрал рабочее место", 1),
    ("master", "Сложил материалы", 1),
    ("master", "Проверил печать", 1),
    ("designer", "Сохранил файлы", 1),
    ("designer", "Передал макеты", 1),
    ("designer", "Закрыл задачи", 1),
    ("manager", "Проверил заказы", 1),
    ("manager", "Уведомил клиентов", 1),
    ("manager", "Закрыл смену", 1),
]


def _image_mime_or_default(photo_file: str, existing_mime: str | None) -> str:
    mime = (existing_mime or "").strip().lower()
    if mime.startswith("image/"):
        return mime
    guessed, _ = mimetypes.guess_type(photo_file or "")
    if guessed and guessed.startswith("image/"):
        return guessed
    return "application/octet-stream"


def _backfill_photo_blobs_sqlite(cur) -> None:
    rows = cur.execute(
        """
        SELECT id, photo_file, photo_mime
        FROM orders
        WHERE photo_blob IS NULL
          AND photo_file IS NOT NULL
          AND TRIM(photo_file) <> ''
        """
    ).fetchall()
    for order_id, photo_file, photo_mime in rows:
        path = os.path.join(UPLOAD_DIR, photo_file)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "rb") as f:
                content = f.read()
        except OSError:
            continue
        cur.execute(
            "UPDATE orders SET photo_blob = ?, photo_mime = ? WHERE id = ?",
            (content, _image_mime_or_default(photo_file, photo_mime), order_id),
        )


def _backfill_photo_blobs_postgres(cur) -> None:
    cur.execute(
        """
        SELECT id, photo_file, photo_mime
        FROM orders
        WHERE photo_blob IS NULL
          AND photo_file IS NOT NULL
          AND btrim(photo_file) <> ''
        """
    )
    rows = cur.fetchall()
    for order_id, photo_file, photo_mime in rows:
        path = os.path.join(UPLOAD_DIR, photo_file)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "rb") as f:
                content = f.read()
        except OSError:
            continue
        cur.execute(
            "UPDATE orders SET photo_blob = %s, photo_mime = %s WHERE id = %s",
            (content, _image_mime_or_default(photo_file, photo_mime), order_id),
        )


def _sqlite_to_postgres_schema(sql: str) -> str:
    out = sql
    out = out.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
    out = out.replace("(datetime('now'))", "CURRENT_TIMESTAMP")
    out = out.replace("(date('now'))", "CURRENT_DATE")
    out = out.replace(" BLOB", " BYTEA")
    return out


def _run_script(cur, script: str):
    statements = [s.strip() for s in script.split(";") if s.strip()]
    for stmt in statements:
        cur.execute(stmt)


def _init_sqlite(conn):
    cur = conn.cursor()
    cur.executescript(SQLITE_SCHEMA)

    training_cols = {r[1] for r in cur.execute("PRAGMA table_info(training)").fetchall()}
    if "photo_url" not in training_cols:
        cur.execute("ALTER TABLE training ADD COLUMN photo_url TEXT")
    if "photo_file" not in training_cols:
        cur.execute("ALTER TABLE training ADD COLUMN photo_file TEXT")

    order_cols = {r[1] for r in cur.execute("PRAGMA table_info(orders)").fetchall()}
    if "photo_file" not in order_cols:
        cur.execute("ALTER TABLE orders ADD COLUMN photo_file TEXT")
    if "photo_mime" not in order_cols:
        cur.execute("ALTER TABLE orders ADD COLUMN photo_mime TEXT")
    if "photo_blob" not in order_cols:
        cur.execute("ALTER TABLE orders ADD COLUMN photo_blob BLOB")

    order_item_cols = {r[1] for r in cur.execute("PRAGMA table_info(order_items)").fetchall()}
    if "width" not in order_item_cols:
        cur.execute("ALTER TABLE order_items ADD COLUMN width REAL")
    if "height" not in order_item_cols:
        cur.execute("ALTER TABLE order_items ADD COLUMN height REAL")

    # Migrate orders table to support 'defect' status if needed
    order_schema_row = cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").fetchone()
    if order_schema_row and "'defect'" not in order_schema_row[0]:
        conn.executescript("""
            PRAGMA foreign_keys=OFF;
            ALTER TABLE orders RENAME TO orders_backup;
            CREATE TABLE orders (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                order_number        TEXT    NOT NULL UNIQUE,
                client_name         TEXT    NOT NULL,
                client_phone        TEXT,
                client_type         TEXT    NOT NULL CHECK(client_type IN ('retail','dealer')),
                status              TEXT    NOT NULL DEFAULT 'created'
                                    CHECK(status IN ('created','design','design_done','production','printed','postprocess','ready','closed','cancelled','defect')),
                total_price         REAL    NOT NULL DEFAULT 0,
                material_cost       REAL    NOT NULL DEFAULT 0,
                notes               TEXT,
                design_file         TEXT,
                photo_file          TEXT,
                photo_mime          TEXT,
                photo_blob          BLOB,
                assigned_designer   INTEGER REFERENCES users(id),
                assigned_master     INTEGER REFERENCES users(id),
                assigned_assistant  INTEGER REFERENCES users(id),
                deadline            TEXT,
                created_by          INTEGER NOT NULL REFERENCES users(id),
                created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
                updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO orders SELECT * FROM orders_backup;
            DROP TABLE orders_backup;
            PRAGMA foreign_keys=ON;
        """)
        cur = conn.cursor()

    shift_count = cur.execute("SELECT COUNT(*) FROM shift_tasks").fetchone()[0]
    if shift_count == 0:
        for role, title, required in SHIFT_TASK_SEED:
            cur.execute(
                "INSERT INTO shift_tasks (role, title, is_required) VALUES (?, ?, ?)",
                (role, title, required),
            )

    _backfill_photo_blobs_sqlite(cur)

    conn.commit()


def _init_postgres(conn):
    cur = conn.cursor()
    pg_schema = _sqlite_to_postgres_schema(SQLITE_SCHEMA)
    pg_schema = _qmark_to_pyformat(pg_schema)
    _run_script(cur, pg_schema)

    cur.execute(
        """SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'training'"""
    )
    training_cols = {r[0] for r in cur.fetchall()}
    if "photo_url" not in training_cols:
        cur.execute("ALTER TABLE training ADD COLUMN photo_url TEXT")
    if "photo_file" not in training_cols:
        cur.execute("ALTER TABLE training ADD COLUMN photo_file TEXT")

    cur.execute(
        """SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'orders'"""
    )
    order_cols = {r[0] for r in cur.fetchall()}
    if "photo_file" not in order_cols:
        cur.execute("ALTER TABLE orders ADD COLUMN photo_file TEXT")
    if "photo_mime" not in order_cols:
        cur.execute("ALTER TABLE orders ADD COLUMN photo_mime TEXT")
    if "photo_blob" not in order_cols:
        cur.execute("ALTER TABLE orders ADD COLUMN photo_blob BYTEA")

    cur.execute(
        """SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'order_items'"""
    )
    order_item_cols = {r[0] for r in cur.fetchall()}
    if "width" not in order_item_cols:
        cur.execute("ALTER TABLE order_items ADD COLUMN width REAL")
    if "height" not in order_item_cols:
        cur.execute("ALTER TABLE order_items ADD COLUMN height REAL")

    # Migrate orders status constraint to support 'defect'
    cur.execute("""
        SELECT conname FROM pg_constraint pc
        JOIN pg_class t ON t.oid = pc.conrelid
        WHERE t.relname = 'orders' AND pc.contype = 'c'
        AND pg_get_constraintdef(pc.oid) LIKE '%status%'
        AND pg_get_constraintdef(pc.oid) NOT LIKE '%defect%'
    """)
    old_constraint = cur.fetchone()
    if old_constraint:
        cur.execute(f"ALTER TABLE orders DROP CONSTRAINT {old_constraint[0]}")
        cur.execute("""
            ALTER TABLE orders ADD CONSTRAINT orders_status_check
            CHECK(status IN ('created','design','design_done','production','printed','postprocess','ready','closed','cancelled','defect'))
        """)

    cur.execute("SELECT COUNT(*) FROM shift_tasks")
    shift_count = cur.fetchone()[0]
    if shift_count == 0:
        for role, title, required in SHIFT_TASK_SEED:
            cur.execute(
                "INSERT INTO shift_tasks (role, title, is_required) VALUES (%s, %s, %s)",
                (role, title, required),
            )

    _backfill_photo_blobs_postgres(cur)

    conn.commit()


def init_db():
    if DB_ENGINE == "postgres":
        if not DATABASE_URL:
            raise RuntimeError("POLYCONTROL_DATABASE_URL is not configured")
        if psycopg2 is None:
            raise RuntimeError("psycopg2 is not installed. Add psycopg2-binary to requirements")
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False
        try:
            _init_postgres(conn)
        finally:
            conn.close()
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        _init_sqlite(conn)
    finally:
        conn.close()
