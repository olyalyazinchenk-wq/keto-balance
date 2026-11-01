"""
Keto Balance — Модуль монетизации и обработки оплат.
"""
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from bot.config import PRODUCTS, ALL_PRODUCTS

def is_payments_enabled() -> bool:
    """Проверяет, включен ли режим реальных платежей или демо-оплат."""
    if os.getenv("PAYMENTS_ENABLED") == "1":
        return True
    mode = os.getenv("PAYMENT_MODE", "disabled")
    return mode in ("enabled", "demo", "test")

def validate_product_id(product_id: str) -> bool:
    """Проверяет существование продукта в каталоге актуальных PRODUCTS."""
    return product_id in PRODUCTS

def get_product_info(product_id: str) -> Optional[Dict[str, Any]]:
    """Возвращает метаданные продукта по его ID (включая архивные)."""
    return ALL_PRODUCTS.get(product_id)

def format_currency(amount: float, currency: str = "RUB") -> str:
    """Форматирует сумму для отображения."""
    if currency == "RUB":
        return f"{int(amount)} ₽"
    return f"{amount} {currency}"

def init_purchase(
    user_id: int,
    product_id: str,
    provider: str = "",
    allow_demo: bool = False,
    db_path: Optional[Path | str] = None,
) -> Dict[str, Any]:
    """
    Инициализирует покупку продукта.
    При отключенных оплатах (PAYMENT_MODE='disabled' или PAYMENTS_ENABLED='0')
    и отсутствии флага allow_demo/provider='demo' выбрасывает RuntimeError("Payments are disabled").
    """
    mode = os.getenv("PAYMENT_MODE", "disabled")
    payments_enabled = os.getenv("PAYMENTS_ENABLED", "0")
    is_demo = allow_demo or provider == "demo"
    if (mode == "disabled" or payments_enabled == "0") and not is_demo:
        raise RuntimeError("Payments are disabled")

    if not validate_product_id(product_id):
        raise ValueError(f"Unknown product: {product_id}")

    product = PRODUCTS[product_id]
    amount = float(product["price"])
    # Dynamic import to avoid module-level coupling
    import bot.app_db as app_db
    order_id = app_db.create_order(
        db_path=db_path,
        user_id=user_id,
        product_id=product_id,
        amount_rub=amount,
        provider=provider or "demo",
    )
    return {
        "order_id": order_id,
        "product_id": product_id,
        "amount": amount,
        "currency": "RUB",
        "status": "pending",
        "payment_url": None,
        "demo_mode": True,
    }

def complete_demo_payment(
    order_id: str,
    allow_demo: bool = False,
    db_path: Optional[Path | str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Подтверждает и активирует демо-оплату заказа.
    При отключенных оплатах и отсутствии allow_demo выбрасывает RuntimeError("Payments are disabled").
    """
    mode = os.getenv("PAYMENT_MODE", "disabled")
    payments_enabled = os.getenv("PAYMENTS_ENABLED", "0")
    if (mode == "disabled" or payments_enabled == "0") and not allow_demo:
        raise RuntimeError("Payments are disabled")

    import bot.app_db as app_db
    return app_db.complete_order(db_path=db_path, order_id=order_id)
