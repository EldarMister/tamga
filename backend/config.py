import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_env_file(path: str) -> None:
    if not os.path.isfile(path):
        return

    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_env_file(os.path.join(BASE_DIR, ".env"))

SECRET_KEY = os.getenv("POLYCONTROL_SECRET", "polycontrol-dev-secret-change-in-production")
DB_PATH = os.getenv("POLYCONTROL_DB_PATH", os.path.join(BASE_DIR, "polycontrol.db"))
DATABASE_URL = os.getenv("POLYCONTROL_DATABASE_URL", "").strip() or os.getenv("DATABASE_URL", "").strip()
DB_ENGINE = "postgres" if DATABASE_URL.startswith(("postgres://", "postgresql://")) else "sqlite"
JWT_EXPIRY_HOURS = 72
UPLOAD_DIR = os.getenv("POLYCONTROL_UPLOAD_DIR", os.path.join(BASE_DIR, "uploads"))
ALLOWED_ROLES = ("director", "manager", "designer", "master", "assistant")
