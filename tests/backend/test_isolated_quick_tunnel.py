import os
import signal
import subprocess
import sys
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from scripts.isolated_quick_tunnel import (
    IsolatedTunnelSupervisor,
    FORBIDDEN_PORTS,
    create_kill_on_close_job,
    assign_proc_to_job,
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
        # Используем неактивный порт для имитации упавшего сервера
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
        # Быстрый опрос раз в 0.2 секунды
        watchdog = s._watchdog_loop(start_time, health_check_interval=0.2)

        time.sleep(1.0)
        # Сервер 19999 не отвечает -> 3 проверки не пройдены -> автоостановка
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
        """На Windows: при закрытии Job Object ядро ОС мгновенно уничтожает дочерний процесс."""
        if sys.platform != "win32":
            self.skipTest("Тест актуален для Windows Job Objects")

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


if __name__ == "__main__":
    unittest.main()
