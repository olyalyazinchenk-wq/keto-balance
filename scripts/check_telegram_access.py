#!/usr/bin/env python3
"""
scripts/check_telegram_access.py — Проверка доступности Telegram Bot API с сервера.

Учитывает особенности российских дата-центров (возможные блокировки диапазонов IP Telegram,
таймауты или необходимость прокси-сервера).

Возвращает:
  0 — Telegram API доступен (напрямую или через настроенный прокси)
  1 — Доступ отсутствует (требуется настройка KETO_BOT_PROXY)
"""
import argparse
import json
import os
import socket
import sys
import time
from typing import Dict, Any, Optional
import urllib.request
import urllib.error


TELEGRAM_API_HOST = "api.telegram.org"
TELEGRAM_BASE_URL = "https://api.telegram.org"


def check_dns(host: str = TELEGRAM_API_HOST) -> Dict[str, Any]:
    """Проверяет разрешение DNS для хоста Telegram."""
    start = time.perf_counter()
    try:
        results = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
        elapsed = (time.perf_counter() - start) * 1000.0
        ips = sorted(list({r[4][0] for r in results}))
        return {"ok": True, "elapsed_ms": round(elapsed, 2), "ips": ips, "error": None}
    except Exception as exc:
        elapsed = (time.perf_counter() - start) * 1000.0
        return {"ok": False, "elapsed_ms": round(elapsed, 2), "ips": [], "error": str(exc)}


def check_http_endpoint(
    url: str,
    proxy_url: Optional[str] = None,
    timeout: float = 7.0,
) -> Dict[str, Any]:
    """Проверяет HTTPS-подключение к эндпоинту."""
    start = time.perf_counter()
    handlers = []
    if proxy_url:
        handlers.append(urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url}))
    else:
        # Без системных прокси окружения для честной проверки прямого подключения
        handlers.append(urllib.request.ProxyHandler({}))

    opener = urllib.request.build_opener(*handlers)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "KetoBalanceConnectivityProbe/1.0", "Cache-Control": "no-cache"},
    )

    try:
        with opener.open(req, timeout=timeout) as resp:
            elapsed = (time.perf_counter() - start) * 1000.0
            return {
                "ok": True,
                "status_code": resp.status,
                "elapsed_ms": round(elapsed, 2),
                "error": None,
            }
    except urllib.error.HTTPError as exc:
        elapsed = (time.perf_counter() - start) * 1000.0
        # Коды 401, 404 означают, что сервер Telegram ответил корректно (сеть и TLS работают)
        return {
            "ok": True,
            "status_code": exc.code,
            "elapsed_ms": round(elapsed, 2),
            "error": None,
        }
    except Exception as exc:
        elapsed = (time.perf_counter() - start) * 1000.0
        return {
            "ok": False,
            "status_code": 0,
            "elapsed_ms": round(elapsed, 2),
            "error": str(exc),
        }


def check_bot_token(
    token: str,
    proxy_url: Optional[str] = None,
    timeout: float = 7.0,
) -> Dict[str, Any]:
    """Проверяет валидность токена бота через getMe."""
    if not token or "test" in token.lower():
        return {"tested": False, "reason": "No real token provided"}

    url = f"{TELEGRAM_BASE_URL}/bot{token}/getMe"
    res = check_http_endpoint(url, proxy_url=proxy_url, timeout=timeout)
    if res["ok"] and res.get("status_code") == 200:
        return {"tested": True, "valid": True, "elapsed_ms": res["elapsed_ms"]}
    elif res["ok"] and res.get("status_code") in (401, 404):
        return {"tested": True, "valid": False, "error": "Invalid or revoked bot token"}
    else:
        return {"tested": True, "valid": False, "error": res.get("error") or f"HTTP {res.get('status_code')}"}


