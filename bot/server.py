"""
Keto Balance — FastAPI сервер для статики Mini App и API вебхуков.
"""
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import uvicorn

from bot.database import mark_order_paid
from bot.config import PRODUCTS

app = FastAPI(title="Keto Balance API & Mini App Server")

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = BASE_DIR / "dist"

class WebhookPayload(BaseModel):
    order_id: str
    status: str
    secret: str = ""

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "Keto Balance", "version": "0.1.0"}

@app.get("/api/products")
def get_products():
    return PRODUCTS

@app.post("/api/payments/webhook")
def payment_webhook(payload: WebhookPayload):
    if payload.status.lower() in ("paid", "succeeded", "success"):
        order = mark_order_paid(payload.order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        return {"status": "success", "order": order}
    return {"status": "ignored"}

# Раздача собранного Mini App (dist/)
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = DIST_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(DIST_DIR / "index.html")

def main():
    print(f"[INFO] Запуск веб-сервера Keto Balance на http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    main()
