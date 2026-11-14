"""
bot/auth.py — Проверка подлинности Telegram WebApp initData (HMAC-SHA256) и свежести auth_date.
"""
import hashlib
import hmac
import json
import time
import urllib.parse
from typing import Any, Dict, Optional, Tuple

class AuthError(Exception):
    """Базовое исключение аутентификации Telegram WebApp."""
    pass

class TokenExpiredError(AuthError):
    """Истек срок действия сессии/auth_date."""
    pass

class InvalidSignatureError(AuthError):
    """Подпись HMAC не совпадает или повреждена."""
    pass

def generate_telegram_init_data(user_dict: Dict[str, Any], bot_token: str, auth_date: Optional[int] = None) -> str:
    """Генерирует валидную строку initData для тестов и интеграций."""
    if auth_date is None:
        auth_date = int(time.time())

    params = {
        "auth_date": str(auth_date),
        "query_id": "AAHdF6IQAAAAAN0XohD_test",
        "user": json.dumps(user_dict, separators=(",", ":"), ensure_ascii=False),
    }

    # Data-check-string: алфавитная сортировка параметров key=value через \n
    check_pairs = [f"{k}={v}" for k, v in sorted(params.items())]
    data_check_string = "\n".join(check_pairs)

    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    sig = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    params["hash"] = sig
    return urllib.parse.urlencode(params)

def parse_and_validate_init_data(
    init_data_raw: str,
    bot_token: str,
    max_age_seconds: int = 86400,
    current_time: Optional[float] = None
) -> Dict[str, Any]:
    """
    Валидирует raw initData от Telegram WebApp.
    Возвращает словарь проверенных параметров включая распарсенного 'user'.
    Бросает AuthError при любых отклонениях.
    """
    if not init_data_raw or not isinstance(init_data_raw, str):
        raise AuthError("Empty init_data")

    if not bot_token:
        raise AuthError("Bot token is required for validation")

    # Распарсить query string
    parsed_q = urllib.parse.parse_qsl(init_data_raw, keep_blank_values=True)
    if not parsed_q:
        raise AuthError("Invalid query string format")

    params_dict = dict(parsed_q)
    received_hash = params_dict.pop("hash", None)
    if not received_hash:
        raise InvalidSignatureError("Missing hash signature")

    # Собрать data-check-string из оставшихся полей
    data_check_list = [f"{k}={v}" for k, v in sorted(params_dict.items())]
    data_check_string = "\n".join(data_check_list)

    # Вычислить HMAC-SHA256
    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(received_hash.lower(), expected_hash.lower()):
        raise InvalidSignatureError("Invalid hash signature")

    # Проверка свежести auth_date
    auth_date_raw = params_dict.get("auth_date")
    if not auth_date_raw:
        raise AuthError("Missing auth_date")

    try:
        auth_date = int(auth_date_raw)
    except (ValueError, TypeError):
        raise AuthError("Invalid auth_date format")

    now = current_time if current_time is not None else time.time()
    if now - auth_date > max_age_seconds:
        raise TokenExpiredError(f"Init data expired (age: {int(now - auth_date)}s > max: {max_age_seconds}s)")

    if auth_date > now + 300: # Защита от будущего с допуском 5 мин
        raise AuthError("auth_date is in the future")

    result = dict(params_dict)
    result["auth_date"] = auth_date

    # Парсинг пользователя
    if "user" in result:
        try:
            result["user_data"] = json.loads(result["user"])
        except Exception:
            raise AuthError("Malformed user JSON payload")

    return result
