"""
Кето Баланс — FastAPI сервер для статики Mini App и API вебхуков.
"""
import os
import urllib.parse
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
import uvicorn

from bot.config import PRODUCTS

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DIST_DIR = Path(os.getenv("KETO_DIST_DIR", str(BASE_DIR / "dist"))).resolve()

def resolve_safe_path(dist_dir: Path, requested_path: str) -> Path:
    """Безопасное разрешение пути файла внутри dist_dir с защитой от traversal."""
    decoded = urllib.parse.unquote(requested_path)
    if ".." in decoded or "\\" in decoded or "\0" in decoded:
        raise HTTPException(status_code=403, detail="Access denied")

    rel_path = decoded.strip("/")
    try:
        resolved = (dist_dir / rel_path).resolve()
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid path")

    try:
        if not resolved.is_relative_to(dist_dir):
            raise HTTPException(status_code=403, detail="Access denied")
    except (ValueError, AttributeError):
        raise HTTPException(status_code=403, detail="Access denied")

    return resolved

def create_app(dist_dir: Path | str | None = None) -> FastAPI:
    app = FastAPI(title="Кето Баланс API & Mini App Server")
    resolved_dist = Path(dist_dir).resolve() if dist_dir is not None else DEFAULT_DIST_DIR

    @app.get("/api/health")
    def health_check():
        return {"status": "ok", "app": "Кето Баланс", "version": "0.1.0"}

    @app.get("/api/products")
    def get_products():
        return PRODUCTS

    @app.post("/api/payments/webhook")
    def payment_webhook():
        raise HTTPException(status_code=503, detail="Payments are disabled in P0")

    @app.api_route("/api", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
    @app.api_route("/api/{api_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
    def unknown_api(api_path: str = ""):
        path_str = f"/api/{api_path}".rstrip("/") if api_path else "/api"
        raise HTTPException(status_code=404, detail=f"Unknown API endpoint: {path_str}")

    @app.get("/{full_path:path}")
    async def serve_spa_or_asset(full_path: str):
        rel_path = urllib.parse.unquote(full_path).strip("/")
        if rel_path == "api" or rel_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")

        resolved = resolve_safe_path(resolved_dist, full_path)

        if resolved.is_file():
            return FileResponse(resolved)

        target_name = Path(rel_path).name
        if rel_path == "assets" or rel_path.startswith("assets/") or Path(rel_path).suffix or (target_name and target_name.startswith(".")):
            raise HTTPException(status_code=404, detail="Asset not found")

        safe_index = resolve_safe_path(resolved_dist, "index.html")
        if resolved_dist.is_dir() and safe_index.is_file():
            return FileResponse(safe_index)

        raise HTTPException(status_code=503, detail="Build missing: dist directory or index.html not found")

    return app

app = create_app()

def main():
    print("[INFO] Запуск веб-сервера Кето Баланс на http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)

if __name__ == "__main__":
    main()
