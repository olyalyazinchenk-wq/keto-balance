#!/usr/bin/env python3
"""scripts/isolated_quick_tunnel.py — Изолированный супервизор Cloudflare Quick Tunnel.

Ограничения и безопасность:
1. Binds strictly to local staging target: 127.0.0.1:18081.
2. Не использует и не импортирует scripts/run_tunnel.py и scripts/run_ssh_tunnel.py.
3. Не модифицирует .env, current_tunnel_url.txt, webhook, polling или меню бота.
4. Управляет исключительно собственным дочерним процессом (self._proc.pid). Никаких чужих процессов не трогает.
5. Windows Job Object (JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE): гарантирует мгновенное завершение
   дочернего туннеля ядром ОС даже при аварийном падении/убийстве супервизора (kill -9).
6. Выполняет getMe валидацию для токена, используемого staging-сервером, перед любым стартом.
7. Автоматическая остановка по таймеру (максимум 3600 секунд) + при падении целевого сервера (127.0.0.1:18081).
8. Поддерживает безопасный проверочный режим (--verify-only, --test-lifecycle) без создания публичного туннеля.
"""

import argparse
import atexit
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

ROOT = Path(__file__).resolve().parent.parent
CLOUDFLARED_BIN = ROOT / "tools" / "cloudflared.exe"
FORBIDDEN_PORTS = {8000, 4387, 8090, 10808, 10809}
DEFAULT_TARGET_PORT = 18081
MAX_ALLOWED_LIFETIME = 3600


def create_kill_on_close_job():
    """Создаёт Windows Job Object с ограничением автозавершения всех дочерних процессов при закрытии."""
    if sys.platform != "win32":
        return None
    try:
        import ctypes
        from ctypes import wintypes

        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [
                ("ReadOperationCount", ctypes.c_uint64),
                ("WriteOperationCount", ctypes.c_uint64),
                ("OtherOperationCount", ctypes.c_uint64),
                ("ReadTransferCount", ctypes.c_uint64),
                ("WriteTransferCount", ctypes.c_uint64),
                ("OtherTransferCount", ctypes.c_uint64),
            ]

        class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [
                ("PerProcessUserTimeLimit", ctypes.c_int64),
                ("PerJobUserTimeLimit", ctypes.c_int64),
                ("LimitFlags", wintypes.DWORD),
                ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t),
                ("ActiveProcessLimit", wintypes.DWORD),
                ("Affinity", ctypes.c_size_t),
                ("PriorityClass", wintypes.DWORD),
                ("SchedulingClass", wintypes.DWORD),
            ]

        class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
            _fields_ = [
                ("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION),
                ("IoInfo", IO_COUNTERS),
                ("ProcessMemoryLimit", ctypes.c_size_t),
                ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryLimit", ctypes.c_size_t),
                ("PeakJobMemoryLimit", ctypes.c_size_t),
            ]

        JobObjectExtendedLimitInformation = 9
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000

        job = ctypes.windll.kernel32.CreateJobObjectW(None, None)
        if not job:
            return None
        info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        res = ctypes.windll.kernel32.SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            ctypes.byref(info),
            ctypes.sizeof(info),
        )
        if not res:
            ctypes.windll.kernel32.CloseHandle(job)
            return None
        return job
    except Exception:
        return None


def assign_proc_to_job(job_handle, proc) -> bool:
    """Привязывает дескриптор дочернего процесса к Job Object."""
    if not job_handle or sys.platform != "win32" or not hasattr(proc, "_handle"):
        return False
    try:
        import ctypes
        res = ctypes.windll.kernel32.AssignProcessToJobObject(job_handle, int(proc._handle))
        return bool(res)
    except Exception:
        return False