def diagnose_connectivity(
    token: Optional[str] = None,
    proxy_url: Optional[str] = None,
    timeout: float = 7.0,
) -> Dict[str, Any]:
    """Полная диагностика доступности Telegram API."""
    dns = check_dns()
    direct = check_http_endpoint(f"{TELEGRAM_BASE_URL}/", proxy_url=None, timeout=timeout)

    configured_proxy = proxy_url or os.getenv("KETO_BOT_PROXY") or os.getenv("HTTPS_PROXY")
    proxy_res = None
    if configured_proxy:
        proxy_res = check_http_endpoint(f"{TELEGRAM_BASE_URL}/", proxy_url=configured_proxy, timeout=timeout)

    effective_token = token or os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("KETO_BOT_TOKEN")
    token_res = None
    if effective_token:
        active_proxy = configured_proxy if (not direct["ok"] and proxy_res and proxy_res["ok"]) else None
        token_res = check_bot_token(effective_token, proxy_url=active_proxy, timeout=timeout)

    # Оценка общего статуса
    if direct["ok"]:
        overall_status = "TELEGRAM_DIRECT_OK"
        exit_code = 0
    elif proxy_res and proxy_res["ok"]:
        overall_status = "TELEGRAM_PROXY_OK"
        exit_code = 0
    else:
        overall_status = "TELEGRAM_BLOCKED_OR_UNREACHABLE"
        exit_code = 1

    return {
        "status": overall_status,
        "exit_code": exit_code,
        "dns": dns,
        "direct_https": direct,
        "proxy_configured": configured_proxy,
        "proxy_https": proxy_res,
        "token_verification": token_res,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Telegram Bot API connectivity from server environment")
    parser.add_argument("--token", type=str, default="", help="Telegram Bot Token to verify")
    parser.add_argument("--proxy", type=str, default="", help="Optional HTTP/SOCKS5 proxy URL to test")
    parser.add_argument("--timeout", type=float, default=7.0, help="Timeout in seconds for network calls")
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    args = parser.parse_args()

    results = diagnose_connectivity(token=args.token, proxy_url=args.proxy, timeout=args.timeout)

    if args.json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
        return results["exit_code"]

    print("=" * 60)
    print("  KETO BALANCE: TELEGRAM API CONNECTIVITY CHECK")
    print("=" * 60)
    print(f"Status:             {results['status']}")
    print(f"DNS Resolution:     {'OK' if results['dns']['ok'] else 'FAIL'} ({results['dns']['elapsed_ms']} ms)")
    if results['dns']['ips']:
        print(f"Resolved IPs:       {', '.join(results['dns']['ips'])}")
    print(f"Direct Connection:  {'SUCCESS' if results['direct_https']['ok'] else 'FAILED'}")
    if results['direct_https']['ok']:
        print(f"Latency:            {results['direct_https']['elapsed_ms']} ms (HTTP {results['direct_https']['status_code']})")
    else:
        print(f"Direct Error:       {results['direct_https']['error']}")

    if results['proxy_configured']:
        print(f"Proxy URL:          {results['proxy_configured']}")
        p_res = results['proxy_https']
        print(f"Proxy Connection:   {'SUCCESS' if p_res and p_res['ok'] else 'FAILED'}")
        if p_res and p_res['ok']:
            print(f"Proxy Latency:      {p_res['elapsed_ms']} ms")
        elif p_res:
            print(f"Proxy Error:        {p_res['error']}")

    if results.get("token_verification") and results["token_verification"].get("tested"):
        tv = results["token_verification"]
        if tv.get("valid"):
            print(f"Bot Authorization:  CONFIRMED (getMe OK, {tv['elapsed_ms']} ms)")
        else:
            print(f"Bot Authorization:  FAILED ({tv.get('error')})")

    print("-" * 60)
    if results["exit_code"] == 0:
        print("[OK] Сервер успешно соединяется с Telegram Bot API.")
    else:
        print("[WARNING] Прямой доступ к api.telegram.org с этого сервера заблокирован или недоступен.")
        print("Рекомендация для российских дата-центров (Cloud.ru, Selectel, Timeweb):")
        print("  1. Задайте KETO_BOT_PROXY в файле .env.production:")
        print("     KETO_BOT_PROXY=http://proxy-user:password@proxy-host:port")
        print("  2. Перезапустите контейнеры: docker compose up -d")

    return results["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
