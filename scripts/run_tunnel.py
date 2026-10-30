# -*- coding: utf-8 -*-
"""
Устойчивый монитор Cloudflare Tunnel для Keto Balance Web App.
Автоматически перезапускает туннель при обрыве, сохраняет актуальный HTTPS URL
в current_tunnel_url.txt и в .env.
"""
import re
import subprocess
import time
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CLOUDFLARED_BIN = BASE_DIR / "tools" / "cloudflared.exe"
URL_FILE = BASE_DIR / "current_tunnel_url.txt"
ENV_FILE = BASE_DIR / ".env"

URL_REGEX = re.compile(r"https://[a-zA-Z0-9\-]+\.trycloudflare\.com")

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

def run_tunnel():
    if not CLOUDFLARED_BIN.exists():
        print(f"[TUNNEL ERROR] cloudflared.exe не найден по пути: {CLOUDFLARED_BIN}", flush=True)
        return

    target_port = os.getenv("PORT", "8000")
    cmd = [
        str(CLOUDFLARED_BIN),
        "tunnel",
        "--protocol", "http2",
        "--url", f"http://127.0.0.1:{target_port}",
        "--http-host-header", "localhost",
    ]
    env = os.environ.copy()
    env["NO_PROXY"] = "localhost,127.0.0.1,::1"

    while True:
        print("[TUNNEL] Запуск cloudflared tunnel...", flush=True)
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

        try:
            for line in iter(proc.stdout.readline, ""):
                line_str = line.strip()
                if line_str:
                    print(f"[CLOUDFLARED] {line_str}", flush=True)
                match = URL_REGEX.search(line_str)
                if match:
                    tunnel_url = match.group(0)
                    print(f"\n==========================================", flush=True)
                    print(f"🚀 ТУННЕЛЬ ГОТОВ: {tunnel_url}", flush=True)
                    print(f"==========================================\n", flush=True)
                    URL_FILE.write_text(tunnel_url, encoding="utf-8")
                    update_env(tunnel_url)
        except Exception as e:
            print(f"[TUNNEL EXCEPTION] {e}", flush=True)

        proc.wait()
        print("[TUNNEL] Процесс cloudflared завершился. Перезапуск через 3 сек...", flush=True)
        time.sleep(3)

if __name__ == "__main__":
    run_tunnel()
