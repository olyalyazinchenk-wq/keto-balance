# -*- coding: utf-8 -*-
"""
Устойчивый монитор Cloudflare Tunnel для Keto Balance Web App.
Создает quick tunnel, запускает cloudflared c токеном, сохраняет актуальный HTTPS URL
в current_tunnel_url.txt и в .env.
"""
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CLOUDFLARED_BIN = BASE_DIR / "tools" / "cloudflared.exe"
URL_FILE = BASE_DIR / "current_tunnel_url.txt"
ENV_FILE = BASE_DIR / ".env"

def update_env(new_url: str):
    if not ENV_FILE.exists():
        return
    try:
        content = ENV_FILE.read_text(encoding="utf-8")
        if "WEBAPP_URL=" in content:
            content = re.sub(r"WEBAPP_URL=.*", f"WEBAPP_URL={new_url}", content)
        else:
            content += f"\nWEBAPP_URL={new_url}\n"
        ENV_FILE.write_text(content, encoding="utf-8")
        print(f"[TUNNEL] .env обновлен: WEBAPP_URL={new_url}", flush=True)
    except Exception as e:
        print(f"[TUNNEL] Не удалось обновить .env: {e}", flush=True)

def request_quick_tunnel() -> tuple[str, str]:
    """Request a new quick tunnel from Cloudflare API and return (hostname, token)."""
    proxies = {}
    if os.getenv("HTTPS_PROXY"):
        proxies["https"] = os.getenv("HTTPS_PROXY")
    else:
        proxies["https"] = "http://127.0.0.1:10809"

    handler = urllib.request.ProxyHandler(proxies)
    opener = urllib.request.build_opener(handler)
    req = urllib.request.Request("https://api.trycloudflare.com/tunnel", data=b"", method="POST")
    req.add_header("User-Agent", "cloudflared/2026.10.4")

    with opener.open(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        res = data["result"]
        token_obj = {"a": res["account_tag"], "t": res["id"], "s": res["secret"]}
        token = base64.b64encode(json.dumps(token_obj).encode("utf-8")).decode("utf-8")
        return res["hostname"], token

def run_tunnel():
    if not CLOUDFLARED_BIN.exists():
        print(f"[TUNNEL ERROR] cloudflared.exe не найден по пути: {CLOUDFLARED_BIN}", flush=True)
        return

    target_port = os.getenv("PORT", "8000")

    while True:
        try:
            print("[TUNNEL] Запрос quick tunnel на trycloudflare.com...", flush=True)
            hostname, token = request_quick_tunnel()
            tunnel_url = f"https://{hostname}"
            print("\n==========================================", flush=True)
            print(f"🚀 ТУННЕЛЬ ГОТОВ: {tunnel_url}", flush=True)
            print("==========================================\n", flush=True)
            URL_FILE.write_text(tunnel_url, encoding="utf-8")
            update_env(tunnel_url)

            cmd = [
                str(CLOUDFLARED_BIN),
                "tunnel",
                "--region", "us",
                "--url", f"http://127.0.0.1:{target_port}",
                "--protocol", "http2",
                "run",
                "--token", token,
            ]
            env = os.environ.copy()
            for key in ("ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"):
                env.pop(key, None)

            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                env=env,
            )

            import threading
            stop_watchdog = threading.Event()
            def watchdog():
                time.sleep(15)
                zero_count = 0
                while not stop_watchdog.is_set() and proc.poll() is None:
                    try:
                        with urllib.request.urlopen("http://127.0.0.1:20241/ready", timeout=3) as r:
                            status_data = json.loads(r.read().decode())
                            if status_data.get("readyConnections", 0) == 0:
                                zero_count += 1
                            else:
                                zero_count = 0
                    except Exception:
                        zero_count += 1

                    if zero_count >= 2:
                        print("[TUNNEL WATCHDOG] Соединение потеряно. Перезапуск нового туннеля...", flush=True)
                        proc.terminate()
                        break
                    time.sleep(5)

            t = threading.Thread(target=watchdog, daemon=True)
            t.start()

            for line in iter(proc.stdout.readline, ""):
                line_str = line.strip()
                if line_str:
                    print(f"[CLOUDFLARED] {line_str}", flush=True)

            stop_watchdog.set()
            proc.wait()
            print("[TUNNEL] Процесс cloudflared завершился. Перезапуск через 3 сек...", flush=True)
        except Exception as e:
            print(f"[TUNNEL EXCEPTION] {e}. Перезапуск через 5 сек...", flush=True)

        time.sleep(3)

if __name__ == "__main__":
    run_tunnel()
