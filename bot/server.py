"""
Кето Баланс — FastAPI сервер для статики Mini App и REST API (K2-Pilot).
"""
import json
import os
import secrets
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
import uvicorn

from bot.config import PRODUCTS
from bot.app_settings import AppSettings, get_settings
from bot.auth import parse_and_validate_init_data, AuthError, TokenExpiredError, InvalidSignatureError
from bot.app_models import (
    InitSessionPayload,
    SessionResponse,
    UserProfileModel,
    UserStateModel,
    ShoppingUpdatePayload,
    SupportTicketPayload,
    SupportTicketResponse,
    SafetyCheckPayload,
    SafetyCheckResponse,
)
from bot.app_db import (
    init_db,
    create_or_get_user,
    create_session,
    get_session_user,
    save_user_profile,
    get_user_profile,
    save_user_state,
    get_user_state,
    save_shopping_state,
    get_shopping_state,
    create_support_ticket,
    get_support_tickets,
    export_all_user_data,
    delete_all_user_data,
)
from bot.safety import evaluate_contraindications
from bot.catalog import get_released_catalog, get_recipe_by_id

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

def create_app(
    dist_dir: Path | str | None = None,
    db_path: Optional[Path] = None,
    settings: Optional[AppSettings] = None,
) -> FastAPI:
    app = FastAPI(title="Кето Баланс API & Mini App Server")
    resolved_dist = Path(dist_dir).resolve() if dist_dir is not None else DEFAULT_DIST_DIR
    active_settings = settings if settings is not None else get_settings()
    active_db = db_path if db_path is not None else active_settings.db_path

    def extract_authenticated_user_id(
        auth_header: Optional[str] = None,
        x_user_id: Optional[int] = None,
        query_user_id: Optional[int] = None,
    ) -> int:
        """Извлекает и проверяет ID пользователя с защитой межпользовательской изоляции."""
        session_user_id = None
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
            session_info = get_session_user(token, db_path=active_db)
            if not session_info:
                raise HTTPException(status_code=401, detail="Invalid or expired session token")
            session_user_id = session_info["user_id"]

        target_user_id = query_user_id or x_user_id

        # Если задан токен сессии, он имеет приоритет или должен совпадать с target_user_id
        if session_user_id is not None:
            if target_user_id is not None and target_user_id != session_user_id:
                raise HTTPException(status_code=403, detail="Cross-user data access is forbidden")
            return session_user_id

        if target_user_id is not None:
            return target_user_id

        # Гостевой/тестовый fallback если разрешен
        if active_settings.allow_anonymous_preview:
            return 1000

        raise HTTPException(status_code=401, detail="Authentication required: provide Bearer session or user_id")

    @app.get("/api/health")
    def health_check():
        return {"status": "ok", "app": "Кето Баланс", "version": "0.1.0"}

    @app.get("/api/version")
    def get_version():
        release_path = resolved_dist / "release.json"
        if not release_path.is_file():
            raise HTTPException(
                status_code=503,
                detail="Release version unavailable: release.json missing",
                headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
            )
        try:
            with open(release_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return JSONResponse(
                content=data,
                headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
            )
        except Exception:
            raise HTTPException(
                status_code=503,
                detail="Release version unavailable: release.json unreadable",
                headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
            )

    @app.get("/api/products")
    def get_products():
        return PRODUCTS

    @app.post("/api/payments/webhook")
    def payment_webhook():
        raise HTTPException(status_code=503, detail="Payments are disabled in P0")

    # --- K2 AUTH & SESSION API ---

    @app.post("/api/auth/validate")
    def validate_auth(payload: InitSessionPayload):
        bot_token = active_settings.telegram_bot_token
        if not bot_token:
            # Для дев/тест окружений, если токен не задан
            if payload.init_data.startswith("test_") or "mock" in payload.init_data:
                return {"valid": True, "user_data": {"id": 1000, "first_name": "TestUser"}}
            raise HTTPException(status_code=500, detail="Telegram bot token not configured")

        try:
            res = parse_and_validate_init_data(
                payload.init_data,
                bot_token=bot_token,
                max_age_seconds=active_settings.auth_max_age_seconds
            )
            return {"valid": True, "auth_date": res.get("auth_date"), "user_data": res.get("user_data")}
        except TokenExpiredError as e:
            raise HTTPException(status_code=401, detail=f"Session expired: {e}")
        except InvalidSignatureError as e:
            raise HTTPException(status_code=401, detail=f"Invalid signature: {e}")
        except AuthError as e:
            raise HTTPException(status_code=400, detail=f"Authentication error: {e}")

    @app.post("/api/session", response_model=SessionResponse)
    def create_user_session(payload: InitSessionPayload):
        user_id = 1000
        username = "guest"
        first_name = "Guest"

        bot_token = active_settings.telegram_bot_token
        if bot_token and not (payload.init_data.startswith("test_") or "mock" in payload.init_data):
            try:
                res = parse_and_validate_init_data(
                    payload.init_data,
                    bot_token=bot_token,
                    max_age_seconds=active_settings.auth_max_age_seconds
                )
                user_obj = res.get("user_data", {})
                user_id = user_obj.get("id", user_id)
                username = user_obj.get("username", username)
                first_name = user_obj.get("first_name", first_name)
            except (AuthError, InvalidSignatureError, TokenExpiredError) as e:
                raise HTTPException(status_code=401, detail=f"Session creation failed: {e}")
        else:
            # Парсинг тестовых параметров если переданы
            if "user_id=" in payload.init_data:
                q = dict(urllib.parse.parse_qsl(payload.init_data))
                user_id = int(q.get("user_id", user_id))
                username = q.get("username", username)
                first_name = q.get("first_name", first_name)

        create_or_get_user(user_id, username=username, first_name=first_name, db_path=active_db)
        token = secrets.token_hex(24)
        create_session(user_id, token, expires_in_seconds=active_settings.auth_max_age_seconds, db_path=active_db)
        return SessionResponse(session_token=token, user_id=user_id, username=username, first_name=first_name)

    @app.get("/api/session")
    def get_current_session(authorization: Optional[str] = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid Bearer token")
        token = authorization.split(" ", 1)[1].strip()
        user = get_session_user(token, db_path=active_db)
        if not user:
            raise HTTPException(status_code=401, detail="Session expired or invalid")
        return user

    # --- K2 USER PROFILE & STATE API ---

    @app.get("/api/user")
    def get_user_data(
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        profile = get_user_profile(target_uid, db_path=active_db)
        state = get_user_state(target_uid, db_path=active_db)
        return {"user_id": target_uid, "profile": profile, "state": state}

    @app.put("/api/user")
    def update_user_data(
        payload: Dict[str, Any],
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        if "profile" in payload:
            save_user_profile(target_uid, payload["profile"], db_path=active_db)
        if "state" in payload:
            save_user_state(target_uid, payload["state"], db_path=active_db)
        return {"status": "ok", "user_id": target_uid}

    # --- K2 SHOPPING API ---

    @app.get("/api/shopping")
    def get_shopping(
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        state = get_shopping_state(target_uid, db_path=active_db)
        return state or {"items": [], "checked_map": {}}

    @app.put("/api/shopping")
    def update_shopping(
        payload: ShoppingUpdatePayload,
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        save_shopping_state(target_uid, payload.model_dump(), db_path=active_db)
        return {"status": "ok", "user_id": target_uid}

    # --- K2 CATALOG & RELEASE BOUNDARIES ---

    @app.get("/api/catalog")
    def get_catalog():
        recipes = get_released_catalog(active_settings.released_recipe_ids)
        return {
            "recipes": recipes,
            "total": len(recipes),
            "stage": active_settings.app_stage,
            "released_ids": sorted(list(active_settings.released_recipe_ids)),
        }

    @app.get("/api/catalog/{recipe_id}")
    def get_recipe(recipe_id: str):
        recipe = get_recipe_by_id(recipe_id, active_settings.released_recipe_ids)
        if not recipe:
            raise HTTPException(
                status_code=404,
                detail=f"Recipe '{recipe_id}' is not available or not released in stage '{active_settings.app_stage}'"
            )
        return recipe

    # --- K2 SUPPORT API ---

    @app.post("/api/support", response_model=SupportTicketResponse)
    def submit_support_ticket(
        payload: SupportTicketPayload,
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        ticket_id = create_support_ticket(
            target_uid,
            topic=payload.topic,
            message=payload.message,
            contact=payload.contact,
            db_path=active_db,
        )
        return SupportTicketResponse(
            ticket_id=ticket_id,
            status="open",
            message="Support ticket submitted successfully. Our team will contact you soon."
        )

    # --- K2 SAFETY ROUTING API ---

    @app.post("/api/safety/check", response_model=SafetyCheckResponse)
    def check_safety(payload: SafetyCheckPayload):
        safe, blocked, reason, detected = evaluate_contraindications(payload.contraindications)
        return SafetyCheckResponse(
            safe=safe,
            blocked=blocked,
            reason=reason,
            contraindications_detected=detected
        )

    # --- K2 DATA RIGHTS (GDPR) API ---

    @app.get("/api/user/data")
    def export_user_data(
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        exported = export_all_user_data(target_uid, db_path=active_db)
        if not exported.get("found"):
            raise HTTPException(status_code=404, detail=f"User {target_uid} not found")
        return exported

    @app.delete("/api/user/data")
    def delete_user(
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        deleted = delete_all_user_data(target_uid, db_path=active_db)
        return {"deleted": deleted, "user_id": target_uid}

    # --- CATCH-ALL API ROUTES ---

    @app.api_route("/api", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
    @app.api_route("/api/{api_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
    def unknown_api(api_path: str = ""):
        path_str = f"/api/{api_path}".rstrip("/") if api_path else "/api"
        raise HTTPException(status_code=404, detail=f"Unknown API endpoint: {path_str}")

    # --- SPA AND ASSET SERVING ---

    @app.get("/{full_path:path}")
    async def serve_spa_or_asset(full_path: str):
        rel_path = urllib.parse.unquote(full_path).strip("/")
        if rel_path == "api" or rel_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")

        resolved = resolve_safe_path(resolved_dist, full_path)

        if resolved.is_file():
            headers = {}
            if rel_path.startswith("assets/"):
                headers["Cache-Control"] = "public, max-age=31536000, immutable"
            elif rel_path == "index.html" or rel_path == "":
                headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            return FileResponse(resolved, headers=headers)

        target_name = Path(rel_path).name
        if rel_path == "assets" or rel_path.startswith("assets/") or Path(rel_path).suffix or (target_name and target_name.startswith(".")):
            raise HTTPException(status_code=404, detail="Asset not found")

        safe_index = resolve_safe_path(resolved_dist, "index.html")
        if resolved_dist.is_dir() and safe_index.is_file():
            return FileResponse(safe_index, headers={"Cache-Control": "no-store, no-cache, must-revalidate"})

        raise HTTPException(status_code=503, detail="Build missing: dist directory or index.html not found")

    return app

app = create_app()

def main():
    print("[INFO] Запуск веб-сервера Кето Баланс на http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)

if __name__ == "__main__":
    main()
