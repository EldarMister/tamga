from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.database import init_db
from backend.seed import seed_db
from backend.config import UPLOAD_DIR
from backend.routers import auth_router, orders, pricelist, inventory, hr, payroll, users, reports, tasks, training, announcements
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

# Serve uploaded files
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Serve frontend — mount at root so paths like /css/app.css work
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")


@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.get("/{path:path}")
async def serve_spa(path: str):
    # Serve actual files (CSS, JS, images, etc.)
    file_path = os.path.join(FRONTEND_DIR, path.replace("/", os.sep))
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    # SPA fallback: return index.html for all other routes
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
