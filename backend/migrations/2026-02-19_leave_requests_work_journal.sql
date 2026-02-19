-- Migration: leave requests + work journal indexes
-- Note: SQLite syntax below. For PostgreSQL replace AUTOINCREMENT with SERIAL.

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

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_dates ON leave_requests(user_id, date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status_dates ON leave_requests(status, date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_leave_requests_created_at ON leave_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_date_user ON attendance(date, user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_done_at_assigned ON tasks(done_at, assigned_to);
