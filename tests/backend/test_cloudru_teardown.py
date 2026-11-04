import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.cloudru_teardown import (
    verify_backup_readiness,
    execute_teardown_plan,
    inventory_local_and_cloud_resources,
    CloudRuEvolutionClient,
    CloudRuApiError,
    TeardownGateError,
    CONFIRMATION_PHRASE,
)
from scripts.backup_db import compute_sha256, derive_key, resolve_encryption_key


class TestCloudRuTeardown(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tmp_dir.name)
        self.backup_db = self.tmp_path / "valid_backup.db"
        self.meta_json = self.tmp_path / "valid_backup.json"

        # Create valid SQLite database
        conn = sqlite3.connect(str(self.backup_db))
        cur = conn.cursor()
        cur.execute("CREATE TABLE users (user_id INTEGER PRIMARY KEY, username TEXT)")
        cur.execute("INSERT INTO users VALUES (10, 'olga_user')")
        conn.commit()
        conn.close()

        sha = compute_sha256(self.backup_db)
        meta = {
            "timestamp_utc": "2026-11-05T00:00:00Z",
            "sha256": sha,
            "encrypted": False,
        }
        self.meta_json.write_text(json.dumps(meta), encoding="utf-8")

        # Create encrypted backup fixture with individual salt
        from cryptography.fernet import Fernet
        self.enc_key = "secure-teardown-key-2026"
        self.salt = b"0123456789abcdef"
        fernet = Fernet(derive_key(self.enc_key, salt=self.salt))
        self.enc_backup_db = self.tmp_path / "encrypted_backup.db.enc"
        self.enc_meta_json = self.tmp_path / "encrypted_backup.json"
        enc_bytes = fernet.encrypt(self.backup_db.read_bytes())
        self.enc_backup_db.write_bytes(enc_bytes)
        enc_sha = compute_sha256(self.enc_backup_db)
        self.enc_meta_json.write_text(json.dumps({
            "timestamp_utc": "2026-11-05T00:00:00Z",
            "sha256_ciphertext": enc_sha,
            "sha256_plaintext": sha,
            "encrypted": True,
            "kdf_salt_hex": self.salt.hex(),
            "kdf_iterations": 100000,
        }), encoding="utf-8")

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_gate_blocks_when_backup_missing(self):
        missing = self.tmp_path / "does_not_exist.db"
        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(missing)
        self.assertIn("не найдена", str(ctx.exception).lower())

    def test_gate_blocks_when_meta_missing(self):
        no_meta = self.tmp_path / "orphan.db"
        no_meta.write_bytes(b"some content")
        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(no_meta)
        self.assertIn("отсутствуют метаданные", str(ctx.exception).lower())

    def test_gate_blocks_when_sha256_mismatch(self):
        meta = json.loads(self.meta_json.read_text(encoding="utf-8"))
        meta["sha256"] = "badhash1234567890"
        self.meta_json.write_text(json.dumps(meta), encoding="utf-8")

        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(self.backup_db)
        self.assertIn("не совпадает", str(ctx.exception).lower())

    def test_gate_succeeds_when_backup_and_integrity_valid(self):
        res = verify_backup_readiness(self.backup_db)
        self.assertTrue(res["verified"])
        self.assertEqual(res["user_count"], 1)

    def test_dry_run_by_default_deletes_nothing(self):
        inv = {
            "instances": [{"id": "inst-1", "name": "vm-1", "cost_rub_month": 1600}],
            "volumes": [{"id": "vol-1", "name": "root-disk", "size_gb": 30, "cost_rub_month": 360}],
            "floating_ips": [{"id": "fip-1", "ip": "1.2.3.4", "cost_rub_month": 200}],
            "snapshots": [{"id": "snap-1", "name": "s1", "cost_rub_month": 100}],
        }
        res = execute_teardown_plan(inv, dry_run=True)
        self.assertEqual(res["mode"], "DRY_RUN")
        self.assertFalse(res["executed"])
        self.assertFalse(res["zero_residual_confirmed"])
        self.assertEqual(res["total_monthly_rub_prevented"], 2260)
        self.assertEqual(len(res["actions_planned"]), 4)

    def test_live_destroy_locked_when_no_executor(self):
        inv = {"instances": [{"id": "inst-1", "name": "vm-1", "cost_rub_month": 1600}]}
        res = execute_teardown_plan(inv, dry_run=False, executor=None)
        self.assertEqual(res["mode"], "LIVE_LOCKED")
        self.assertFalse(res["executed"])
        self.assertFalse(res["zero_residual_confirmed"])
        self.assertIn("заблокировано", res["message"])

    def test_live_destroy_without_verifier_does_not_claim_zero_residual(self):
        inv = {"instances": [{"id": "inst-1", "name": "vm-1", "cost_rub_month": 1600}]}
        deleted = []

        def mock_executor(rtype, rid):
            deleted.append((rtype, rid))

        res = execute_teardown_plan(inv, dry_run=False, executor=mock_executor, verifier=None)
        self.assertEqual(res["mode"], "LIVE_DESTROY")
        self.assertTrue(res["executed"])
        self.assertFalse(res["zero_residual_confirmed"])
        self.assertEqual(len(deleted), 1)

    def test_live_destroy_with_empty_post_verification_confirms_zero_residual(self):
        inv = {"instances": [{"id": "inst-1", "name": "vm-1", "cost_rub_month": 1600}]}
        deleted = []

        def mock_executor(rtype, rid):
            deleted.append((rtype, rid))

        def mock_verifier():
            return {
                "instances": [],
                "volumes": [],
                "floating_ips": [],
                "snapshots": [],
                "images": [],
                "virtual_ips": [],
                "has_unconfirmed_costs": False,
            }

        res = execute_teardown_plan(inv, dry_run=False, executor=mock_executor, verifier=mock_verifier)
        self.assertEqual(res["mode"], "LIVE_DESTROY")
        self.assertTrue(res["executed"])
        self.assertTrue(res["zero_residual_confirmed"])

    def test_inventory_function_raises_cloudru_api_error_when_no_credentials(self):
        env_backup = dict(os.environ)
        try:
            for k in list(os.environ.keys()):
                if any(x in k.upper() for x in ("CLOUD", "EVOLUTION", "OS_")):
                    del os.environ[k]
            with self.assertRaises(CloudRuApiError) as ctx:
                inventory_local_and_cloud_resources()
            self.assertIn("отсутствуют учётные данные", str(ctx.exception).lower())
        finally:
            os.environ.clear()
            os.environ.update(env_backup)

    def test_backup_readiness_with_encrypted_backup_and_key_file(self):
        key_file = self.tmp_path / "test_backup.key"
        key_file.write_text(self.enc_key, encoding="utf-8")
        res = verify_backup_readiness(self.enc_backup_db, key_file=key_file)
        self.assertTrue(res["verified"])
        self.assertTrue(res["is_encrypted"])
        self.assertEqual(res["user_count"], 1)

    def test_backup_readiness_fails_with_wrong_key(self):
        wrong_key_file = self.tmp_path / "wrong.key"
        wrong_key_file.write_text("wrong-secret-key-12345", encoding="utf-8")
        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(self.enc_backup_db, key_file=wrong_key_file)
        self.assertIn("ошибка расшифровки", str(ctx.exception).lower())

    def test_teardown_cli_dry_run_with_mock_inventory_file(self):
        mock_inv = {
            "instances": [{"id": "inst-prod", "name": "keto-balance-vm", "cost_rub_month": 1600}],
            "volumes": [{"id": "vol-root", "name": "root-vol", "size_gb": 30, "cost_rub_month": 360}],
            "floating_ips": [{"id": "fip-1", "ip": "178.20.10.5", "cost_rub_month": 200}],
            "snapshots": [],
            "images": [],
            "virtual_ips": [],
        }
        mock_file = self.tmp_path / "mock_inv.json"
        mock_file.write_text(json.dumps(mock_inv), encoding="utf-8")

        script = Path(__file__).resolve().parent.parent.parent / "scripts" / "cloudru_teardown.py"
        cmd = [
            sys.executable,
            str(script),
            "--backup-file", str(self.backup_db),
            "--mock-inventory-file", str(mock_file),
            "--json",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"CLI dry run failed: {res.stderr}")
        data = json.loads(res.stdout)
        self.assertEqual(data["mode"], "DRY_RUN")
        self.assertFalse(data["executed"])
        self.assertFalse(data["zero_residual_confirmed"])
        self.assertEqual(data["total_monthly_rub_prevented"], 2160)

    def test_gate_blocks_corrupted_encrypted_backup_with_teardown_gate_error(self):
        corrupted_enc = self.tmp_path / "corrupted_backup.db.enc"
        corrupted_enc.write_bytes(b"gAAAAABnotvalidciphertext1234567890")
        corrupted_meta = self.tmp_path / "corrupted_backup.json"
        corrupted_meta.write_text(json.dumps({
            "timestamp_utc": "2026-11-05T00:00:00Z",
            "sha256_ciphertext": compute_sha256(corrupted_enc),
            "encrypted": True,
            "kdf_salt_hex": "0123456789abcdef",
            "kdf_iterations": 100000,
        }), encoding="utf-8")

        key_file = self.tmp_path / "valid.key"
        key_file.write_text(self.enc_key, encoding="utf-8")

        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(corrupted_enc, key_file=key_file)
        self.assertIn("ошибка расшифровки бэкапа", str(ctx.exception).lower())

    def test_gate_blocks_corrupted_sqlite_header_without_permission_error(self):
        corrupted_db = self.tmp_path / "corrupted_plain.db"
        corrupted_db.write_bytes(b"NOT_A_SQLITE_DATABASE_HEADER" * 10)
        corrupted_meta = self.tmp_path / "corrupted_plain.json"
        corrupted_meta.write_text(json.dumps({
            "timestamp_utc": "2026-11-05T00:00:00Z",
            "sha256": compute_sha256(corrupted_db),
            "encrypted": False,
        }), encoding="utf-8")

        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(corrupted_db)
        self.assertIn("целостности", str(ctx.exception).lower())
        self.assertTrue(corrupted_db.is_file())

    def test_gate_blocks_empty_key_file_with_teardown_gate_error(self):
        empty_key_file = self.tmp_path / "empty.key"
        empty_key_file.write_text("", encoding="utf-8")

        with self.assertRaises(TeardownGateError) as ctx:
            verify_backup_readiness(self.enc_backup_db, key_file=empty_key_file)
        self.assertIn("ошибка получения ключа", str(ctx.exception).lower())

    # --- Новые тесты для официального Cloud.ru Evolution IAM & REST API ---

    def test_evolution_iam_auth_and_bearer_token(self):
        """Проверяет официальный flow получения IAM Bearer токена в Cloud.ru Evolution."""
        requests_log = []

        def mock_requester(method, url, headers=None, body=None):
            requests_log.append({"method": method, "url": url, "headers": headers, "body": body})
            if "iam.api.cloud.ru" in url and url.endswith("/auth/token"):
                req_json = json.loads(body.decode("utf-8")) if body else {}
                if req_json.get("keyId") == "test-key-id" and req_json.get("secret") == "test-secret":
                    return 200, {"Content-Type": "application/json"}, {"access_token": "evo-jwt-token-xyz", "expires_in": 3600}
                return 401, {}, {"error": "Invalid credentials"}
            return 404, {}, {}

        client = CloudRuEvolutionClient(
            key_id="test-key-id",
            secret_key="test-secret",
            project_id="proj-123",
            http_requester=mock_requester,
        )
        token = client.authenticate()
        self.assertEqual(token, "evo-jwt-token-xyz")
        self.assertEqual(len(requests_log), 1)
        self.assertEqual(requests_log[0]["method"], "POST")
        self.assertIn("/auth/token", requests_log[0]["url"])

    def test_evolution_iam_auth_failure_raises_cloudru_api_error(self):
        def mock_requester(method, url, headers=None, body=None):
            return 401, {}, {"message": "Unauthorized keyId"}

        client = CloudRuEvolutionClient(
            key_id="bad-key",
            secret_key="bad-secret",
            project_id="proj-123",
            http_requester=mock_requester,
        )
        with self.assertRaises(CloudRuApiError) as ctx:
            client.authenticate()
        self.assertTrue("сбой" in str(ctx.exception).lower() or "401" in str(ctx.exception))

    def test_evolution_compute_vms_and_disks_inventory_success(self):
        """Проверяет корректный парсинг сущностей Evolution Compute API."""
        def mock_requester(method, url, headers=None, body=None):
            if "iam.api.cloud.ru" in url:
                return 200, {}, {"access_token": "valid-token"}
            auth_header = (headers or {}).get("Authorization", "")
            if auth_header != "Bearer valid-token":
                return 401, {}, {"error": "Missing or invalid bearer token"}

            if "/api/v1/vms" in url:
                return 200, {}, {
                    "items": [
                        {
                            "id": "vm-prod-1",
                            "name": "keto-app",
                            "status": "RUNNING",
                            "flavor": {"cpus": 1, "ram_mb": 2048},
                            "disks": [{"id": "disk-boot-1"}],
                        }
                    ]
                }
            elif "/api/v1/disks" in url:
                return 200, {}, {
                    "items": [
                        {
                            "id": "disk-boot-1",
                            "name": "keto-app-boot",
                            "size_gb": 30,
                            "is_boot": True,
                            "status": "IN_USE",
                        }
                    ]
                }
            elif "/api/v1/floating-ips" in url:
                return 200, {}, {"items": []}
            elif "/api/v1/snapshots" in url:
                return 200, {}, {"items": []}
            elif "/api/v1/images" in url:
                return 200, {}, {"items": []}
            elif "/virtual-ips" in url:
                return 200, {}, {"items": []}
            return 404, {}, {}

        client = CloudRuEvolutionClient(
            key_id="k-1",
            secret_key="s-1",
            project_id="p-1",
            http_requester=mock_requester,
        )
        inv = client.get_full_inventory()
        self.assertEqual(inv["total_resources_count"], 2)  # 1 VM + 1 Disk
        self.assertEqual(inv["instances"][0]["id"], "vm-prod-1")
        self.assertEqual(inv["volumes"][0]["id"], "disk-boot-1")
        self.assertFalse(inv["has_unconfirmed_costs"])
        self.assertFalse(inv["zero_residual_confirmed"])  # 2 active resources exist
        self.assertEqual(inv["audit_verdict"], "ACTIVE_RESOURCES_FOUND")

    def test_evolution_service_unauthorized_returns_unconfirmed_cost(self):
        """
        Требование P0: При 403 Forbidden или отсутствии прав API возвращает UNKNOWN/ERROR,
        а не пустой список, и помечает расходы как неподтверждённые!
        """
        def mock_requester(method, url, headers=None, body=None):
            if "iam.api.cloud.ru" in url:
                return 200, {}, {"access_token": "valid-token"}
            if "/api/v1/vms" in url:
                return 200, {}, {"items": []}
            if "/api/v1/disks" in url:
                # Сервис дисков вернул 403 Forbidden
                return 403, {}, {"error": "Permission denied: compute.disks.get"}
            return 200, {}, {"items": []}

        client = CloudRuEvolutionClient(
            key_id="k-1",
            secret_key="s-1",
            project_id="p-1",
            http_requester=mock_requester,
        )
        inv = client.get_full_inventory()
        # Проверяем, что ошибка не скрыта как '0 дисков'
        self.assertTrue(inv["has_unconfirmed_costs"])
        self.assertIn("disks", inv["unconfirmed_services"])
        self.assertEqual(inv["services"]["disks"]["status"], "UNAUTHORIZED")
        self.assertTrue(inv["services"]["disks"]["unconfirmed_cost"])
        self.assertFalse(inv["zero_residual_confirmed"])
        self.assertEqual(inv["audit_verdict"], "UNCONFIRMED_RISK_OF_EXPENSES")

    def test_evolution_network_timeout_returns_unknown_status(self):
        """Требование P0: При сетевой ошибке/таймауте возвращается статус NETWORK_ERROR и UNCONFIRMED_RISK."""
        def mock_requester(method, url, headers=None, body=None):
            if "iam.api.cloud.ru" in url:
                return 200, {}, {"access_token": "valid-token"}
            if "/api/v1/floating-ips" in url:
                raise CloudRuApiError("Сетевая ошибка при обращении к Cloud.ru API: Connection timed out")
            return 200, {}, {"items": []}

        client = CloudRuEvolutionClient(
            key_id="k-1",
            secret_key="s-1",
            project_id="p-1",
            http_requester=mock_requester,
        )
        inv = client.get_full_inventory()
        self.assertTrue(inv["has_unconfirmed_costs"])
        self.assertIn("floating_ips", inv["unconfirmed_services"])
        self.assertEqual(inv["services"]["floating_ips"]["status"], "NETWORK_ERROR")
        self.assertFalse(inv["zero_residual_confirmed"])
        self.assertEqual(inv["audit_verdict"], "UNCONFIRMED_RISK_OF_EXPENSES")

    def test_evolution_malformed_response_returns_unknown_status(self):
        """Требование P0: При неполном или искажённом ответе возвращается статус UNKNOWN/MALFORMED."""
        def mock_requester(method, url, headers=None, body=None):
            if "iam.api.cloud.ru" in url:
                return 200, {}, {"access_token": "valid-token"}
            if "/api/v1/snapshots" in url:
                # Некорректный dict без ключа items
                return 200, {}, {"unexpected_random_data": 123}
            return 200, {}, {"items": []}

        client = CloudRuEvolutionClient(
            key_id="k-1",
            secret_key="s-1",
            project_id="p-1",
            http_requester=mock_requester,
        )
        inv = client.get_full_inventory()
        self.assertTrue(inv["has_unconfirmed_costs"])
        self.assertIn("snapshots", inv["unconfirmed_services"])
        self.assertEqual(inv["services"]["snapshots"]["status"], "UNKNOWN")
        self.assertFalse(inv["zero_residual_confirmed"])

    def test_evolution_all_services_ok_and_zero_items_confirms_zero_residual(self):
        """
        Гарантия 0 ₽: подтверждение (zero_residual_confirmed=True) выдаётся ТОЛЬКО
        когда ВСЕ сервисы ответили OK и ни одного платного ресурса не найдено.
        """
        def mock_requester(method, url, headers=None, body=None):
            if "iam.api.cloud.ru" in url:
                return 200, {}, {"access_token": "valid-token"}
            return 200, {}, {"items": []}

        client = CloudRuEvolutionClient(
            key_id="k-1",
            secret_key="s-1",
            project_id="p-1",
            http_requester=mock_requester,
        )
        inv = client.get_full_inventory()
        self.assertFalse(inv["has_unconfirmed_costs"])
        self.assertEqual(inv["unconfirmed_services"], [])
        self.assertEqual(inv["total_resources_count"], 0)
        self.assertEqual(inv["total_monthly_rub"], 0)
        self.assertTrue(inv["zero_residual_confirmed"])
        self.assertEqual(inv["audit_verdict"], "VERIFIED_ZERO_RESOURCES")

    def test_cli_audit_only_flag_runs_without_backup_file(self):
        """Флаг --audit-only позволяет безопасно проверять API без требования файла бэкапа."""
        mock_inv = {
            "instances": [],
            "volumes": [],
            "floating_ips": [],
            "snapshots": [],
            "images": [],
            "virtual_ips": [],
            "services": {
                "vms": {"status": "OK", "items": []},
                "disks": {"status": "OK", "items": []},
                "floating_ips": {"status": "OK", "items": []},
                "snapshots": {"status": "OK", "items": []},
                "images": {"status": "OK", "items": []},
                "virtual_ips": {"status": "OK", "items": []},
            },
            "unconfirmed_services": [],
            "has_unconfirmed_costs": False,
            "total_resources_count": 0,
            "total_monthly_rub": 0,
            "zero_residual_confirmed": True,
            "audit_verdict": "VERIFIED_ZERO_RESOURCES",
            "source": "CLOUDRU_EVOLUTION_REST_API",
        }
        mock_file = self.tmp_path / "mock_clean.json"
        mock_file.write_text(json.dumps(mock_inv), encoding="utf-8")

        script = Path(__file__).resolve().parent.parent.parent / "scripts" / "cloudru_teardown.py"
        cmd = [
            sys.executable,
            str(script),
            "--audit-only",
            "--mock-inventory-file", str(mock_file),
            "--json",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, f"Audit-only failed: {res.stderr}")
        data = json.loads(res.stdout)
        self.assertEqual(data["audit_verdict"], "VERIFIED_ZERO_RESOURCES")
        self.assertTrue(data["zero_residual_confirmed"])


if __name__ == "__main__":
    unittest.main()
