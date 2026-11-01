"""
Кето Баланс — FastAPI сервер для статики Mini App и REST API (K2-Pilot).
"""
import hashlib
import json
import logging
import os
import secrets
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("KetoServer")

def answer_pre_checkout_query(
    bot_token: str,
    pre_checkout_query_id: str,
    ok: bool = True,
    error_message: Optional[str] = None
) -> bool:
    if not bot_token or "test" in bot_token.lower() or os.getenv("APP_STAGE") == "test":
        return True
    url = f"https://api.telegram.org/bot{bot_token}/answerPreCheckoutQuery"
    payload: Dict[str, Any] = {"pre_checkout_query_id": pre_checkout_query_id, "ok": ok}
    if not ok and error_message:
        payload["error_message"] = error_message
    try:
        import httpx
        resp = httpx.post(url, json=payload, timeout=8.0)
        return resp.status_code == 200
    except Exception as e:
        logger.warning(f"Failed to answer pre_checkout_query: {e}")
        return False

def create_star_invoice_link(
    bot_token: str,
    title: str,
    description: str,
    payload: str,
    stars_amount: int = 1000
) -> Optional[str]:
    if not bot_token or "test" in bot_token.lower() or os.getenv("APP_STAGE") == "test":
        return f"https://t.me/$stars_invoice_mock_{payload}"
    url = f"https://api.telegram.org/bot{bot_token}/createInvoiceLink"
    data = {
        "title": title,
        "description": description,
        "payload": payload,
        "provider_token": "",  # Empty for Telegram Stars (XTR)
        "currency": "XTR",
        "prices": [{"label": title, "amount": stars_amount}],
    }
    try:
        import httpx
        resp = httpx.post(url, json=data, timeout=8.0)
        if resp.status_code == 200:
            result = resp.json().get("result")
            return result
    except Exception as e:
        logger.warning(f"Failed to create Stars invoice link: {e}")
    return None

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
import uvicorn

from bot.config import PRODUCTS, ALL_PRODUCTS
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
    SubscriptionReadV1,
    PurchaseInitPayloadV1,
    PurchaseInitResponseV1,
    PurchaseConfirmPayloadV1,
    PurchaseConfirmResponseV1,
    ConsentItemModel,
    UserConsentsPayload,
)
from bot.pilot_models import (
    PilotUserReadV1,
    PilotUserWriteV1,
    PilotShoppingReadV1,
    PilotShoppingWriteV1,
    PilotSaveResultV1,
)
from bot.app_db import (
    init_db,
    get_db_connection,
    create_or_get_user,
    create_session,
    get_session_user,
    save_user_profile,
    get_user_profile,
    save_user_state,
    get_user_state,
    save_shopping_state,
    get_shopping_state,
    get_pilot_user,
    save_pilot_user,
    get_pilot_shopping,
    save_pilot_shopping,
    StaleRevisionError,
    create_support_ticket,
    get_support_tickets,
    export_all_user_data,
    delete_all_user_data,
    get_user_subscription,
    save_user_subscription,
    create_order,
    get_order,
    complete_order,
    record_user_consent,
    get_user_consents,
)
from bot.safety import evaluate_contraindications
from bot.catalog import CatalogService, CatalogProvider, is_shopping_consistent_with_menu

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

def _compute_backend_fingerprint() -> str:
    bot_dir = Path(__file__).resolve().parent
    hasher = hashlib.sha256()
    for py_file in sorted(bot_dir.glob("*.py")):
        try:
            hasher.update(py_file.name.encode("utf-8"))
            hasher.update(py_file.read_bytes())
        except Exception:
            pass
    return hasher.hexdigest()[:16]

