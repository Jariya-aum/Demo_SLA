"""SLA Dashboard API — โครงเปล่าสำหรับต่อยอด

เสิร์ฟทั้ง API และหน้าเว็บที่ build จาก frontend/ (โฟลเดอร์ backend/static)

รันแบบ dev:
    uvicorn app.main:app --reload --port 8000

เอกสาร API อัตโนมัติ:
    http://localhost:8000/docs
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# web root — คัดลอกมาจาก frontend/dist โดย `npm run build` (postbuild)
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

# origin ของ Vite dev server — ตอน deploy จริงตั้งผ่าน env
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
).split(",")

app = FastAPI(
    title="SLA Dashboard API",
    description="API พยากรณ์ค่าความผิดปกติของระดับน้ำทะเล (SLA) อ่าวไทยตอนบน",
    version="0.1.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    """ใช้เป็น health check ของ Cloud Run — ต้องไม่แตะ dependency ภายนอก"""
    return {"status": "ok"}


@app.get("/api")
def api_root() -> dict[str, str | bool]:
    return {
        "service": app.title,
        "version": app.version,
        "docs": "/docs",
        "web_root": STATIC_DIR.is_dir(),
    }


# ต้อง mount ท้ายสุด เพราะ path "/" จะรับทุก path ที่ไม่ตรง route ด้านบน
# html=True ทำให้ "/" เสิร์ฟ index.html และ /leaflet.html ฯลฯ เสิร์ฟไฟล์ตรง ๆ
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="web")
else:  # ยังไม่เคย build frontend — ให้ API ยังรันได้ตามปกติ
    @app.get("/")
    def missing_web_root() -> dict[str, str]:
        return {
            "detail": "ยังไม่มี web root — รัน `npm run build` ใน frontend/ ก่อน",
            "expected": str(STATIC_DIR),
        }
