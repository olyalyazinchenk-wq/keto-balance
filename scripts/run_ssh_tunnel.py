#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/run_ssh_tunnel.py — Устойчивый SSH-туннель для домашнего ПК с автоподдержанием активности (keepalive).
- Автоматически перезапускается при сетевых сбоях.
- Отправляет фоновый keepalive-запрос каждые 60 секунд, предотвращая сброс по неактивности.
- Мгновенно обновляет current_tunnel_url.txt, .env и кнопку меню в Telegram (@keto_balance_userbot).
- Гарантирует единственный экземпляр через файловую блокировку.
"""
import atexit
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BASE_DIR = Path(__file__).resolve().parent.parent
URL_FILE = BASE_DIR / "current_tunnel_url.txt"
ENV_FILE = BASE_DIR / ".env"
LOCK_FILE = BASE_DIR / "run_ssh_tunnel.lock"
SSH_STATE_FILE = BASE_DIR / ".tunnel_ssh_state.json"

_lock_handle = None
_current_ssh_proc = None

def get_process_times(pid: int):
    if os.name == "nt":
        import ctypes
        import ctypes.wintypes
        h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
        if not h:
            return None
        try:
            ct = ctypes.wintypes.FILETIME()
            et = ctypes.wintypes.FILETIME()
            kt = ctypes.wintypes.FILETIME()
            ut = ctypes.wintypes.FILETIME()
            if ctypes.windll.kernel32.GetProcessTimes(h, ctypes.byref(ct), ctypes.byref(et), ctypes.byref(kt), ctypes.byref(ut)):
                return (ct.dwHighDateTime << 32) + ct.dwLowDateTime
        finally:
            ctypes.windll.kernel32.CloseHandle(h)
    return None

def record_ssh_state(pid: int, port: int):
    try:
        data = {
            "pid": pid,
            "port": port,
            "create_time": get_process_times(pid),
            "started_at": time.time(),
        }
        SSH_STATE_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception:
        pass

def clear_ssh_state():
    try:
        SSH_STATE_FILE.unlink(missing_ok=True)
    except Exception:
        pass

def acquire_lock():
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
            print("[TUNNEL] Другой экземпляр run_ssh_tunnel.py уже запущен. Завершение.", flush=True)
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
            print("[TUNNEL] Другой экземпляр run_ssh_tunnel.py уже запущен. Завершение.", flush=True)
            sys.exit(0)

def release_lock():
    global _lock_handle, _current_ssh_proc
    if _current_ssh_proc:
        try:
            _current_ssh_proc.terminate()
        except Exception:
            pass
        _current_ssh_proc = None
    clear_ssh_state()
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

def get_bot_token() -> str:
    token = os.environ.get("KETO_BOT_TOKEN") or os.environ.get("TELEGRAM_BOT_TOKEN")
    if token:
        return token.strip()
    if not ENV_FILE.exists():
        return ""
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("KETO_BOT_TOKEN="):
            return line.split("=", 1)[1].strip("\"' ")
    return ""

def update_telegram_menu_button(url: str, chat_id: int = 1084557944):
    token = get_bot_token()
    if not token:
        print("[TUNNEL] Токен KETO_BOT_TOKEN не найден, пропуск обновления кнопки меню.", flush=True)
        return
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({"https": "http://127.0.0.1:10809"}))
        payload = json.dumps({
            "chat_id": chat_id,
            "menu_button": {
                "type": "web_app",
                "text": "🥑 Открыть Кето Баланс",
                "web_app": {"url": url}
            }
        }).encode("utf-8")
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/setChatMenuButton",
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        with opener.open(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            if data.get("ok"):
                print(f"[TUNNEL] Кнопка меню в Telegram успешно обновлена для chat_id={chat_id}: {url}", flush=True)
            else:
                print(f"[TUNNEL WARNING] setChatMenuButton вернул: {data}", flush=True)
    except Exception as e:
        print(f"[TUNNEL WARNING] Не удалось обновить кнопку меню в Telegram: {type(e).__name__}", flush=True)

def update_env_url(url: str):
    if not ENV_FILE.exists():
        return
    try:
        content = ENV_FILE.read_text(encoding="utf-8")
        if "WEBAPP_URL=" in content:
            content = re.sub(r"WEBAPP_URL=.*", f"WEBAPP_URL={url}", content)
        else:
            content += f"\nWEBAPP_URL={url}\n"
        ENV_FILE.write_text(content, encoding="utf-8")
        URL_FILE.write_text(url, encoding="utf-8")
        print(f"[TUNNEL] Сохранен актуальный URL: {url}", flush=True)
    except Exception as e:
        print(f"[TUNNEL ERROR] Ошибка записи URL в .env: {e}", flush=True)

def keepalive_worker(stop_event: threading.Event, url: str):
    """Каждые 60 секунд опрашивает туннель, исключая тайм-аут по неактивности."""
    ping_url = f"{url}/api/version"
    while not stop_event.is_set():
        time.sleep(45)
        if stop_event.is_set():
            break
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            req = urllib.request.Request(ping_url, headers={"User-Agent": "KetoKeepalive/1.0"})
            with opener.open(req, timeout=10) as r:
                if r.status == 200:
                    pass
        except Exception:
            try:
                # Fallback через прокси
                opener_p = urllib.request.build_opener(urllib.request.ProxyHandler({"https": "http://127.0.0.1:10809"}))
                req_p = urllib.request.Request(ping_url, headers={"User-Agent": "KetoKeepalive/1.0"})
                with opener_p.open(req_p, timeout=10) as r:
                    pass
            except Exception:
                pass

def run(port: int = 18081, chat_id: int = 1084557944):
    acquire_lock()
    print(f"=== Устойчивый SSH-туннель Keto Balance запущен (порт {port}) ===", flush=True)
    
    cmd = [
        "ssh.exe",
        "-o", "StrictHostKeyChecking=yes",
        "-o", "ServerAliveInterval=15",
        "-o", "ServerAliveCountMax=4",
        "-o", "ExitOnForwardFailure=yes",
        "-R", f"80:127.0.0.1:{port}",
        "nokey@localhost.run"
    ]

    backoff = 1.0
    while True:
        print("[TUNNEL] Запуск сессии ssh к localhost.run...", flush=True)
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1
            )
            global _current_ssh_proc
            _current_ssh_proc = proc
            record_ssh_state(proc.pid, port)
        except Exception as e:
            print(f"[TUNNEL ERROR] Не удалось запустить ssh.exe: {type(e).__name__}", flush=True)
            time.sleep(backoff)
            backoff = min(backoff * 2.0, 60.0)
            continue

        active_url = None
        stop_keepalive = threading.Event()
        keepalive_thread = None

        try:
            for line in iter(proc.stdout.readline, ""):
                line_str = line.strip()
                if not line_str:
                    continue
                
                # Поиск ссылки на lhr.life
                m = re.search(r"(https://[a-zA-Z0-9\-]+\.lhr\.life)", line_str)
                if m:
                    new_url = m.group(1)
                    if new_url != active_url:
                        active_url = new_url
                        backoff = 1.0  # Reset backoff on successful connection
                        print(f"\n==========================================", flush=True)
                        print(f"[TUNNEL CONNECTED] {active_url}", flush=True)
                        print(f"==========================================\n", flush=True)
                        update_env_url(active_url)
                        update_telegram_menu_button(active_url, chat_id=chat_id)
                        
                        if keepalive_thread and keepalive_thread.is_alive():
                            stop_keepalive.set()
                            keepalive_thread.join(timeout=2)
                        
                        stop_keepalive = threading.Event()
                        keepalive_thread = threading.Thread(target=keepalive_worker, args=(stop_keepalive, active_url), daemon=True)
                        keepalive_thread.start()

                if "disconnect" in line_str.lower() or "error" in line_str.lower():
                    print(f"[TUNNEL SSH] {line_str}", flush=True)

            proc.wait()
            print(f"[TUNNEL] Сессия ssh завершилась (код {proc.returncode}). Перезапуск через {backoff:.1f} сек...", flush=True)
        except Exception as e:
            print(f"[TUNNEL EXCEPTION] {type(e).__name__}", flush=True)
        finally:
            stop_keepalive.set()
            try:
                proc.terminate()
            except Exception:
                pass
            clear_ssh_state()
            _current_ssh_proc = None
            time.sleep(backoff)
            backoff = min(backoff * 2.0, 60.0)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="SSH Tunnel for Keto Balance")
    parser.add_argument("--port", type=int, default=18081, help="Port to forward (default: 18081)")
    parser.add_argument("--chat-id", type=int, default=1084557944, help="Target Telegram chat ID for menu button (default: 1084557944)")
    args = parser.parse_args()
    run(port=args.port, chat_id=args.chat_id)
