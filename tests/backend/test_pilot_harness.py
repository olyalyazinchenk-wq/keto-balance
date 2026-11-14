import os
import socket
import tempfile
import unittest
from pathlib import Path

from tests.helpers.pilot_io_guard import (
    AuditViolationError,
    clear_violations,
    get_violations,
    install_pilot_io_guard,
)

class TestPilotHarness(unittest.TestCase):
    def setUp(self):
        clear_violations()
        test_root = os.environ.get("KETO_TEST_ROOT")
        self.assertIsNotNone(test_root, "KETO_TEST_ROOT must be set by test runner")
        self.root = Path(test_root)
        self.assertTrue(self.root.exists(), f"KETO_TEST_ROOT {self.root} must exist")
        # Ensure guard is installed with current root
        install_pilot_io_guard(self.root)

    def tearDown(self):
        clear_violations()

    def test_env_and_temp_vars_point_to_scratch(self):
        self.assertIn("scratch", str(self.root).lower())
        self.assertEqual(os.environ.get("TMPDIR"), str(self.root))
        self.assertEqual(os.environ.get("TEMP"), str(self.root))
        self.assertEqual(tempfile.tempdir, str(self.root))

    def test_guard_blocks_unauthorized_env_read(self):
        workspace_env = Path(__file__).resolve().parents[2] / ".env"
        with self.assertRaises(PermissionError):
            with open(workspace_env, "r", encoding="utf-8") as f:
                f.read()
        violations = get_violations()
        self.assertGreater(len(violations), 0)
        self.assertTrue(any(".env" in v for v in violations))

    def test_guard_blocks_unauthorized_bot_data_read(self):
        workspace_bot_data = Path(__file__).resolve().parents[2] / "bot_data.json"
        with self.assertRaises(PermissionError):
            with open(workspace_bot_data, "r", encoding="utf-8") as f:
                f.read()
        violations = get_violations()
        self.assertGreater(len(violations), 0)
        self.assertTrue(any("bot_data.json" in v for v in violations))

    def test_guard_allows_file_inside_scratch(self):
        safe_file = self.root / "safe_test_file.txt"
        safe_file.write_text("hello scratch", encoding="utf-8")
        with open(safe_file, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertEqual(content, "hello scratch")
        self.assertEqual(len(get_violations()), 0)

    def test_guard_blocks_sqlite_outside_scratch(self):
        import sqlite3
        forbidden_db = Path("C:/Windows/Temp/forbidden.db")
        with self.assertRaises(PermissionError):
            sqlite3.connect(str(forbidden_db))
        violations = get_violations()
        self.assertGreater(len(violations), 0)
        self.assertTrue(any("forbidden.db" in v for v in violations))

    def test_guard_blocks_external_network(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        with self.assertRaises(PermissionError):
            sock.connect(("93.184.216.34", 80))
        sock.close()
        violations = get_violations()
        self.assertGreater(len(violations), 0)
        self.assertTrue(any("93.184.216.34" in v for v in violations))

    def test_guard_blocks_unauthorized_env_variants(self):
        workspace_env_staging = Path(__file__).resolve().parents[2] / ".env.staging"
        with self.assertRaises(PermissionError):
            with open(workspace_env_staging, "r", encoding="utf-8") as f:
                f.read()
        violations = get_violations()
        self.assertTrue(any(".env.staging" in v for v in violations))

        # .env.example must also be blocked outside allowed_root
        workspace_env_example = Path(__file__).resolve().parents[2] / ".env.example"
        with self.assertRaises(PermissionError):
            with open(workspace_env_example, "r", encoding="utf-8") as f:
                f.read()

        # Case-folding: .ENV.example and .Env must be blocked
        workspace_env_upper = Path(__file__).resolve().parents[2] / ".ENV.example"
        with self.assertRaises(PermissionError):
            with open(workspace_env_upper, "r", encoding="utf-8") as f:
                f.read()

        # Case-folding: SAMPLE.DB outside allowed_root must be blocked
        forbidden_upper_db = Path("C:/Windows/Temp/SAMPLE.DB")
        with self.assertRaises(PermissionError):
            with open(forbidden_upper_db, "r", encoding="utf-8") as f:
                f.read()

    def test_guard_blocks_sqlite_without_extension_outside_scratch(self):
        import sqlite3
        forbidden_no_ext = Path("C:/Windows/Temp/forbidden_no_extension")
        with self.assertRaises(PermissionError):
            sqlite3.connect(str(forbidden_no_ext))
        violations = get_violations()
        self.assertGreater(len(violations), 0)
        self.assertTrue(any("forbidden_no_extension" in v for v in violations))

    def test_guard_blocks_application_bind_and_connect(self):
        # Binding a port must not grant permission for application connect
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.bind(("127.0.0.1", 0))
        srv.listen(1)
        port = srv.getsockname()[1]
        try:
            client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            with self.assertRaises(PermissionError):
                client.connect(("127.0.0.1", port))
            client.close()
            violations = get_violations()
            self.assertTrue(any(f":{port}" in v for v in violations))
        finally:
            srv.close()

    def test_guard_blocks_unauthorized_loopback_connection(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        with self.assertRaises(PermissionError):
            sock.connect(("127.0.0.1", 8000))
        sock.close()
        violations = get_violations()
        self.assertTrue(any("8000" in v for v in violations))

        # Unmanaged arbitrary loopback is also blocked
        sock2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        with self.assertRaises(PermissionError):
            sock2.connect(("127.0.0.1", 12345))
        sock2.close()

    def test_guard_allows_stdlib_socketpair_self_pipe(self):
        s1, s2 = socket.socketpair()
        s1.sendall(b"ping")
        self.assertEqual(s2.recv(4), b"ping")
        s1.close()
        s2.close()

if __name__ == "__main__":
    unittest.main()