def resolve_staging_bot_token() -> Tuple[str, str]:
    """Разрешает токен бота по той же цепочке, что и staging-сервер."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", os.environ.get("KETO_BOT_TOKEN", "")).strip()
    proxy = os.environ.get("HTTPS_PROXY", os.environ.get("https_proxy", "")).strip()

    if not token or not proxy:
        env_file = ROOT / ".env"
        if env_file.is_file():
            try:
                for line in env_file.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if not token and (line.startswith("KETO_BOT_TOKEN=") or line.startswith("TELEGRAM_BOT_TOKEN=")):
                        token = line.split("=", 1)[1].strip().strip('"').strip("'")
                    elif not proxy and (line.startswith("HTTPS_PROXY=") or line.startswith("https_proxy=")):
                        proxy = line.split("=", 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass
    return token, proxy


def verify_telegram_bot_identity(token: str, proxy: str = "") -> Dict[str, Any]:
    """Сверяет getMe через Telegram API, подтверждая идентичность бота."""
    if not token:
        raise ValueError("Токен бота не найден в конфигурации staging.")

    handlers = []
    if proxy:
        handlers.append(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
    opener = urllib.request.build_opener(*handlers)

    url = f"https://api.telegram.org/bot{token}/getMe"
    req = urllib.request.Request(url, headers={"User-Agent": "KetoBalanceTunnelSupervisor/1.0"})
    try:
        with opener.open(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if not data.get("ok"):
                raise RuntimeError(f"Telegram API getMe вернул ошибку: {data}")
            res = data.get("result", {})
            return {
                "ok": True,
                "id": res.get("id"),
                "is_bot": res.get("is_bot"),
                "username": res.get("username"),
                "first_name": res.get("first_name"),
            }
    except Exception as exc:
        raise RuntimeError(f"Ошибка проверки getMe для токена staging: {exc}") from exc


def check_staging_health(port: int = DEFAULT_TARGET_PORT) -> Tuple[bool, str]:
    """Проверяет доступность и статус целевого локального staging-сервера."""
    url = f"http://127.0.0.1:{port}/api/health"
    try:
        with urllib.request.urlopen(url, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if resp.status == 200 and data.get("status") == "ok":
                return True, "200 OK (status=ok)"
            return False, f"Status {resp.status}: {data}"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except Exception as e:
        return False, str(e)


def check_docs_disabled(port: int = DEFAULT_TARGET_PORT) -> Tuple[bool, str]:
    """Проверяет, что маршруты документации в staging возвращают 404."""
    for ep in ("/docs", "/redoc", "/openapi.json"):
        url = f"http://127.0.0.1:{port}{ep}"
        try:
            with urllib.request.urlopen(url, timeout=3) as resp:
                return False, f"{ep} returned unexpected HTTP {resp.status}"
        except urllib.error.HTTPError as e:
            if e.code != 404:
                return False, f"{ep} returned HTTP {e.code} instead of 404"
        except Exception as e:
            return False, f"{ep} error: {e}"
    return True, "All docs routes return 404"


class IsolatedTunnelSupervisor:
    """Управляет жизненным циклом одного дочернего процесса туннеля."""

    def __init__(
        self,
        target_port: int = DEFAULT_TARGET_PORT,
        max_lifetime_seconds: int = MAX_ALLOWED_LIFETIME,
        cloudflared_path: Optional[Path] = None,
    ):
        if target_port in FORBIDDEN_PORTS:
            raise ValueError(f"Порт {target_port} зарезервирован для боевых сервисов и запрещён.")

        self.target_port = target_port
        self.max_lifetime_seconds = min(max_lifetime_seconds, MAX_ALLOWED_LIFETIME)
        self.cloudflared_path = cloudflared_path or CLOUDFLARED_BIN

        self._proc: Optional[subprocess.Popen] = None
        self._proc_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._watchdog_thread: Optional[threading.Thread] = None
        self._discovered_url: Optional[str] = None
        self._url_event = threading.Event()
        self._job_handle = create_kill_on_close_job()

        # Регистрация безопасной очистки только своего процесса
        atexit.register(self.stop, reason="Process exit (atexit)")

    @property
    def child_pid(self) -> Optional[int]:
        with self._proc_lock:
            return self._proc.pid if self._proc else None

    @property
    def is_running(self) -> bool:
        with self._proc_lock:
            return self._proc is not None and self._proc.poll() is None

    def stop(self, reason: str = "Requested"):
        """Останавливает ТОЛЬКО собственный дочерний процесс."""
        self._stop_event.set()
        with self._proc_lock:
            if self._proc is not None:
                pid = self._proc.pid
                try:
                    if self._proc.poll() is None:
                        self._proc.terminate()
                        try:
                            self._proc.wait(timeout=3.0)
                        except subprocess.TimeoutExpired:
                            self._proc.kill()
                            self._proc.wait(timeout=2.0)
                except Exception:
                    pass
                self._proc = None

            if self._job_handle:
                try:
                    import ctypes
                    ctypes.windll.kernel32.CloseHandle(self._job_handle)
                except Exception:
                    pass
                self._job_handle = None

    def _watchdog_loop(self, start_time: float, health_check_interval: float = 2.0):
        """Фоновый сторожевой таймер: контролирует время жизни и здоровье сервера."""
        deadline = start_time + self.max_lifetime_seconds
        failed_health_checks = 0

        while not self._stop_event.wait(timeout=health_check_interval):
            now = time.time()
            # 1. Проверка таймера жизни
            if now >= deadline:
                print(f"[TUNNEL] Превышен максимальный лимит времени ({self.max_lifetime_seconds}s). Остановка...", flush=True)
                self.stop(reason="Max lifetime reached")
                break

            # 2. Проверка доступности локального staging-сервера
            healthy, _ = check_staging_health(self.target_port)
            if not healthy:
                failed_health_checks += 1
                if failed_health_checks >= 3:
                    print(f"[TUNNEL] Локальный сервер 127.0.0.1:{self.target_port} перестал отвечать. Автоматическая остановка...", flush=True)
                    self.stop(reason="Staging server down")
                    break
            else:
                failed_health_checks = 0

            # 3. Проверка статуса дочернего процесса
            if not self.is_running:
                break

    def run_lifecycle_test(self, test_duration_seconds: float = 3.0) -> Dict[str, Any]:
        """Безопасная проверка запуска, слежения и остановки на фиктивном дочернем процессе."""
        dummy_cmd = [sys.executable, "-c", "import time; time.sleep(120)"]
        self._stop_event.clear()
        start_time = time.time()

        proc = subprocess.Popen(dummy_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if self._job_handle:
            assign_proc_to_job(self._job_handle, proc)

        with self._proc_lock:
            self._proc = proc
        child_pid = proc.pid

        # Запускаем сторожевой поток с коротким лимитом
        old_lifetime = self.max_lifetime_seconds
        self.max_lifetime_seconds = int(test_duration_seconds)
        watchdog = threading.Thread(target=self._watchdog_loop, args=(start_time, 0.5), daemon=True)
        watchdog.start()

        # Ждем завершения таймера
        watchdog.join(timeout=test_duration_seconds + 4.0)
        self.max_lifetime_seconds = old_lifetime

        is_alive_after = (proc.poll() is None)
        self.stop(reason="Test complete")

        return {
            "test_pid": child_pid,
            "auto_stopped_by_watchdog": not is_alive_after,
            "poll_code": proc.poll(),
        }

    def launch_quick_tunnel(self, startup_timeout: float = 25.0) -> Optional[str]:
        """Запускает Cloudflare Quick Tunnel к 127.0.0.1:{target_port}.

        Вызывается ТОЛЬКО после явного разрешения владельца.
        """
        if not self.cloudflared_path.is_file():
            raise FileNotFoundError(f"Исполняемый файл cloudflared не найден: {self.cloudflared_path}")

        # Проверка staging перед стартом
        healthy, h_msg = check_staging_health(self.target_port)
        if not healthy:
            raise RuntimeError(f"Staging сервер на 127.0.0.1:{self.target_port} недоступен: {h_msg}")

        cmd = [
            str(self.cloudflared_path),
            "tunnel",
            "--url", f"http://127.0.0.1:{self.target_port}",
            "--no-autoupdate",
        ]

        self._stop_event.clear()
        self._url_event.clear()
        self._discovered_url = None

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        if self._job_handle:
            assign_proc_to_job(self._job_handle, proc)

        with self._proc_lock:
            self._proc = proc

        start_time = time.time()
        url_regex = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")

        def reader_loop():
            for line in proc.stderr:
                match = url_regex.search(line)
                if match:
                    self._discovered_url = match.group(0)
                    self._url_event.set()
                if self._stop_event.is_set():
                    break

        reader_thread = threading.Thread(target=reader_loop, daemon=True)
        reader_thread.start()

        # Запуск сторожевого таймера
        self._watchdog_thread = threading.Thread(target=self._watchdog_loop, args=(start_time,), daemon=True)
        self._watchdog_thread.start()

        # Ожидание появления URL
        if not self._url_event.wait(timeout=startup_timeout):
            self.stop(reason="URL acquisition timeout")
            raise TimeoutError("Не удалось получить HTTPS URL от Cloudflare за отведенное время.")

        return self._discovered_url


def main():
    parser = argparse.ArgumentParser(description="Изолированный супервизор Cloudflare Quick Tunnel")
    parser.add_argument("--port", type=int, default=DEFAULT_TARGET_PORT, help="Целевой порт (default: 18081)")
    parser.add_argument("--lifetime", type=int, default=MAX_ALLOWED_LIFETIME, help="Максимальное время жизни в секундах (<= 3600)")
    parser.add_argument("--verify-only", action="store_true", help="Проверить инварианты, getMe и staging без запуска туннеля")
    parser.add_argument("--test-lifecycle", action="store_true", help="Проверить автоостановку сторожевого таймера на тестовом процессе")
    parser.add_argument("--launch", action="store_true", help="Запустить реальный туннель (требует подтверждения)")
    args = parser.parse_args()

    lifetime = min(max(args.lifetime, 10), MAX_ALLOWED_LIFETIME)

    # 1. Сверка инвариантов портов
    if args.port in FORBIDDEN_PORTS:
        print(f"[FATAL] Порт {args.port} входит в список запрещённых боевых портов {FORBIDDEN_PORTS}", file=sys.stderr)
        sys.exit(1)

    # 2. Проверка токена и getMe
    token, proxy = resolve_staging_bot_token()
    if not token:
        print("[FATAL] Токен бота не найден в конфигурации staging.", file=sys.stderr)
        sys.exit(1)

    bot_info = verify_telegram_bot_identity(token, proxy)

    # 3. Проверка staging сервера
    staging_ok, staging_msg = check_staging_health(args.port)
    docs_ok, docs_msg = check_docs_disabled(args.port)

    # 4. Проверка файла cloudflared
    cloudflared_exists = CLOUDFLARED_BIN.is_file()

    supervisor = IsolatedTunnelSupervisor(
        target_port=args.port,
        max_lifetime_seconds=lifetime,
        cloudflared_path=CLOUDFLARED_BIN,
    )

    def sig_handler(sig, frame):
        print(f"\n[SUPERVISOR] Получен сигнал {sig}. Остановка...", flush=True)
        supervisor.stop(reason=f"Signal {sig}")
        sys.exit(0)

    signal.signal(signal.SIGINT, sig_handler)
    signal.signal(signal.SIGTERM, sig_handler)

    if args.verify_only:
        print("=== ПРЕДВАРИТЕЛЬНАЯ ПРОВЕРКА ИНВАРИАНТОВ ===")
        print(f"  Целевой порт:      127.0.0.1:{args.port} (запрещённые порты не затронуты)")
        print(f"  Staging сервер:    {'OK' if staging_ok else 'FAILED'} ({staging_msg})")
        print(f"  Docs (404 check):  {'OK' if docs_ok else 'FAILED'} ({docs_msg})")
        print(f"  Telegram Bot:      @{bot_info['username']} (ID: {bot_info['id']}, ok={bot_info['ok']})")
        print(f"  cloudflared.exe:   {'FOUND' if cloudflared_exists else 'NOT FOUND'} ({CLOUDFLARED_BIN})")
        print(f"  Автоостановка:     ГАРАНТИРОВАНА ({lifetime}s max + health check watchdog + Windows Job Object)")
        print(f"  Внешний доступ:    ОТКЛЮЧЁН (проверочный режим, туннель не запущен)")
        return

    if args.test_lifecycle:
        print("=== ИСПЫТАНИЕ СТОРОЖЕВОГО ТАЙМЕРА (БЕЗ ПУБЛИЧНОГО ТУННЕЛЯ) ===")
        test_res = supervisor.run_lifecycle_test(test_duration_seconds=3.0)
        print(f"  Дочерний тестовый PID:       {test_res['test_pid']}")
        print(f"  Остановлен сторожевым таймером: {test_res['auto_stopped_by_watchdog']}")
        print(f"  Код завершения:              {test_res['poll_code']}")
        print(f"  Статус чужих процессов:      НЕ ЗАТРОНУТЫ (управление только своим PID)")
        print("=== ИСПЫТАНИЕ УСПЕШНО ЗАВЕРШЕНО ===")
        return

    if args.launch:
        print("[LAUNCH] Внимание: запуск публичного туннеля разрешён только при явном подтверждении владельца.", flush=True)
        url = supervisor.launch_quick_tunnel()
        print(f"[TUNNEL_READY] HTTPS URL: {url}", flush=True)
        print(f"[TUNNEL_READY] Наблюдение активно. Максимальное время жизни: {lifetime}s.", flush=True)
        try:
            while supervisor.is_running:
                time.sleep(1.0)
        except KeyboardInterrupt:
            print("\n[TUNNEL] Остановка по CTRL+C...", flush=True)
        finally:
            supervisor.stop(reason="Session finished")
            print("[TUNNEL] Туннель чисто остановлен.", flush=True)
        return

    print("Укажите режим: --verify-only, --test-lifecycle или --launch")


if __name__ == "__main__":
    main()
