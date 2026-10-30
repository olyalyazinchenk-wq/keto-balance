# -*- coding: utf-8 -*-
"""
Устойчивый монитор Cloudflare Tunnel для Keto Balance Web App.
Создает quick tunnel, запускает cloudflared c токеном, сохраняет актуальный HTTPS URL
в current_tunnel_url.txt и в .env.
Включает single-instance lock и очистку от дубликатов процессов.
"""
import atexit
import base64
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CLOUDFLARED_BIN = BASE_DIR / "tools" / "cloudflared.exe"
URL_FILE = BASE_DIR / "current_tunnel_url.txt"
ENV_FILE = BASE_DIR / ".env"
LOCK_FILE = BASE_DIR / "run_tunnel.lock"
CACHE_FILE = BASE_DIR / ".tunnel_cache.json"

_lock_handle = None

def acquire_single_instance_lock():
    global _lock_handle
    if os.name == "nt":
        import msvcrt
        try:
            f = open(LOCK_FILE, "a+b")
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            f.seek(0)
            f.truncate()
            f.write(str(os.getpid()).encode())
            f.flush()
            _lock_handle = f
            return True
        except (IOError, OSError):
            print(f"[TUNNEL] Другой экземпляр run_tunnel.py уже запущен. Завершение работы.", flush=True)
            sys.exit(0)
    else:
        import fcntl
        try:
            f = open(LOCK_FILE, "a+")
            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            f.seek(0)
            f.truncate()
            f.write(str(os.getpid()))
            f.flush()
            _lock_handle = f
            return True
        except (IOError, OSError):
            print(f"[TUNNEL] Другой экземпляр run_tunnel.py уже запущен. Завершение работы.", flush=True)
            sys.exit(0)

def release_lock():
    global _lock_handle
    if _lock_handle:
        try:
            if os.name == "nt":
                import msvcrt
                _lock_handle.seek(0)
                msvcrt.locking(_lock_handle.fileno(), msvcrt.LK_UNLCK, 1)
            _lock_handle.close()
            LOCK_FILE.unlink(missing_ok=True)
        except Exception:
            pass

atexit.register(release_lock)

def cleanup_orphaned_cloudflared():
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/IM", "cloudflared.exe"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            subprocess.run(["pkill", "-9", "cloudflared"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

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
    """Request a new quick tunnel from Cloudflare API and return (hostname, token).
    If Cloudflare responds with HTTP 429 (rate limit), automatically reuses cached credentials.
    """
    proxies = {}
    if os.getenv("HTTPS_PROXY"):
        proxies["https"] = os.getenv("HTTPS_PROXY")
    else:
        proxies["https"] = "http://127.0.0.1:10809"

    handler = urllib.request.ProxyHandler(proxies)
    opener = urllib.request.build_opener(handler)
    req = urllib.request.Request("https://api.trycloudflare.com/tunnel", data=b"", method="POST")
    req.add_header("User-Agent", "cloudflared/2026.10.4")

    try:
        with opener.open(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            res = data["result"]
            token_obj = {"a": res["account_tag"], "t": res["id"], "s": res["secret"]}
            token = base64.b64encode(json.dumps(token_obj).encode("utf-8")).decode("utf-8")
            hostname = res["hostname"]
            try:
                CACHE_FILE.write_text(json.dumps({"hostname": hostname, "token": token}), encoding="utf-8")
            except Exception:
                pass
            return hostname, token
    except urllib.error.HTTPError as e:
        if e.code == 429 and CACHE_FILE.exists():
            print("[TUNNEL] Cloudflare API вернул 429 (Too Many Requests). Повторно используем кэшированные credentials...", flush=True)
            cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            return cache["hostname"], cache["token"]
        raise
    except Exception:
        if CACHE_FILE.exists():
            print("[TUNNEL] Ошибка сети при запросе quick tunnel. Повторно используем кэшированные credentials...", flush=True)
            cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            return cache["hostname"], cache["token"]
        raise

def run_tunnel():
    acquire_single_instance_lock()
    cleanup_orphaned_cloudflared()

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
                "--no-prechecks",
                "--protocol", "http2",
                "--metrics", "127.0.0.1:20241",
                "run",
                "--url", f"http://127.0.0.1:{target_port}",
                "--token", token,
            ]
            env = os.environ.copy()
            env["HTTPS_PROXY"] = "http://127.0.0.1:10809"
            env["https_proxy"] = "http://127.0.0.1:10809"
            env["NO_PROXY"] = "127.0.0.1,localhost,::1"
            env["no_proxy"] = "127.0.0.1,localhost,::1"
            env.pop("HTTP_PROXY", None)
            env.pop("http_proxy", None)
            env.pop("ALL_PROXY", None)
            env.pop("all_proxy", None)

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

            stop_watchdog = threading.Event()
            def watchdog():
                time.sleep(30)
                zero_count = 0
                while not stop_watchdog.is_set() and proc.poll() is None:
                    is_ready = False
                    for metrics_port in (20241, 20242, 20243):
                        try:
                            req_no_proxy = urllib.request.Request(f"http://127.0.0.1:{metrics_port}/ready")
                            opener_local = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                            with opener_local.open(req_no_proxy, timeout=3) as r:
                                status_data = json.loads(r.read().decode())
                                if status_data.get("readyConnections", 0) > 0:
                                    is_ready = True
                                    break
                        except Exception:
                            pass

                    if is_ready:
                        zero_count = 0
                    else:
                        zero_count += 1

                    if zero_count >= 12:
                        print("[TUNNEL WATCHDOG] Соединение потеряно (readyConnections=0 в течение 60с). Перезапуск нового туннеля...", flush=True)
                        proc.terminate()
                        break
                    time.sleep(5)

            t_watchdog = threading.Thread(target=watchdog, daemon=True)
            t_watchdog.start()

            for line in iter(proc.stdout.readline, ""):
                line_str = line.strip()
                if line_str:
                    print(f"[CLOUDFLARED] {line_str}", flush=True)

            stop_watchdog.set()
            proc.wait()
            print("[TUNNEL] Процесс cloudflared завершился. Перезапуск через 3 сек...", flush=True)
        except Exception as e:
            print(f"[TUNNEL EXCEPTION] {e}. Перезапуск через 5 сек...", flush=True)

        cleanup_orphaned_cloudflared()
        time.sleep(3)

if __name__ == "__main__":
    run_tunnel()
