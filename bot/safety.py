"""
bot/safety.py — Модуль безопасности и консервативного стоп-протокола (P09).
Обеспечивает перехват экстренных медицинских симптомов, активацию runtime safety-hold
и приостановку любых диетических рекомендаций.
"""
import re
from typing import Dict, Any, Tuple, Optional

EMERGENCY_PATTERNS = [
    r"боль\s+в\s+груди",
    r"давит\s+в\s+груди",
    r"жжение\s+в\s+груди",
    r"сердц[еа]\s+болит",
    r"задыхаюсь",
    r"удушь[ея]",
    r"трудно\s+дышать",
    r"не\s+могу\s+дышать",
    r"нехватк[аи]\s+воздуха",
    r"потер[яе]\s+сознания",
    r"падаю\s+в\s+обморок",
    r"обморок",
    r"потемнело\s+в\s+глазах",
]

NEGATION_PATTERNS = [
    r"нет\s+боли\s+в\s+груди",
    r"не\s+болит\s+грудь",
    r"не\s+задыхаюсь",
    r"нет\s+удушья",
    r"без\s+потери\s+сознания",
]

EMERGENCY_RESPONSE = (
    "⚠️ <b>Внимание: экстренная медицинская помощь!</b>\n\n"
    "При появлении острых симптомов (боль или давление в груди, затруднение дыхания, удушье, нарушение сознания) "
    "немедленно обратитесь к врачу или вызовите скорую помощь!\n\n"
    "📞 <b>Телефоны экстренных служб:</b> <b>112</b> или <b>103</b> (для РФ; в других странах используйте местные номера экстренных служб).\n\n"
    "🛑 <i>Все диетические советы и персональные расчеты приостановлены. Сервис не является медицинской организацией и не ставит диагнозы.</i>"
)

def detect_emergency_symptoms(text: str) -> bool:
    """
    Проверяет текст на наличие документированных экстренных симптомов.
    Учитывает явные отрицания.
    """
    if not text or not isinstance(text, str):
        return False
    
    norm = text.lower().strip()
    
    # Проверка отрицаний (если пользователь явно пишет, что симптомов нет)
    for neg in NEGATION_PATTERNS:
        if re.search(neg, norm):
            return False
            
    for pattern in EMERGENCY_PATTERNS:
        if re.search(pattern, norm):
            return True
            
    return False

def check_safety_guard(user_data: Dict[str, Any], text: str = "") -> Tuple[bool, Optional[str]]:
    """
    Проверяет safety-guard для пользователя.
    Если активен safety_hold или в тексте обнаружены экстренные симптомы,
    возвращает (True, EMERGENCY_RESPONSE) и переводит пользователя в режим hold.
    """
    if user_data.get("safety_hold"):
        return True, EMERGENCY_RESPONSE
        
    if text and detect_emergency_symptoms(text):
        user_data["safety_hold"] = True
        user_data["safety_hold_reason"] = "emergency_symptoms"
        return True, EMERGENCY_RESPONSE
        
    return False, None

def release_safety_hold(user_data: Dict[str, Any]) -> None:
    """Снятие ошибочно установленной отметки (не означает медицинское заключение о здоровье)"""
    user_data.pop("safety_hold", None)
    user_data.pop("safety_hold_reason", None)
