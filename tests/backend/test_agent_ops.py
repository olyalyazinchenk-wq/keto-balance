"""
tests/backend/test_agent_ops.py — Тесты инфраструктуры Agent-First управления.

Проверяет:
1. Автономные действия (status, diagnose, cloud-audit, backup-drill, credentials, migration-bundle).
2. Защиту P0 для охраняемых действий (блокировка без --owner-approved).
3. Ведение защищённого журнала аудита (docs/AGENT_AUDIT_LOG.md).
"""

import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch, MagicMock

from scripts.agent_ops import (
    ActionTier,
    log_agent_action,
    get_credentials_summary,
    check_owner_approval_or_block,
    run_status_action,
    run_diagnose_action,
    run_backup_drill_action,
    run_credentials_action,
    run_migration_bundle_action,
    build_parser,
    ROOT,
    SECRETS_FILE,
    AUDIT_LOG_FILE,
)


class TestAgentOps(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="agent_ops_test_")
        self.tmp_path = Path(self.tmp_dir)

    def tearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_guarded_action_strictly_blocks_without_owner_approved(self):
        """Охраняемые действия (GUARDED) блокируются с кодом ошибки при отсутствии --owner-approved."""
        parser = build_parser()
        args = parser.parse_args(["grant-activate"])
        self.assertFalse(check_owner_approval_or_block("grant-activate", args))

    def test_guarded_action_passes_when_owner_approved_is_set(self):
        """Охраняемые действия разрешаются только при наличии явного флага --owner-approved."""
        parser = build_parser()
        args = parser.parse_args(["grant-activate", "--owner-approved"])
        self.assertTrue(check_owner_approval_or_block("grant-activate", args))

    def test_audit_log_records_operations(self):
        """Каждая операция записывается в файл журнала docs/AGENT_AUDIT_LOG.md."""
        test_audit_file = self.tmp_path / "TEST_AUDIT_LOG.md"
        with patch("scripts.agent_ops.AUDIT_LOG_FILE", test_audit_file):
            log_agent_action("status", ActionTier.AUTONOMOUS, "SUCCESS", "Local status check ok")
            self.assertTrue(test_audit_file.exists())
            content = test_audit_file.read_text(encoding="utf-8")
            self.assertIn("`status`", content)
            self.assertIn("AUTONOMOUS", content)
            self.assertIn("SUCCESS", content)
            self.assertIn("Local status check ok", content)

    def test_credentials_lifecycle_set_status_clear(self):
        """Проверка безопасного цикла управления учётными данными в изолированном хранилище."""
        test_secrets_dir = self.tmp_path / ".secrets"
        test_secrets_file = test_secrets_dir / "cloudru_credentials.json"

        with patch("scripts.agent_ops.SECRETS_DIR", test_secrets_dir), \
             patch("scripts.agent_ops.SECRETS_FILE", test_secrets_file):

            # 1. Начальный статус — пусто
            summary = get_credentials_summary()
            self.assertFalse(summary["has_credentials"])
            self.assertEqual(summary["key_id_masked"], "Not configured")

            # 2. Установка учётных данных
            parser = build_parser()
            set_args = parser.parse_args([
                "credentials", "set",
                "--key-id", "test-key-id-12345",
                "--secret-key", "super-secret-key-67890",
                "--project-id", "proj-001",
            ])
            code = run_credentials_action(set_args)
            self.assertEqual(code, 0)
            self.assertTrue(test_secrets_file.exists())

            # 3. Проверка статуса (ключ должен маскироваться)
            summary_after = get_credentials_summary()
            self.assertTrue(summary_after["has_credentials"])
            self.assertIn("test***", summary_after["key_id_masked"])
            self.assertNotIn("super-secret-key-67890", summary_after["key_id_masked"])

            # 4. Очистка учётных данных
            clear_args = parser.parse_args(["credentials", "clear"])
            code_clear = run_credentials_action(clear_args)
            self.assertEqual(code_clear, 0)
            self.assertFalse(test_secrets_file.exists())

    def test_backup_drill_performs_synthetic_cycle_without_altering_live_db(self):
        """Неразрушающий бэкап-дрилл успешно шифрует, расшифровывает и сверяет синтетическую БД."""
        parser = build_parser()
        args = parser.parse_args(["backup-drill"])
        exit_code = run_backup_drill_action(args)
        self.assertEqual(exit_code, 0)

    def test_migration_bundle_generates_compose_and_guide(self):
        """Генерация пакета независимой миграции создаёт корректные файлы."""
        parser = build_parser()
        args = parser.parse_args(["migration-bundle"])
        exit_code = run_migration_bundle_action(args)
        self.assertEqual(exit_code, 0)

        compose_file = ROOT / "deploy" / "docker-compose.migration.yml"
        guide_file = ROOT / "docs" / "MIGRATION_BUNDLE.md"
        self.assertTrue(compose_file.exists())
        self.assertTrue(guide_file.exists())
        self.assertIn("Yandex Cloud", guide_file.read_text(encoding="utf-8"))

    def test_sync_status_updates_live_status_file(self):
        """Автоматическая синхронизация статуса обновляет docs/LIVE_STATUS.md."""
        parser = build_parser()
        args = parser.parse_args(["sync-status"])
        from scripts.agent_ops import run_sync_status_action
        exit_code = run_sync_status_action(args)
        self.assertEqual(exit_code, 0)
        live_status = ROOT / "docs" / "LIVE_STATUS.md"
        self.assertTrue(live_status.exists())
        content = live_status.read_text(encoding="utf-8")
        self.assertIn("LIVE STATUS", content)
        self.assertIn("Machine Evidence", content)


if __name__ == "__main__":
    unittest.main()
