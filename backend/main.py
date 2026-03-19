import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.database import init_db
from backend.seed import seed_db
from backend.config import UPLOAD_DIR
from backend.routers import auth_router, orders, pricelist, inventory, hr, payroll, users, reports, tasks, training, announcements, work_journal, realtime
import os


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_db()
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    yield


app = FastAPI(title="Тамга Сервис", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_request_time(request: Request, call_next):
    if not request.url.path.startswith("/api/"):
        return await call_next(request)
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    if duration > 0.5:
        print(f"SLOW {request.method} {request.url.path} {duration:.3f}s")
    response.headers["X-Response-Time"] = f"{duration:.3f}"
    return response


# API routers
app.include_router(auth_router.router)
app.include_router(orders.router)
app.include_router(pricelist.router)
app.include_router(inventory.router)
app.include_router(hr.router)
app.include_router(payroll.router)
app.include_router(users.router)
app.include_router(reports.router)
app.include_router(tasks.router)
app.include_router(training.router)
app.include_router(announcements.router)
app.include_router(work_journal.router)
app.include_router(realtime.router)

# Serve uploaded files
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Serve frontend: prefer React build when present, otherwise fall back to legacy frontend.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEGACY_FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
REACT_FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend-react", "dist")


def get_active_frontend_dir() -> str:
    react_index = os.path.join(REACT_FRONTEND_DIR, "index.html")
    return REACT_FRONTEND_DIR if os.path.isfile(react_index) else LEGACY_FRONTEND_DIR


@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(get_active_frontend_dir(), "index.html"))


@app.get("/{path:path}")
async def serve_spa(path: str):
    normalized_path = path.replace("/", os.sep)
    frontend_dir = get_active_frontend_dir()

    # Serve actual files from the active frontend first.
    file_path = os.path.join(frontend_dir, normalized_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)

    # While React migration is in progress, reuse legacy assets if they are not in the React build yet.
    legacy_file_path = os.path.join(LEGACY_FRONTEND_DIR, normalized_path)
    if frontend_dir != LEGACY_FRONTEND_DIR and os.path.isfile(legacy_file_path):
        return FileResponse(legacy_file_path)

    # SPA fallback: return index.html for all other routes.
    return FileResponse(os.path.join(frontend_dir, "index.html"))
