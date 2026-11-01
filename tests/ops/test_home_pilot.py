import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import scripts.home_pilot as home_pilot


class TestHomePilot(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp_dir.name)
        self.state_file = self.tmp_path / ".test_home_pilot_state.json"
        self.logs_dir = self.tmp_path / "logs"
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.tunnel_url_file = self.tmp_path / "current_tunnel_url.txt"

        self.orig_state_file = home_pilot.STATE_FILE
        self.orig_logs_dir = home_pilot.LOGS_DIR
        self.orig_tunnel_file = getattr(home_pilot, "TUNNEL_URL_FILE", home_pilot.ROOT / "current_tunnel_url.txt")
        self.orig_ssh_state_file = home_pilot.SSH_STATE_FILE
        self.ssh_state_file = self.tmp_path / ".test_tunnel_ssh_state.json"
        home_pilot.STATE_FILE = self.state_file
        home_pilot.LOGS_DIR = self.logs_dir
        home_pilot.TUNNEL_URL_FILE = self.tunnel_url_file
        home_pilot.SSH_STATE_FILE = self.ssh_state_file

        # Current process metadata for realistic process checks
        self.valid_proc_info = home_pilot.get_process_info(os.getpid())

        # Create a valid synthetic receipt for test isolation
        self.dist_dir = self.tmp_path / "workspace" / "dist"
        self.dist_dir.mkdir(parents=True, exist_ok=True)
        (self.dist_dir / "index.html").write_text("<!DOCTYPE html><html><body>Test</body></html>", encoding="utf-8")
        (self.dist_dir / "release.json").write_text(json.dumps({
            "buildId": "test-build-123",
            "backendFingerprint": "test-backend-fp",
            "catalogHash": "test-catalog-hash",
        }), encoding="utf-8")

        self.test_receipt_file = self.tmp_path / "test-receipt.json"
        self.test_receipt_data = {
            "dist_dir": str(self.dist_dir),
            "build_id": "test-build-123",
            "backend_fingerprint": "test-backend-fp",
            "catalog_hash": "test-catalog-hash",
            "receipt_path": str(self.test_receipt_file),
        }
        self.test_receipt_file.write_text(json.dumps(self.test_receipt_data), encoding="utf-8")

    def tearDown(self):
        home_pilot.STATE_FILE = self.orig_state_file
        home_pilot.LOGS_DIR = self.orig_logs_dir
        home_pilot.TUNNEL_URL_FILE = self.orig_tunnel_file
        home_pilot.SSH_STATE_FILE = self.orig_ssh_state_file
        try:
            self.tmp_dir.cleanup()
        except Exception:
            pass

    def test_ensure_venv_python_resolves_project_venv(self):
        """Verifies that ensure_venv_python resolves the .venv-p0 virtual environment."""
        venv_py = home_pilot.ensure_venv_python()
        self.assertTrue(venv_py.is_file(), f"Interpreter {venv_py} must exist on disk")
        self.assertIn(".venv-p0", str(venv_py).lower(), "Must use .venv-p0 virtual environment")

    def test_process_info_retrieval(self):
        """get_process_info accurately retrieves metadata for current process."""
        my_pid = os.getpid()
        info = home_pilot.get_process_info(my_pid)
        self.assertIsNotNone(info)
        self.assertEqual(info["pid"], my_pid)
        self.assertGreater(info["create_time"], 0)
        self.assertTrue(len(info["executable"]) > 0)

    def test_state_persistence_and_loading(self):
        """Processes metadata can be saved and reloaded from state file."""
        dummy_state = {
            "server": {
                "pid": 4321,
                "create_time": 100200300,
                "executable": "C:\\Python\\python.exe",
                "port": 18081,
                "started_at": "2026-11-01T12:00:00Z"
            },
            "tunnel": {
                "pid": 8765,
                "create_time": 400500600,
                "executable": "C:\\Python\\python.exe",
                "port": 18081,
                "started_at": "2026-11-01T12:00:01Z"
            }
        }
        home_pilot.save_state(dummy_state)
        loaded = home_pilot.load_state()
        self.assertEqual(loaded["server"]["pid"], 4321)
        self.assertEqual(loaded["tunnel"]["pid"], 8765)

    def test_safe_terminate_process_refuses_to_kill_mismatched_pid(self):
        """safe_terminate_process must NOT kill process if create_time or executable differs (recycled PID protection)."""
        current_info = home_pilot.get_process_info(os.getpid())
        self.assertIsNotNone(current_info)

        # 1. Fake create_time mismatch
        mismatched_ctime = {
            "pid": os.getpid(),
            "create_time": current_info["create_time"] + 99999999,
            "executable": current_info["executable"]
        }
        terminated = home_pilot.safe_terminate_process(mismatched_ctime)
        self.assertFalse(terminated, "Must refuse to terminate when create_time mismatches")

        # 2. Fake executable mismatch
        mismatched_exe = {
            "pid": os.getpid(),
            "create_time": current_info["create_time"],
            "executable": "C:\\Wrong\\Path\\notepad.exe"
        }
        terminated_exe = home_pilot.safe_terminate_process(mismatched_exe)
        self.assertFalse(terminated_exe, "Must refuse to terminate when executable mismatches")

    def test_duplicate_prevention_when_port_listening(self):
        """start() must return error code and not launch duplicate when port is already listening by unmanaged process."""
        with patch("scripts.home_pilot.is_port_listening", return_value=True):
            code = home_pilot.start(with_tunnel=False)
            self.assertEqual(code, 1, "Must exit with code 1 when port is already listening by unmanaged process")

    def test_log_file_separation_without_conflicts(self):
        """Verifies stdout and stderr log separation into discrete files without file locking issues."""
        server_out = self.logs_dir / "home_pilot_server.stdout.log"
        server_err = self.logs_dir / "home_pilot_server.stderr.log"
        tunnel_out = self.logs_dir / "home_pilot_tunnel.stdout.log"
        tunnel_err = self.logs_dir / "home_pilot_tunnel.stderr.log"

        for p in (server_out, server_err, tunnel_out, tunnel_err):
            with open(p, "a", encoding="utf-8") as f:
                f.write(f"Sample log line for {p.name}\n")
            self.assertTrue(p.is_file())
            content = p.read_text(encoding="utf-8")
            self.assertIn(f"Sample log line for {p.name}", content)

    def test_check_ready_timeout_handling(self):
        """check_ready returns ready=False when port does not respond."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
        })
        with patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("urllib.request.urlopen", side_effect=Exception("Connection refused")):
            res = home_pilot.check_ready(mode="LOCAL_READY", port=18081, timeout=0.5)
            self.assertFalse(res["ready"])
            self.assertIn("timed out", res["error"])

    # =========================================================================
    # TASK 1: Bot token security tests
    # =========================================================================

    def test_bot_token_passed_via_env_not_in_command_arguments(self):
        """Bot token must NOT be in CLI command args (--token), but passed strictly via environment."""
        fake_token = "secret_bot_token_abc123xyz"
        mock_proc = MagicMock()
        mock_proc.pid = self.valid_proc_info["pid"]

        with patch("scripts.home_pilot.get_bot_token", return_value=fake_token), \
             patch("scripts.home_pilot.is_port_listening", return_value=False), \
             patch("scripts.home_pilot.get_process_info", return_value=self.valid_proc_info), \
             patch("scripts.home_pilot.check_ready", return_value={"ready": True, "mode": "LOCAL_READY"}), \
             patch("subprocess.Popen", return_value=mock_proc) as mock_popen:

            code = home_pilot.start(with_tunnel=False, receipt_path=str(self.test_receipt_file))
            self.assertEqual(code, 0)
            self.assertTrue(mock_popen.called)
            called_args, called_kwargs = mock_popen.call_args
            server_cmd = called_args[0]
            server_env = called_kwargs.get("env", {})

            # Token and --token must NOT appear in server_cmd
            self.assertNotIn("--token", server_cmd, "--token argument must not be passed in command line")
            for arg in server_cmd:
                self.assertNotIn(fake_token, str(arg), "Bot token value must not be present in command line args")

            # Token MUST be present in env
            self.assertEqual(server_env.get("TELEGRAM_BOT_TOKEN"), fake_token)
            self.assertEqual(server_env.get("KETO_BOT_TOKEN"), fake_token)

    def test_bot_token_not_in_state_file_or_diagnostics(self):
        """Bot token value must never be persisted in .home_pilot_state.json or status output."""
        fake_token = "secret_bot_token_abc123xyz"
        mock_proc = MagicMock()
        mock_proc.pid = self.valid_proc_info["pid"]

        with patch("scripts.home_pilot.get_bot_token", return_value=fake_token), \
             patch("scripts.home_pilot.is_port_listening", return_value=False), \
             patch("scripts.home_pilot.get_process_info", return_value=self.valid_proc_info), \
             patch("scripts.home_pilot.check_ready", return_value={"ready": True, "mode": "LOCAL_READY"}), \
             patch("subprocess.Popen", return_value=mock_proc):

            home_pilot.start(with_tunnel=False, receipt_path=str(self.test_receipt_file))

            # Verify state file content
            state_raw = self.state_file.read_text(encoding="utf-8")
            self.assertNotIn(fake_token, state_raw, "State file must never contain the token value")

            # Verify status output
            out = io.StringIO()
            with patch("sys.stdout", out):
                home_pilot.status()
            status_text = out.getvalue()
            self.assertNotIn(fake_token, status_text, "Status output must never contain the token value")

    # =========================================================================
    # TASK 2: Independent Process & Tunnel Recovery Tests
    # =========================================================================

    def test_server_running_tunnel_stopped_starts_only_tunnel(self):
        """When server is already running and healthy but tunnel is stopped, only tunnel is spawned."""
        # Setup existing server state
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
        })

        tunnel_proc = MagicMock()
        tunnel_proc.pid = self.valid_proc_info["pid"]

        with patch("scripts.home_pilot.get_process_info", return_value=self.valid_proc_info), \
             patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("scripts.home_pilot.query_orphan_ssh_pids", return_value=[]), \
             patch("scripts.home_pilot.safe_terminate_process") as mock_terminate, \
             patch("scripts.home_pilot.check_ready", return_value={"ready": True, "mode": "PUBLIC_READY"}), \
             patch("subprocess.Popen", return_value=tunnel_proc) as mock_popen:

            code = home_pilot.start(with_tunnel=True)
            self.assertEqual(code, 0)
            mock_terminate.assert_not_called()

            spawned_commands = [c[0][0] for c in mock_popen.call_args_list if c[0]]
            self.assertTrue(any(any("run_ssh_tunnel.py" in str(arg) for arg in cmd) for cmd in spawned_commands))
            self.assertFalse(any(any("run_staging.py" in str(arg) for arg in cmd) for cmd in spawned_commands))

    def test_both_components_healthy_starts_nothing(self):
        """When both server and tunnel are healthy, start() spawns no new processes."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
            "tunnel": self.valid_proc_info,
        })

        with patch("scripts.home_pilot.get_process_info", return_value=self.valid_proc_info), \
             patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("scripts.home_pilot.query_orphan_ssh_pids", return_value=[]), \
             patch("scripts.home_pilot.check_ready", return_value={"ready": True, "mode": "PUBLIC_READY"}), \
             patch("subprocess.Popen") as mock_popen:

            code = home_pilot.start(with_tunnel=True)
            self.assertEqual(code, 0)
            mock_popen.assert_not_called()

    def test_port_occupied_by_unmanaged_process_returns_error_and_does_not_kill(self):
        """If port 18081 is listening by an unknown process, start() exits with 1 and does not kill it."""
        home_pilot.save_state({})

        with patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("scripts.home_pilot.safe_terminate_process") as mock_term, \
             patch("subprocess.Popen") as mock_popen:

            code = home_pilot.start(with_tunnel=True)
            self.assertEqual(code, 1, "Must exit with error code 1")
            mock_term.assert_not_called()
            mock_popen.assert_not_called()

    def test_failed_tunnel_start_does_not_claim_recovery(self):
        """If tunnel process fails to start or becomes unready, ready is False and return code is 1."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
        })

        with patch("scripts.home_pilot.get_process_info", return_value=self.valid_proc_info), \
             patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("scripts.home_pilot.query_orphan_ssh_pids", return_value=[]), \
             patch("subprocess.Popen", side_effect=OSError("Failed to spawn tunnel")), \
             patch("scripts.home_pilot.check_ready", return_value={"ready": False, "error": "Tunnel failed"}):

            code = home_pilot.start(with_tunnel=True)
            self.assertNotEqual(code, 0, "Must return non-zero exit code on tunnel start failure")

    def test_repeated_start_after_recovery_does_not_spawn_duplicate(self):
        """After recovery succeeds, repeated start() does not spawn additional processes."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
            "tunnel": self.valid_proc_info,
        })

        with patch("scripts.home_pilot.get_process_info", return_value=self.valid_proc_info), \
             patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("scripts.home_pilot.query_orphan_ssh_pids", return_value=[]), \
             patch("scripts.home_pilot.check_ready", return_value={"ready": True, "mode": "PUBLIC_READY"}), \
             patch("subprocess.Popen") as mock_popen:

            code = home_pilot.start(with_tunnel=True)
            self.assertEqual(code, 0)
            mock_popen.assert_not_called()

    def test_cleanup_prior_ssh_child_process(self):
        """cleanup_tunnel_ssh safely terminates matching SSH process and unlinks state."""
        ssh_state = {
            "pid": self.valid_proc_info["pid"],
            "port": 18081,
            "create_time": self.valid_proc_info["create_time"],
            "executable": "C:\\Windows\\System32\\OpenSSH\\ssh.exe",
        }
        home_pilot.SSH_STATE_FILE.write_text(json.dumps(ssh_state), encoding="utf-8")

        mock_ssh_info = dict(self.valid_proc_info)
        mock_ssh_info["executable"] = "C:\\Windows\\System32\\OpenSSH\\ssh.exe"

        with patch("scripts.home_pilot.get_process_info", return_value=mock_ssh_info), \
             patch("scripts.home_pilot.safe_terminate_process", return_value=True) as mock_term, \
             patch("scripts.home_pilot.query_orphan_ssh_pids", return_value=[]):

            home_pilot.cleanup_tunnel_ssh(port=18081)
            mock_term.assert_called_once()
            self.assertFalse(home_pilot.SSH_STATE_FILE.exists())

    # =========================================================================
    # TASK 3: Mandatory Negative Tests for check_ready & Build Pinning
    # =========================================================================

    def test_pinned_receipt_loaded_and_passed_to_staging(self):
        """start() must pass pinned receipt to run_staging and persist it in state."""
        mock_proc = MagicMock()
        mock_proc.pid = self.valid_proc_info["pid"]

        with patch("scripts.home_pilot.get_bot_token", return_value="fake_token"), \
             patch("scripts.home_pilot.is_port_listening", return_value=False), \
             patch("scripts.home_pilot.get_process_info", return_value=self.valid_proc_info), \
             patch("scripts.home_pilot.check_ready", return_value={"ready": True, "mode": "LOCAL_READY"}), \
             patch("subprocess.Popen", return_value=mock_proc) as mock_popen:

            code = home_pilot.start(with_tunnel=False, receipt_path=str(self.test_receipt_file))
            self.assertEqual(code, 0)
            server_cmd = mock_popen.call_args[0][0]
            self.assertIn("--receipt", server_cmd)
            idx = server_cmd.index("--receipt")
            self.assertEqual(server_cmd[idx + 1], str(self.test_receipt_file))

            state = home_pilot.load_state()
            self.assertEqual(state.get("receipt_path"), str(self.test_receipt_file))

    def test_missing_saved_receipt_blocks_ready_and_returns_error(self):
        """Missing receipt file must block ready check and cause status to return non-zero."""
        non_existent_receipt = self.tmp_path / "non_existent_receipt.json"
        home_pilot.save_state({
            "receipt_path": str(non_existent_receipt),
            "server": self.valid_proc_info,
        })

        res = home_pilot.check_ready(mode="LOCAL_READY")
        self.assertFalse(res["ready"])
        self.assertIn("receipt", res["error"].lower())

    def test_negative_local_health_ok_version_inaccessible(self):
        """Local health is 200 OK, but /api/version fails -> PUBLIC_READY blocked, return non-zero."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
        })

        def mock_urlopen(req, timeout=None):
            url = req if isinstance(req, str) else req.full_url
            if "/api/health" in url:
                m = MagicMock()
                m.status = 200
                m.read.return_value = b'{"status": "ok"}'
                m.headers = {"Content-Type": "application/json"}
                m.__enter__.return_value = m
                return m
            if "/api/version" in url:
                raise Exception("Version endpoint down (500)")
            raise Exception("Unexpected URL")

        with patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen):
            res = home_pilot.check_ready(mode="LOCAL_READY")
            self.assertFalse(res["ready"])
            self.assertIn("version", res["error"].lower())

    def test_negative_local_version_returns_corrupted_json(self):
        """Local /api/version returns corrupted JSON -> ready=False."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
        })

        def mock_urlopen(req, timeout=None):
            url = req if isinstance(req, str) else req.full_url
            if "/api/health" in url:
                m = MagicMock()
                m.status = 200
                m.read.return_value = b'{"status": "ok"}'
                m.headers = {"Content-Type": "application/json"}
                m.__enter__.return_value = m
                return m
            if "/api/version" in url:
                m = MagicMock()
                m.status = 200
                m.headers = {"Content-Type": "application/json"}
                m.read.return_value = b'{corrupted_json: true,'
                m.__enter__.return_value = m
                return m
            raise Exception("Unexpected URL")

        with patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen):
            res = home_pilot.check_ready(mode="LOCAL_READY")
            self.assertFalse(res["ready"])
            self.assertIn("json", res["error"].lower())

    def test_negative_version_differs_from_receipt(self):
        """Local /api/version differs from receipt -> ready=False."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
        })

        def mock_urlopen(req, timeout=None):
            url = req if isinstance(req, str) else req.full_url
            if "/api/health" in url:
                m = MagicMock()
                m.status = 200
                m.read.return_value = b'{"status": "ok"}'
                m.headers = {"Content-Type": "application/json"}
                m.__enter__.return_value = m
                return m
            if "/api/version" in url:
                m = MagicMock()
                m.status = 200
                m.headers = {"Content-Type": "application/json"}
                m.read.return_value = json.dumps({
                    "buildId": "WRONG_BUILD_ID",
                    "backendFingerprint": "test-backend-fp",
                    "catalogHash": "test-catalog-hash",
                }).encode("utf-8")
                m.__enter__.return_value = m
                return m
            raise Exception("Unexpected URL")

        with patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen):
            res = home_pilot.check_ready(mode="LOCAL_READY")
            self.assertFalse(res["ready"])
            self.assertIn("mismatch", res["error"].lower())

    def test_negative_external_url_missing(self):
        """External tunnel URL missing from current_tunnel_url.txt -> PUBLIC_READY blocked."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
            "tunnel": self.valid_proc_info,
        })
        if self.tunnel_url_file.is_file():
            self.tunnel_url_file.unlink()

        def mock_urlopen(req, timeout=None):
            url = req if isinstance(req, str) else req.full_url
            if "127.0.0.1" in url and "/api/health" in url:
                m = MagicMock()
                m.status = 200
                m.read.return_value = b'{"status": "ok"}'
                m.headers = {"Content-Type": "application/json"}
                m.__enter__.return_value = m
                return m
            if "127.0.0.1" in url and "/api/version" in url:
                m = MagicMock()
                m.status = 200
                m.headers = {"Content-Type": "application/json"}
                m.read.return_value = json.dumps({
                    "buildId": "test-build-123",
                    "backendFingerprint": "test-backend-fp",
                    "catalogHash": "test-catalog-hash",
                }).encode("utf-8")
                m.__enter__.return_value = m
                return m
            raise Exception("Unexpected URL")

        with patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen):
            res = home_pilot.check_ready(mode="PUBLIC_READY")
            self.assertFalse(res["ready"])
            self.assertIn("tunnel url", res["error"].lower())

    def test_negative_external_returns_502(self):
        """External tunnel URL returns 502 Bad Gateway -> PUBLIC_READY blocked."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
            "tunnel": self.valid_proc_info,
        })
        self.tunnel_url_file.write_text("https://test.lhr.life", encoding="utf-8")

        import urllib.error

        def mock_urlopen(req, timeout=None):
            url = req if isinstance(req, str) else req.full_url
            if "127.0.0.1" in url and "/api/health" in url:
                m = MagicMock()
                m.status = 200
                m.read.return_value = b'{"status": "ok"}'
                m.headers = {"Content-Type": "application/json"}
                m.__enter__.return_value = m
                return m
            if "127.0.0.1" in url and "/api/version" in url:
                m = MagicMock()
                m.status = 200
                m.headers = {"Content-Type": "application/json"}
                m.read.return_value = json.dumps({
                    "buildId": "test-build-123",
                    "backendFingerprint": "test-backend-fp",
                    "catalogHash": "test-catalog-hash",
                }).encode("utf-8")
                m.__enter__.return_value = m
                return m
            if "test.lhr.life" in url:
                raise urllib.error.HTTPError(url, 502, "Bad Gateway", {}, None)
            raise Exception("Unexpected URL")

        with patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen):
            res = home_pilot.check_ready(mode="PUBLIC_READY")
            self.assertFalse(res["ready"])
            self.assertIn("502", res["error"])

    def test_negative_external_serves_different_build(self):
        """External URL returns different buildId than receipt -> PUBLIC_READY blocked."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
            "tunnel": self.valid_proc_info,
        })
        self.tunnel_url_file.write_text("https://test.lhr.life", encoding="utf-8")

        def mock_urlopen(req, timeout=None):
            url = req if isinstance(req, str) else req.full_url
            if "127.0.0.1" in url and "/api/health" in url:
                m = MagicMock()
                m.status = 200
                m.read.return_value = b'{"status": "ok"}'
                m.headers = {"Content-Type": "application/json"}
                m.__enter__.return_value = m
                return m
            if "127.0.0.1" in url and "/api/version" in url:
                m = MagicMock()
                m.status = 200
                m.headers = {"Content-Type": "application/json"}
                m.read.return_value = json.dumps({
                    "buildId": "test-build-123",
                    "backendFingerprint": "test-backend-fp",
                    "catalogHash": "test-catalog-hash",
                }).encode("utf-8")
                m.__enter__.return_value = m
                return m
            if "test.lhr.life" in url and "/api/health" in url:
                m = MagicMock()
                m.status = 200
                m.headers = {"Content-Type": "application/json"}
                m.read.return_value = b'{"status": "ok"}'
                m.__enter__.return_value = m
                return m
            if "test.lhr.life" in url and "/api/version" in url:
                m = MagicMock()
                m.status = 200
                m.headers = {"Content-Type": "application/json"}
                m.read.return_value = json.dumps({
                    "buildId": "STALE_OLD_BUILD_ID",
                    "backendFingerprint": "test-backend-fp",
                    "catalogHash": "test-catalog-hash",
                }).encode("utf-8")
                m.__enter__.return_value = m
                return m
            raise Exception(f"Unexpected URL: {url}")

        with patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen):
            res = home_pilot.check_ready(mode="PUBLIC_READY")
            self.assertFalse(res["ready"])
            self.assertIn("mismatch", res["error"].lower())

    def test_negative_tunnel_process_stopped(self):
        """If tunnel process is not running, PUBLIC_READY is blocked."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
            # No tunnel in state
        })
        self.tunnel_url_file.write_text("https://test.lhr.life", encoding="utf-8")

        with patch("scripts.home_pilot.is_port_listening", return_value=True):
            res = home_pilot.check_ready(mode="PUBLIC_READY")
            self.assertFalse(res["ready"])
            self.assertIn("tunnel", res["error"].lower())

    def test_html_response_not_accepted_as_health_success(self):
        """HTTP 200 with HTML text must NOT be considered ready=True."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
        })

        def mock_urlopen(req, timeout=None):
            m = MagicMock()
            m.status = 200
            m.read.return_value = b"<html><body>Welcome to some captive portal</body></html>"
            m.headers = {"Content-Type": "text/html"}
            m.__enter__.return_value = m
            return m

        with patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen):
            res = home_pilot.check_ready(mode="LOCAL_READY", timeout=1.0)
            self.assertFalse(res["ready"])
            self.assertIn("html", res["error"].lower())

    def test_local_ready_mode_ignores_external_tunnel(self):
        """LOCAL_READY mode verifies local server and passes even without external tunnel."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
        })

        def mock_urlopen(req, timeout=None):
            url = req if isinstance(req, str) else req.full_url
            if "/api/health" in url:
                m = MagicMock()
                m.status = 200
                m.read.return_value = b'{"status": "ok"}'
                m.headers = {"Content-Type": "application/json"}
                m.__enter__.return_value = m
                return m
            if "/api/version" in url:
                m = MagicMock()
                m.status = 200
                m.read.return_value = json.dumps({
                    "buildId": "test-build-123",
                    "backendFingerprint": "test-backend-fp",
                    "catalogHash": "test-catalog-hash",
                }).encode("utf-8")
                m.headers = {"Content-Type": "application/json"}
                m.__enter__.return_value = m
                return m
            raise Exception("Unexpected URL")

        with patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen):
            res = home_pilot.check_ready(mode="LOCAL_READY")
            self.assertTrue(res["ready"], f"LOCAL_READY must pass when local server matches receipt: {res.get('error')}")

    def test_supervisor_halts_after_five_failures_with_exact_backoff_steps(self):
        """Supervisor must follow 5, 10, 20, 40, 60 backoff steps and halt after 5 consecutive failures."""
        slept_intervals = []

        def mock_sleep(seconds):
            slept_intervals.append(seconds)

        with patch("scripts.home_pilot.start", return_value=0), \
             patch("scripts.home_pilot.is_process_alive_and_matched", return_value=False), \
             patch("scripts.home_pilot.check_ready", return_value={"ready": False, "error": "Mocked failure"}), \
             patch("time.sleep", side_effect=mock_sleep):

            code = home_pilot.supervisor(with_tunnel=False, receipt_path=str(self.test_receipt_file))
            self.assertEqual(code, 1, "Must exit with error code 1 after 5 consecutive failures")

            # Extract the recovery backoff delays (ignoring the 5s loop sleep)
            backoff_delays = [s for s in slept_intervals if s in (5, 10, 20, 40, 60)]
            # We expect delays: 5, 10, 20, 40, 60
            self.assertIn(10, backoff_delays)
            self.assertIn(20, backoff_delays)
            self.assertIn(40, backoff_delays)
            self.assertIn(60, backoff_delays)

    def test_supervisor_resets_counter_only_on_confirmed_readiness(self):
        """Supervisor must reset failure counter only after confirmed ready check, not just Popen."""
        slept_intervals = []
        ready_cycle = [
            {"ready": False, "error": "First crash"},
            {"ready": True, "mode": "LOCAL_READY"},
        ]

        def mock_check_ready(*args, **kwargs):
            if ready_cycle:
                return ready_cycle.pop(0)
            raise KeyboardInterrupt("Stop test loop")

        def mock_sleep(seconds):
            slept_intervals.append(seconds)

        with patch("scripts.home_pilot.start", return_value=0), \
             patch("scripts.home_pilot.is_process_alive_and_matched", side_effect=[False, True, True, True]), \
             patch("scripts.home_pilot.check_ready", side_effect=mock_check_ready), \
             patch("time.sleep", side_effect=mock_sleep):

            code = home_pilot.supervisor(with_tunnel=False, receipt_path=str(self.test_receipt_file))
            self.assertEqual(code, 0)
            # Confirmed recovery was verified
            self.assertIn(5, slept_intervals)

    def test_safe_terminate_process_refuses_to_kill_different_executable_path_with_same_name(self):
        """safe_terminate_process must refuse to terminate if executable path is different, even if basename is python.exe."""
        current_info = home_pilot.get_process_info(os.getpid())
        self.assertIsNotNone(current_info)

        different_path_exe = {
            "pid": os.getpid(),
            "create_time": current_info["create_time"],
            "executable": "C:\\Foreign\\Environment\\Scripts\\python.exe"
        }
        with patch("subprocess.run") as mock_run:
            terminated = home_pilot.safe_terminate_process(different_path_exe)
            self.assertFalse(terminated, "Must refuse to terminate when executable path differs despite matching filename")
            mock_run.assert_not_called()

    def test_is_process_alive_and_matched_distinguishes_different_executable_paths(self):
        """is_process_alive_and_matched must return False when executable path differs."""
        current_info = home_pilot.get_process_info(os.getpid())
        self.assertIsNotNone(current_info)

        different_path_exe = {
            "pid": os.getpid(),
            "create_time": current_info["create_time"],
            "executable": "C:\\Foreign\\Environment\\Scripts\\python.exe"
        }
        matched = home_pilot.is_process_alive_and_matched(different_path_exe)
        self.assertFalse(matched, "is_process_alive_and_matched must not match a process at a different directory path")

    def test_check_ready_normalizes_trailing_slash_in_tunnel_url(self):
        """check_ready must normalize trailing slashes in tunnel URL to avoid 404 //api/health requests."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
            "tunnel": self.valid_proc_info,
        })
        # Write URL with trailing slash
        self.tunnel_url_file.write_text("https://test.lhr.life/\n", encoding="utf-8")

        requested_urls = []

        def mock_urlopen(req, timeout=None):
            url = req if isinstance(req, str) else req.full_url
            requested_urls.append(url)
            m = MagicMock()
            m.status = 200
            m.headers = {"Content-Type": "application/json"}
            if "/api/health" in url:
                m.read.return_value = b'{"status": "ok"}'
                m.__enter__.return_value = m
                return m
            if "/api/version" in url:
                m.read.return_value = json.dumps({
                    "buildId": "test-build-123",
                    "backendFingerprint": "test-backend-fp",
                    "catalogHash": "test-catalog-hash",
                }).encode("utf-8")
                m.__enter__.return_value = m
                return m
            raise Exception(f"Unexpected URL: {url}")

        with patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen):
            res = home_pilot.check_ready(mode="PUBLIC_READY")
            self.assertTrue(res["ready"], f"PUBLIC_READY should pass: {res.get('error')}")

            # Verify no double slashes in requests
            for url in requested_urls:
                self.assertNotIn("//api/", url, f"URL {url} must not contain double slashes")

    def test_check_ready_rejects_external_version_differing_from_local_version(self):
        """External version differing from local version payload must cause PUBLIC_READY to fail."""
        home_pilot.save_state({
            "receipt_path": str(self.test_receipt_file),
            "server": self.valid_proc_info,
            "tunnel": self.valid_proc_info,
        })
        self.tunnel_url_file.write_text("https://test.lhr.life", encoding="utf-8")

        def mock_urlopen(req, timeout=None):
            url = req if isinstance(req, str) else req.full_url
            m = MagicMock()
            m.status = 200
            m.headers = {"Content-Type": "application/json"}
            if "127.0.0.1" in url and "/api/health" in url:
                m.read.return_value = b'{"status": "ok"}'
                m.__enter__.return_value = m
                return m
            if "127.0.0.1" in url and "/api/version" in url:
                m.read.return_value = json.dumps({
                    "buildId": "test-build-123",
                    "backendFingerprint": "test-backend-fp",
                    "catalogHash": "test-catalog-hash",
                    "version": "1.0.0"
                }).encode("utf-8")
                m.__enter__.return_value = m
                return m
            if "test.lhr.life" in url and "/api/health" in url:
                m.read.return_value = b'{"status": "ok"}'
                m.__enter__.return_value = m
                return m
            if "test.lhr.life" in url and "/api/version" in url:
                # Matches receipt fields, but differs from local version in extra field
                m.read.return_value = json.dumps({
                    "buildId": "test-build-123",
                    "backendFingerprint": "test-backend-fp",
                    "catalogHash": "test-catalog-hash",
                    "version": "0.9.0-diverged"
                }).encode("utf-8")
                m.__enter__.return_value = m
                return m
            raise Exception(f"Unexpected URL: {url}")

        with patch("scripts.home_pilot.is_port_listening", return_value=True), \
             patch("urllib.request.urlopen", side_effect=mock_urlopen):
            res = home_pilot.check_ready(mode="PUBLIC_READY")
            self.assertFalse(res["ready"], "PUBLIC_READY must fail when external version differs from local version")
            self.assertIn("differs", res["error"].lower())

    def test_start_validates_dist_files_in_saved_receipt_on_recovery(self):
        """start() must fail with exit code 1 if saved receipt points to non-existent dist directory."""
        corrupted_receipt_file = self.tmp_path / "corrupted_receipt.json"
        corrupted_receipt_file.write_text(json.dumps({
            "build_id": "corrupt-123",
            "backend_fingerprint": "fp",
            "catalog_hash": "ch",
            "dist_dir": str(self.tmp_path / "non_existent_dist"),
        }), encoding="utf-8")

        home_pilot.save_state({
            "receipt_path": str(corrupted_receipt_file),
        })

        code = home_pilot.start(with_tunnel=False)
        self.assertEqual(code, 1, "start() must return 1 when saved receipt references missing dist directory")

    def test_run_ssh_tunnel_writes_url_file_even_without_env_file(self):
        """run_ssh_tunnel.update_env_url must write current_tunnel_url.txt even when .env does not exist."""
        import scripts.run_ssh_tunnel as run_ssh_tunnel
        orig_url_file = run_ssh_tunnel.URL_FILE
        orig_env_file = run_ssh_tunnel.ENV_FILE

        test_url_file = self.tmp_path / "test_tunnel_url.txt"
        test_env_file = self.tmp_path / ".non_existent_env"

        run_ssh_tunnel.URL_FILE = test_url_file
        run_ssh_tunnel.ENV_FILE = test_env_file
        try:
            run_ssh_tunnel.update_env_url("https://sample-domain.lhr.life/\n")
            self.assertTrue(test_url_file.is_file(), "current_tunnel_url.txt must be written even without .env")
            saved_content = test_url_file.read_text(encoding="utf-8")
            self.assertEqual(saved_content, "https://sample-domain.lhr.life", "Trailing slash and whitespace must be stripped")
        finally:
            run_ssh_tunnel.URL_FILE = orig_url_file
            run_ssh_tunnel.ENV_FILE = orig_env_file

    # =========================================================================
    # TASK 4: Tests for Missing and Stale State Files (Safe Termination Protection)
    # =========================================================================

    def test_stop_when_state_file_missing_leaves_processes_untouched(self):
        """When state file does not exist, stop() must not terminate any processes."""
        if self.state_file.exists():
            self.state_file.unlink()
        if self.ssh_state_file.exists():
            self.ssh_state_file.unlink()

        with patch("scripts.home_pilot.safe_terminate_process") as mock_term, \
             patch("subprocess.run") as mock_run:
            code = home_pilot.stop()
            self.assertEqual(code, 0)
            mock_term.assert_not_called()
            mock_run.assert_not_called()

    def test_cleanup_tunnel_ssh_when_state_missing_does_not_terminate_foreign_process(self):
        """When SSH state file is missing, cleanup_tunnel_ssh must not terminate any process (no port fallback)."""
        if self.ssh_state_file.exists():
            self.ssh_state_file.unlink()

        with patch("scripts.home_pilot.safe_terminate_process") as mock_term, \
             patch("subprocess.run") as mock_run:
            home_pilot.cleanup_tunnel_ssh(port=18081)
            mock_term.assert_not_called()
            mock_run.assert_not_called()

    def test_safe_terminate_refuses_when_create_time_missing(self):
        """safe_terminate_process must refuse to terminate if create_time is missing in state."""
        proc_missing_ctime = {
            "pid": os.getpid(),
            "executable": self.valid_proc_info["executable"],
            # create_time omitted
        }
        with patch("subprocess.run") as mock_run:
            result = home_pilot.safe_terminate_process(proc_missing_ctime)
            self.assertFalse(result, "Must return False when create_time is missing")
            mock_run.assert_not_called()

    def test_safe_terminate_refuses_when_executable_missing(self):
        """safe_terminate_process must refuse to terminate if executable path is missing in state."""
        proc_missing_exe = {
            "pid": os.getpid(),
            "create_time": self.valid_proc_info["create_time"],
            # executable omitted
        }
        with patch("subprocess.run") as mock_run:
            result = home_pilot.safe_terminate_process(proc_missing_exe)
            self.assertFalse(result, "Must return False when executable is missing")
            mock_run.assert_not_called()

    def test_stop_with_stale_state_recycled_pid_leaves_process_untouched(self):
        """When state contains a recycled PID (mismatched create_time), stop() must not kill it."""
        stale_state = {
            "server": {
                "pid": os.getpid(),
                "create_time": self.valid_proc_info["create_time"] + 88888,
                "executable": self.valid_proc_info["executable"],
            },
            "tunnel": {
                "pid": os.getpid(),
                "create_time": self.valid_proc_info["create_time"] + 99999,
                "executable": self.valid_proc_info["executable"],
            }
        }
        home_pilot.save_state(stale_state)

        with patch("subprocess.run") as mock_run:
            code = home_pilot.stop()
            self.assertEqual(code, 0)
            mock_run.assert_not_called()

    def test_stop_with_stale_state_mismatched_executable_leaves_process_untouched(self):
        """When state contains a different executable path, stop() must not kill it."""
        stale_state = {
            "server": {
                "pid": os.getpid(),
                "create_time": self.valid_proc_info["create_time"],
                "executable": "C:\\Foreign\\App\\other.exe",
            }
        }
        home_pilot.save_state(stale_state)

        with patch("subprocess.run") as mock_run:
            code = home_pilot.stop()
            self.assertEqual(code, 0)
            mock_run.assert_not_called()

    def test_cleanup_tunnel_ssh_with_stale_ssh_state_leaves_process_untouched(self):
        """When .tunnel_ssh_state.json has stale create_time or mismatched executable, cleanup_tunnel_ssh must not kill."""
        stale_ssh = {
            "pid": os.getpid(),
            "port": 18081,
            "create_time": self.valid_proc_info["create_time"] + 77777,
            "executable": self.valid_proc_info["executable"],
        }
        home_pilot.SSH_STATE_FILE.write_text(json.dumps(stale_ssh), encoding="utf-8")

        with patch("subprocess.run") as mock_run:
            home_pilot.cleanup_tunnel_ssh(port=18081)
            mock_run.assert_not_called()
            self.assertFalse(home_pilot.SSH_STATE_FILE.exists(), "Stale state file should be unlinked")

    def test_safe_terminate_refuses_when_executable_not_absolute(self):
        """safe_terminate_process must refuse to terminate if executable is not an absolute path."""
        proc_relative_exe = {
            "pid": os.getpid(),
            "create_time": self.valid_proc_info["create_time"],
            "executable": "python.exe",
        }
        with patch("subprocess.run") as mock_run:
            result = home_pilot.safe_terminate_process(proc_relative_exe)
            self.assertFalse(result, "Must return False when executable is a relative path/basename")
            mock_run.assert_not_called()

    def test_cleanup_tunnel_ssh_when_state_missing_executable_leaves_process_untouched(self):
        """cleanup_tunnel_ssh must refuse to terminate process if executable is missing from ssh state."""
        ssh_state_no_exe = {
            "pid": os.getpid(),
            "port": 18081,
            "create_time": self.valid_proc_info["create_time"],
            # executable omitted
        }
        home_pilot.SSH_STATE_FILE.write_text(json.dumps(ssh_state_no_exe), encoding="utf-8")

        with patch("subprocess.run") as mock_run:
            home_pilot.cleanup_tunnel_ssh(port=18081)
            mock_run.assert_not_called()
            self.assertFalse(home_pilot.SSH_STATE_FILE.exists(), "State file should be cleaned up")

    def test_cleanup_tunnel_ssh_when_state_has_relative_executable_leaves_process_untouched(self):
        """cleanup_tunnel_ssh must refuse to terminate process if executable in state is not an absolute path."""
        ssh_state_rel_exe = {
            "pid": os.getpid(),
            "port": 18081,
            "create_time": self.valid_proc_info["create_time"],
            "executable": "ssh.exe",
        }
        home_pilot.SSH_STATE_FILE.write_text(json.dumps(ssh_state_rel_exe), encoding="utf-8")

        with patch("subprocess.run") as mock_run:
            home_pilot.cleanup_tunnel_ssh(port=18081)
            mock_run.assert_not_called()
            self.assertFalse(home_pilot.SSH_STATE_FILE.exists(), "State file should be cleaned up")

    def test_is_process_alive_and_matched_requires_confirmed_metadata(self):
        """is_process_alive_and_matched must return False when create_time or executable is missing or relative."""
        # Missing create_time
        self.assertFalse(home_pilot.is_process_alive_and_matched({
            "pid": os.getpid(),
            "executable": self.valid_proc_info["executable"],
        }))
        # Missing executable
        self.assertFalse(home_pilot.is_process_alive_and_matched({
            "pid": os.getpid(),
            "create_time": self.valid_proc_info["create_time"],
        }))
        # Relative executable
        self.assertFalse(home_pilot.is_process_alive_and_matched({
            "pid": os.getpid(),
            "create_time": self.valid_proc_info["create_time"],
            "executable": "python.exe",
        }))
        # All valid and matching
        self.assertTrue(home_pilot.is_process_alive_and_matched(self.valid_proc_info))


if __name__ == "__main__":
    unittest.main()
