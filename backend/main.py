import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from backend.config import UPLOAD_DIR
from backend.database import init_db
from backend.routers import (
    announcements,
    auth_router,
    hr,
    inventory,
    orders,
    payroll,
    pricelist,
    realtime,
    reports,
    tasks,
    training,
    users,
    work_journal,
)
from backend.seed import seed_db


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

os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REACT_FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend-react", "dist")


def get_react_index_path() -> str:
    return os.path.join(REACT_FRONTEND_DIR, "index.html")


def react_build_exists() -> bool:
    return os.path.isfile(get_react_index_path())


def missing_frontend_response() -> HTMLResponse:
    return HTMLResponse(
        """
        <html>
            <head><title>React build not found</title></head>
            <body style="font-family: sans-serif; padding: 32px;">
                <h1>React build not found</h1>
                <p>Run <code>cd frontend-react && npm install && npm run build</code> before starting the backend.</p>
            </body>
        </html>
        """,
        status_code=503,
    )


@app.get("/")
async def serve_index():
    if not react_build_exists():
        return missing_frontend_response()
    return FileResponse(get_react_index_path())


@app.get("/{path:path}")
async def serve_spa(path: str):
    if not react_build_exists():
        return missing_frontend_response()

    normalized_path = path.replace("/", os.sep)
    file_path = os.path.join(REACT_FRONTEND_DIR, normalized_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)

    return FileResponse(get_react_index_path())
