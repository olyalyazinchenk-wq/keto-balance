"""
Keto Balance — Модуль монетизации и обработки оплат (ЮKassa / Telegram Payments / Demo).
"""
import uuid
from typing import Dict, Any, Optional
from bot.config import PRODUCTS, PAYMENT_MODE, PAYMENT_PROVIDER_TOKEN
from bot.database import create_order, mark_order_paid

def init_purchase(user_id: int, product_id: str) -> Dict[str, Any]:
    """
    Инициализирует заказ и возвращает данные для выставления счета.
    """
    product = PRODUCTS.get(product_id)
    if not product:
        raise ValueError(f"Неизвестный продукт: {product_id}")
        
    order_id = f"kb_{uuid.uuid4().hex[:10]}"
    create_order(order_id, user_id, product_id, float(product["price"]))
    
    return {
        "order_id": order_id,
        "product_id": product_id,
        "title": product["title"],
        "description": product["description"],
        "price": product["price"],
        "mode": PAYMENT_MODE,
        "provider_token": PAYMENT_PROVIDER_TOKEN,
    }

def complete_demo_payment(order_id: str) -> Optional[Dict[str, Any]]:
    """
    Эмулирует успешную оплату в тестовом режиме.
    """
    return mark_order_paid(order_id)