def create_app(
    dist_dir: Path | str | None = None,
    db_path: Optional[Path] = None,
    settings: Optional[AppSettings] = None,
    catalog_provider: Optional[CatalogProvider] = None,
) -> FastAPI:
    app = FastAPI(title="Кето Баланс API & Mini App Server")
    resolved_dist = Path(dist_dir).resolve() if dist_dir is not None else DEFAULT_DIST_DIR
    active_settings = settings if settings is not None else get_settings()
    active_db = db_path if db_path is not None else active_settings.db_path
    catalog_service = CatalogService(dist_dir=resolved_dist, provider=catalog_provider, app_stage=active_settings.app_stage)
    startup_backend_fingerprint = _compute_backend_fingerprint()

    def extract_authenticated_user_id(
        auth_header: Optional[str] = None,
        x_user_id: Optional[int] = None,
        query_user_id: Optional[int] = None,
    ) -> int:
        """Извлекает и проверяет ID пользователя с защитой межпользовательской изоляции."""
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authentication required: provide Bearer session token")

        token = auth_header.split(" ", 1)[1].strip()
        if not token:
            raise HTTPException(status_code=401, detail="Authentication required: provide Bearer session token")

        session_info = get_session_user(token, db_path=active_db)
        if not session_info:
            raise HTTPException(status_code=401, detail="Invalid or expired session token")

        session_user_id = session_info["user_id"]
        if active_settings.owner_allowlist is not None and session_user_id not in active_settings.owner_allowlist:
            raise HTTPException(status_code=403, detail="Access denied: user is not in owner allowlist")

        # Если заданы query_user_id или x_user_id, каждый из них обязан совпадать с session_user_id
        if query_user_id is not None and query_user_id != session_user_id:
            raise HTTPException(status_code=403, detail="Cross-user data access is forbidden")
        if x_user_id is not None and x_user_id != session_user_id:
            raise HTTPException(status_code=403, detail="Cross-user data access is forbidden")

        return session_user_id

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
            data["backendFingerprint"] = startup_backend_fingerprint
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

    # --- TELEGRAM STARS PAYMENTS & WEBHOOK API ---

    @app.post("/api/telegram/webhook")
    @app.post("/api/payments/webhook")
    async def telegram_payments_webhook(request: Request):
        from bot.payments import is_payments_enabled
        if not is_payments_enabled():
            raise HTTPException(status_code=503, detail="Payments are disabled in P0")

        try:
            update = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

        bot_token = active_settings.telegram_bot_token or ""

        # 1. Pre-checkout query validation (must answer within 10s)
        if "pre_checkout_query" in update:
            pcq = update["pre_checkout_query"]
            pcq_id = pcq.get("id")
            order_id = pcq.get("invoice_payload")
            if order_id:
                order = get_order(active_db, order_id)
                if not order:
                    answer_pre_checkout_query(bot_token, pcq_id, ok=False, error_message="Заказ не найден")
                    return JSONResponse(status_code=404, content={"ok": False, "error": "Order not found"})

            answer_pre_checkout_query(bot_token=bot_token, pre_checkout_query_id=pcq_id, ok=True)
            return {"ok": True}

        # 2. Successful payment handling
        msg = update.get("message") or {}
        succ = msg.get("successful_payment")
        if succ:
            order_id = succ.get("invoice_payload")
            if not order_id:
                raise HTTPException(status_code=400, detail="Missing invoice_payload")
            order = get_order(active_db, order_id)
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")

            completed = complete_order(db_path=active_db, order_id=order_id)
            return {"ok": True, "completed_order_id": order_id, "subscription": completed.get("subscription")}

        return {"ok": True, "ignored": True}

    # --- K2 AUTH & SESSION API ---

    @app.post("/api/auth/validate")
    def validate_auth(payload: InitSessionPayload):
        bot_token = active_settings.telegram_bot_token
        if not bot_token:
            raise HTTPException(status_code=503, detail="Telegram bot token not configured")

        if not payload.init_data:
            raise HTTPException(status_code=401, detail="Missing init_data")

        try:
            res = parse_and_validate_init_data(
                payload.init_data,
                bot_token=bot_token,
                max_age_seconds=active_settings.auth_max_age_seconds
            )
            user_obj = res.get("user_data")
            if not user_obj or not isinstance(user_obj, dict) or not user_obj.get("id"):
                raise HTTPException(status_code=401, detail="User payload missing or invalid")
            return {"valid": True, "auth_date": res.get("auth_date"), "user_data": user_obj}
        except TokenExpiredError as e:
            raise HTTPException(status_code=401, detail=f"Session expired: {e}")
        except InvalidSignatureError as e:
            raise HTTPException(status_code=401, detail=f"Invalid signature: {e}")
        except AuthError as e:
            raise HTTPException(status_code=401, detail=f"Authentication error: {e}")

    @app.post("/api/session", response_model=SessionResponse)
    def create_user_session(payload: InitSessionPayload):
        bot_token = active_settings.telegram_bot_token
        if not bot_token:
            raise HTTPException(status_code=503, detail="Telegram bot token not configured")

        if not payload.init_data:
            raise HTTPException(status_code=401, detail="Missing init_data")

        try:
            res = parse_and_validate_init_data(
                payload.init_data,
                bot_token=bot_token,
                max_age_seconds=active_settings.auth_max_age_seconds
            )
            user_obj = res.get("user_data")
            if not user_obj or not isinstance(user_obj, dict):
                raise HTTPException(status_code=401, detail="Session creation failed: missing user payload")
            user_id = user_obj.get("id")
            if not isinstance(user_id, int) or user_id <= 0:
                raise HTTPException(status_code=401, detail="Session creation failed: invalid Telegram user ID")
            username = user_obj.get("username", "") or ""
            first_name = user_obj.get("first_name", "") or ""
        except TokenExpiredError as e:
            raise HTTPException(status_code=401, detail=f"Session creation failed: {e}")
        except InvalidSignatureError as e:
            raise HTTPException(status_code=401, detail=f"Invalid signature: {e}")
        except AuthError as e:
            raise HTTPException(status_code=401, detail=f"Session creation failed: {e}")

        if active_settings.owner_allowlist is not None and user_id not in active_settings.owner_allowlist:
            raise HTTPException(status_code=403, detail="Access denied: user is not in owner allowlist")

        create_or_get_user(user_id, username=username, first_name=first_name, db_path=active_db)
        token = secrets.token_hex(24)
        session_ttl = (
            active_settings.session_max_lifetime_seconds
            if active_settings.session_max_lifetime_seconds is not None
            else active_settings.auth_max_age_seconds
        )
        create_session(user_id, token, expires_in_seconds=session_ttl, db_path=active_db)
        return SessionResponse(session_token=token, user_id=user_id, username=username, first_name=first_name)

    if active_settings.allow_demo_auth and active_settings.app_stage == "test":
        @app.get("/api/demo-session", response_model=SessionResponse)
        def create_demo_session(
            demo_user: int = Query(1084557944),
            premium: Optional[int] = Query(None),
        ):
            if active_settings.owner_allowlist is not None and demo_user not in active_settings.owner_allowlist:
                raise HTTPException(status_code=403, detail="Access denied: user is not in owner allowlist")
            username = "demo_owner"
            first_name = "Ольга"
            create_or_get_user(demo_user, username=username, first_name=first_name, db_path=active_db)
            if premium is not None:
                if premium == 1:
                    save_user_subscription(
                        active_db,
                        demo_user,
                        tier="sub_month",
                        status="active",
                        expires_at=(datetime.now(timezone.utc) + timedelta(days=30)).isoformat().replace("+00:00", "Z"),
                    )
                else:
                    save_user_subscription(
                        active_db,
                        demo_user,
                        tier="free",
                        status="none",
                        expires_at=None,
                    )
            token = secrets.token_hex(24)
            session_ttl = (
                active_settings.session_max_lifetime_seconds
                if active_settings.session_max_lifetime_seconds is not None
                else active_settings.auth_max_age_seconds
            )
            create_session(demo_user, token, expires_in_seconds=session_ttl, db_path=active_db)
            return SessionResponse(session_token=token, user_id=demo_user, username=username, first_name=first_name)

    @app.get("/api/session")
    def get_current_session(authorization: Optional[str] = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid Bearer token")
        token = authorization.split(" ", 1)[1].strip()
        user = get_session_user(token, db_path=active_db)
        if not user:
            raise HTTPException(status_code=401, detail="Session expired or invalid")
        if active_settings.owner_allowlist is not None and user["user_id"] not in active_settings.owner_allowlist:
            raise HTTPException(status_code=403, detail="Access denied: user is not in owner allowlist")
        return user

    # --- SUBSCRIPTION & MONETIZATION API ---

    @app.get("/api/subscription", response_model=SubscriptionReadV1)
    def get_user_subscription_endpoint(
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        sub = get_user_subscription(active_db, target_uid)
        is_premium = False
        tier = None
        status = "none"
        expires_at = None

        if sub:
            tier = sub.get("tier")
            status = sub.get("status", "none")
            expires_at = sub.get("expires_at")
            if status == "active":
                if expires_at:
                    try:
                        exp_dt = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
                        if exp_dt.tzinfo is None:
                            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                        if datetime.now(timezone.utc) > exp_dt:
                            status = "expired"
                            save_user_subscription(
                                active_db,
                                target_uid,
                                tier=tier or "free",
                                status="expired",
                                expires_at=expires_at,
                            )
                    except Exception:
                        # Corrupt or unparseable expiration date must never grant premium
                        status = "expired"
                else:
                    # In production and staging, every subscription requires a valid expiration date
                    if active_settings.is_production or active_settings.app_stage in ("production", "staging"):
                        status = "expired"
                if status == "active" and tier not in (None, "free"):
                    is_premium = True

        available_catalog = (
            PRODUCTS
            if (active_settings.is_production or active_settings.app_stage in ("production", "staging"))
            else ALL_PRODUCTS
        )
        available_products = [
            {
                "id": p["id"],
                "title": p["title"],
                "price_rub": p["price"],
                "period": "month" if "month" in p["id"] or p["id"] == "vip_care" else "one_time",
                "description": p.get("description", ""),
                "badge": p.get("badge", ""),
            }
            for p in available_catalog.values()
        ]

        return SubscriptionReadV1(
            is_premium=is_premium,
            tier=tier,
            status=status,
            expires_at=expires_at,
            available_products=available_products,
            user_id=target_uid,
        )

    @app.post("/api/subscription/purchase", response_model=PurchaseInitResponseV1)
    def purchase_subscription_endpoint(
        payload: PurchaseInitPayloadV1,
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        available_catalog = (
            PRODUCTS
            if (active_settings.is_production or active_settings.app_stage in ("production", "staging"))
            else ALL_PRODUCTS
        )
        if payload.product_id not in available_catalog:
            raise HTTPException(status_code=400, detail=f"Unknown product '{payload.product_id}'")

        prod = available_catalog[payload.product_id]
        order_id = create_order(
            db_path=active_db,
            user_id=target_uid,
            product_id=payload.product_id,
            amount_rub=float(prod["price"]),
            provider=payload.provider or "demo",
        )
        demo_mode = (
            (payload.provider == "demo" or not payload.provider)
            and not (active_settings.is_production or active_settings.app_stage in ("production", "staging"))
        )
        payment_url = None
        if not demo_mode and active_settings.telegram_bot_token:
            payment_url = create_star_invoice_link(
                bot_token=active_settings.telegram_bot_token,
                title=f"Кето Баланс: {prod['title']}",
                description=prod.get("description", "Подписка на 1 месяц"),
                payload=order_id,
                stars_amount=1000,
            )
        return PurchaseInitResponseV1(
            order_id=order_id,
            status="pending",
            payment_url=payment_url,
            demo_mode=demo_mode,
        )

    @app.post("/api/subscription/confirm-demo", response_model=PurchaseConfirmResponseV1)
    def confirm_demo_subscription_endpoint(
        payload: PurchaseConfirmPayloadV1,
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        # Strict boundary: demo payment confirmation is completely disabled in production and staging
        if (
            active_settings.is_production
            or active_settings.app_stage in ("production", "staging")
            or not (active_settings.allow_demo_auth and active_settings.app_stage == "test")
        ):
            raise HTTPException(
                status_code=403,
                detail="Demo subscription confirmation is disabled in production and staging environments",
            )

        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        order = get_order(active_db, payload.order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if order["user_id"] != target_uid:
            raise HTTPException(status_code=403, detail="Cross-user order confirmation forbidden")
        if order.get("provider") != "demo":
            raise HTTPException(status_code=403, detail="Only demo orders can be confirmed via demo endpoint")

        completed_order = complete_order(active_db, payload.order_id)
        sub = completed_order.get("subscription") or get_user_subscription(active_db, target_uid)

        available_catalog = (
            PRODUCTS
            if (active_settings.is_production or active_settings.app_stage in ("production", "staging"))
            else ALL_PRODUCTS
        )
        available_products = [
            {
                "id": p["id"],
                "title": p["title"],
                "price_rub": p["price"],
                "period": "month" if "month" in p["id"] or p["id"] == "vip_care" else "one_time",
                "description": p.get("description", ""),
                "badge": p.get("badge", ""),
            }
            for p in available_catalog.values()
        ]

        is_prem = False
        if sub and sub.get("status") == "active":
            exp_raw = sub.get("expires_at")
            if exp_raw:
                try:
                    if isinstance(exp_raw, (int, float)):
                        exp_dt = datetime.fromtimestamp(exp_raw, tz=timezone.utc)
                    else:
                        exp_dt = datetime.fromisoformat(str(exp_raw).replace("Z", "+00:00"))
                    if exp_dt.tzinfo is None:
                        exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) > exp_dt:
                        sub["status"] = "expired"
                    elif sub.get("tier") not in (None, "free"):
                        is_prem = True
                except Exception:
                    sub["status"] = "expired"
            else:
                if not (active_settings.is_production or active_settings.app_stage in ("production", "staging")):
                    if sub.get("tier") not in (None, "free"):
                        is_prem = True
        sub_read = SubscriptionReadV1(
            is_premium=is_prem,
            tier=sub.get("tier") if sub else None,
            status=sub.get("status", "active") if sub else "active",
            expires_at=sub.get("expires_at") if sub else None,
            available_products=available_products,
            user_id=target_uid,
        )
        return PurchaseConfirmResponseV1(
            success=True,
            subscription=sub_read,
            is_premium=sub_read.is_premium,
            tier=sub_read.tier,
            status=sub_read.status,
            expires_at=sub_read.expires_at,
        )

    # --- K2 USER PROFILE & STATE API ---

    @app.get("/api/user", response_model=PilotUserReadV1)
    def get_user_data(
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        user_data = get_pilot_user(target_uid, db_path=active_db)
        state = user_data.get("state")
        if state and isinstance(state, dict):
            menu = state.get("menu")
            if menu and isinstance(menu, dict):
                admitted_recipes = catalog_service.get_released_recipes()
                admitted_ids = {r.get("id") for r in admitted_recipes if r.get("id")}
                has_revoked = False
                days = menu.get("days") or []
                menu_recipe_ids = set()
                for day in days:
                    slots = day.get("slots") or {}
                    for slot_key, r_id in slots.items():
                        if r_id:
                            menu_recipe_ids.add(r_id)
                        if r_id not in admitted_ids:
                            has_revoked = True
                            break
                    if has_revoked:
                        break
                if has_revoked:
                    state["shopping_stale"] = True
                else:
                    shopping_data = get_pilot_shopping(target_uid, db_path=active_db)
                    has_shopping_record = bool(shopping_data.get("revision", 0) > 0)
                    if has_shopping_record:
                        shopping_items = shopping_data.get("items") or []
                        is_consistent = is_shopping_consistent_with_menu(
                            menu, state.get("shopping_batches", 1), shopping_items, catalog_service
                        )
                        state["shopping_stale"] = not is_consistent
        return user_data

    @app.put("/api/user", response_model=PilotSaveResultV1)
    def update_user_data(
        payload: PilotUserWriteV1,
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        if payload.state and payload.state.menu:
            admitted_recipes = catalog_service.get_released_recipes()
            admitted_ids = {r.get("id") for r in admitted_recipes if r.get("id")}
            for day in payload.state.menu.days:
                for slot_key, r_id in day.slots.items():
                    if r_id not in admitted_ids:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Menu contains unreleased or unknown recipe ID: '{r_id}'"
                        )
            shopping_data = get_pilot_shopping(target_uid, db_path=active_db)
            has_shopping_record = bool(shopping_data.get("revision", 0) > 0)
            if has_shopping_record:
                shopping_items = shopping_data.get("items") or []
                is_consistent = is_shopping_consistent_with_menu(
                    payload.state.menu.model_dump(),
                    payload.state.shopping_batches,
                    shopping_items,
                    catalog_service
                )
                payload.state.shopping_stale = not is_consistent
        try:
            return save_pilot_user(target_uid, payload.model_dump(), db_path=active_db)
        except StaleRevisionError as e:
            raise HTTPException(status_code=409, detail=str(e))

    # --- K2 SHOPPING API ---

    @app.get("/api/shopping", response_model=PilotShoppingReadV1)
    def get_shopping(
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        return get_pilot_shopping(target_uid, db_path=active_db)

    @app.put("/api/shopping", response_model=PilotSaveResultV1)
    def update_shopping(
        payload: PilotShoppingWriteV1,
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        try:
            return save_pilot_shopping(target_uid, payload.model_dump(), db_path=active_db)
        except StaleRevisionError as e:
            raise HTTPException(status_code=409, detail=str(e))

    # --- K2 CATALOG & RELEASE BOUNDARIES ---

    @app.get("/api/catalog")
    def get_catalog():
        return catalog_service.get_catalog_data()

    @app.get("/api/catalog/{recipe_id}")
    def get_recipe(recipe_id: str):
        recipe = catalog_service.get_recipe_by_id(recipe_id)
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

    # --- USER CONSENTS (DATA GOVERNANCE) API ---

    @app.post("/api/user/consents")
    def post_user_consents(
        payload: UserConsentsPayload,
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        for item in payload.consents:
            record_user_consent(
                user_id=target_uid,
                consent_type=item.consent_type,
                version=item.version,
                granted=item.granted,
                source=item.source or "tma",
                db_path=active_db,
            )
        all_consents = get_user_consents(target_uid, db_path=active_db)
        return {"success": True, "recorded": len(payload.consents), "consents": all_consents}

    @app.get("/api/user/consents")
    def get_user_consents_endpoint(
        authorization: Optional[str] = Header(None),
        x_user_id: Optional[int] = Header(None),
        user_id: Optional[int] = Query(None),
    ):
        target_uid = extract_authenticated_user_id(authorization, x_user_id, user_id)
        all_consents = get_user_consents(target_uid, db_path=active_db)
        return {"user_id": target_uid, "consents": all_consents}

    # --- EDUCATIONAL GUIDES API ---

    @app.get("/api/education/guides")
    def get_educational_guides():
        guides_path = Path(__file__).resolve().parent.parent / "docs" / "content" / "educational-guides.json"
        if not guides_path.is_file():
            return {"guides": [], "count": 0}
        try:
            with open(guides_path, "r", encoding="utf-8") as f:
                guides = json.load(f)
            return {"guides": guides, "count": len(guides)}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to read educational guides: {e}")

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
