import json
import os
import signal
import subprocess
import sys
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from scripts.isolated_quick_tunnel import (
    IsolatedTunnelSupervisor,
    FORBIDDEN_PORTS,
    DEFAULT_TARGET_PORT,
    EXPECTED_BOT_ID,
    EXPECTED_BOT_USERNAME,
    create_kill_on_close_job,
    assign_proc_to_job,
    close_job_handle,
    verify_telegram_bot_identity,
    resolve_staging_bot_token,
)


class TestIsolatedQuickTunnel(unittest.TestCase):
    """Тесты жизненного цикла, автоостановки и изоляции Cloudflare Quick Tunnel."""

    def test_forbidden_ports_strictly_rejected(self):
        """Запрещённые боевые порты вызывают исключение и не могут быть целью туннеля."""
        for port in FORBIDDEN_PORTS:
            with self.assertRaises(ValueError, msg=f"Порт {port} должен быть отклонён"):
                IsolatedTunnelSupervisor(target_port=port)

    def test_lifetime_clamped_to_max_3600(self):
        """Время жизни принудительно ограничивается 3600 секундами."""
        s = IsolatedTunnelSupervisor(target_port=18081, max_lifetime_seconds=7200)
        self.assertLessEqual(s.max_lifetime_seconds, 3600)

    def test_supervisor_auto_stops_by_lifetime_timer(self):
        """Супервизор автоматически останавливает дочерний процесс по истечении таймера."""
        s = IsolatedTunnelSupervisor(target_port=18081, max_lifetime_seconds=2)
        res = s.run_lifecycle_test(test_duration_seconds=2.0)
        self.assertTrue(res["auto_stopped_by_watchdog"], "Дочерний процесс должен быть остановлен сторожевым таймером")
        self.assertFalse(s.is_running, "Супервизор должен находиться в остановленном состоянии")
        self.assertIsNone(s.child_pid, "child_pid должен быть очищен после остановки")

    def test_supervisor_auto_stops_when_staging_server_unreachable(self):
        """Супервизор останавливает туннель, если локальный staging-сервер не отвечает."""
        DEAD_PORT = 19999
        s = IsolatedTunnelSupervisor(target_port=DEAD_PORT, max_lifetime_seconds=60)

        # Запускаем фиктивный дочерний процесс
        dummy_cmd = [sys.executable, "-c", "import time; time.sleep(60)"]
        proc = subprocess.Popen(dummy_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if s._job_handle:
            assign_proc_to_job(s._job_handle, proc)

        with s._proc_lock:
            s._proc = proc

        start_time = time.time()
        # Быстрый опрос раз в 0.1 секунды в фоновом потоке с фиксацией недоступности сервера
        with patch("scripts.isolated_quick_tunnel.check_staging_health", return_value=(False, "Connection refused")):
            watchdog = threading.Thread(target=s._watchdog_loop, args=(start_time, 0.1), daemon=True)
            watchdog.start()

            # Ждем автоматической остановки (до 3 секунд)
            for _ in range(50):
                if not s.is_running:
                    break
                time.sleep(0.05)

        # Сервер не отвечает -> 3 проверки не пройдены -> автоостановка
        self.assertFalse(s.is_running, "Супервизор должен завершить процесс при недоступности сервера")
        self.assertIsNotNone(proc.poll(), "Дочерний процесс должен быть завершён")
        s.stop()

    def test_manual_stop_terminates_only_child_process(self):
        """Ручной вызов stop() чисто останавливает только свой дочерний процесс."""
        s = IsolatedTunnelSupervisor(target_port=18081, max_lifetime_seconds=60)
        dummy_cmd = [sys.executable, "-c", "import time; time.sleep(60)"]
        proc = subprocess.Popen(dummy_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if s._job_handle:
            assign_proc_to_job(s._job_handle, proc)

        with s._proc_lock:
            s._proc = proc

        self.assertTrue(s.is_running)
        s.stop(reason="Manual test stop")
        self.assertFalse(s.is_running)
        self.assertIsNotNone(proc.poll(), "Дочерний процесс должен получить код завершения")
        self.assertIsNone(s.child_pid)

    def test_windows_job_object_crash_resilience(self):
        """На Windows: при закрытии Job Object ядро ОС мгновенно уничтожает дочерний процесс. На non-Windows: безопасный no-op."""
        if sys.platform != "win32":
            job = create_kill_on_close_job()
            self.assertIsNone(job, "На non-Windows job должен возвращать None")
            self.assertFalse(assign_proc_to_job(None, None))
            return

        import ctypes
        job = create_kill_on_close_job()
        self.assertIsNotNone(job, "Windows Job Object должен успешно создаваться")

        proc = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        assigned = assign_proc_to_job(job, proc)
        self.assertTrue(assigned, "Дочерний процесс должен быть успешно привязан к Job Object")

        # Имитируем аварийное закрытие супервизора (закрытие дескриптора)
        ctypes.windll.kernel32.CloseHandle(job)
        time.sleep(0.5)

        # Проверяем, что ОС убила дочерний процесс
        self.assertIsNotNone(proc.poll(), "Дочерний процесс должен быть завершён ядром ОС после закрытия Job")

    def test_token_resolution_and_getme_fail_closed(self):
        """При пустом токене проверка getMe строго выбрасывает ошибку (fail-closed)."""
        with self.assertRaises(ValueError):
            verify_telegram_bot_identity(token="", proxy="")

    def test_env_files_not_modified_by_supervisor(self):
        """Супервизор ни при каких условиях не модифицирует .env или current_tunnel_url.txt."""
        env_file = ROOT / ".env"
        url_file = ROOT / "current_tunnel_url.txt"

        mtime_env = env_file.stat().st_mtime if env_file.exists() else None
        mtime_url = url_file.stat().st_mtime if url_file.exists() else None

        s = IsolatedTunnelSupervisor(target_port=18081, max_lifetime_seconds=5)
        s.run_lifecycle_test(test_duration_seconds=1.0)

        if env_file.exists():
            self.assertEqual(env_file.stat().st_mtime, mtime_env, ".env не должен изменяться")
        if url_file.exists():
            self.assertEqual(url_file.stat().st_mtime, mtime_url, "current_tunnel_url.txt не должен изменяться")

    def test_job_object_creation_failure_aborts_supervisor(self):
        """Невозможность создать Job Object на Windows строго прерывает инициализацию супервизора."""
        with patch("scripts.isolated_quick_tunnel.create_kill_on_close_job", return_value=None):
            with patch("scripts.isolated_quick_tunnel.sys.platform", "win32"):
                with self.assertRaises(RuntimeError) as ctx:
                    IsolatedTunnelSupervisor(target_port=18081)
                self.assertIn("Job Object", str(ctx.exception))

    def test_job_object_assignment_failure_terminates_child_process(self):
        """Невозможность подключить дочерний процесс к Job Object немедленно убивает созданный дочерний процесс."""
        s = IsolatedTunnelSupervisor(target_port=18081, max_lifetime_seconds=5)
        with patch("scripts.isolated_quick_tunnel.assign_proc_to_job", return_value=False):
            with patch("scripts.isolated_quick_tunnel.sys.platform", "win32"):
                with self.assertRaises(RuntimeError) as ctx:
                    s.run_lifecycle_test(test_duration_seconds=1.0)
                self.assertIn("не удалось подключить", str(ctx.exception).lower())
                self.assertFalse(s.is_running)

    def test_verify_bot_identity_rejects_wrong_id_or_username(self):
        """Проверка getMe строго отклоняет бота с чужим ID или username."""
        def make_fake_opener(result_payload):
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps({"ok": True, "result": result_payload}).encode("utf-8")
            mock_opener = MagicMock()
            mock_opener.open.return_value.__enter__.return_value = mock_resp
            return mock_opener

        # 1. Чужой bot ID
        with patch("urllib.request.build_opener", return_value=make_fake_opener({"id": 12345678, "username": EXPECTED_BOT_USERNAME})):
            with self.assertRaises(ValueError) as ctx:
                verify_telegram_bot_identity(token="fake:token", proxy="")
            self.assertIn("12345678", str(ctx.exception))

        # 2. Чужой bot username
        with patch("urllib.request.build_opener", return_value=make_fake_opener({"id": EXPECTED_BOT_ID, "username": "imposter_bot"})):
            with self.assertRaises(ValueError) as ctx:
                verify_telegram_bot_identity(token="fake:token", proxy="")
            self.assertIn("imposter_bot", str(ctx.exception))

        # 3. Полное совпадение утверждённого бота
        with patch("urllib.request.build_opener", return_value=make_fake_opener({"id": EXPECTED_BOT_ID, "username": EXPECTED_BOT_USERNAME, "is_bot": True})):
            info = verify_telegram_bot_identity(token="fake:token", proxy="")
            self.assertEqual(info["id"], EXPECTED_BOT_ID)
            self.assertEqual(info["username"], EXPECTED_BOT_USERNAME)

    def test_launch_rejects_any_port_other_than_18081(self):
        """Для реального запуска туннеля разрешён исключительно целевой порт 18081."""
        s = IsolatedTunnelSupervisor(target_port=18082, max_lifetime_seconds=5)
        with self.assertRaises(ValueError) as ctx:
            s.launch_quick_tunnel(verify_bot=False)
        self.assertIn(str(DEFAULT_TARGET_PORT), str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
