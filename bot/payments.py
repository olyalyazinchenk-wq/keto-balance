"""
Keto Balance — Модуль монетизации и обработки оплат (отключен в этапе P0).
"""
from typing import Dict, Any, Optional

def init_purchase(user_id: int, product_id: str) -> Dict[str, Any]:
    """
    В этапе P0 инициализация покупок полностью отключена во всех режимах.
    """
    raise RuntimeError("Payments are disabled")

def complete_demo_payment(order_id: str) -> Optional[Dict[str, Any]]:
    """
    В этапе P0 подтверждение демо-оплат полностью отключено во всех режимах.
    """
    raise RuntimeError("Payments are disabled")
