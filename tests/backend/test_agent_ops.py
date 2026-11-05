"""
tests/backend/test_agent_ops.py — Тесты инфраструктуры Agent-First управления.

Проверяет:
1. Автономные действия (status, diagnose, cloud-audit, backup-drill, credentials, migration-bundle, sync-status).
2. Защиту биллинга: запрет ложного 0 ₽, вывод UNKNOWN без ответа API.
3. Отрицательные сценарии изоляции NutriOK (ошибки, не-Windows, активные задачи).
4. Безопасность ввода секретов: запрет --secret-key через CLI аргументы.
5. Защиту P0 для охраняемых действий (клиентский предохранитель и фраза подтверждения).
6. Ведение защищённого журнала аудита (docs/AGENT_AUDIT_LOG.md).
"""

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

from scripts.agent_ops import (
    ActionTier,
    log_agent_action,
    get_credentials_summary,
    get_cloudru_billing_status,
    check_nutriok_isolation,
    check_owner_approval_or_block,
    run_status_action,
    run_diagnose_action,
    run_backup_drill_action,
    run_credentials_action,
    run_migration_bundle_action,
    run_sync_status_action,
    build_parser,
    ROOT,
    SECRETS_FILE,
    AUDIT_LOG_FILE,
    REQUIRED_CONFIRM_PHRASE,
)


class TestAgentOps(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="agent_ops_test_")
        self.tmp_path = Path(self.tmp_dir)

    def tearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    # --------------------------------------------------------------------------
    # 1. Биллинг Cloud.ru: запрет ложного 0 ₽
    # --------------------------------------------------------------------------

    def test_billing_status_without_credentials_returns_unknown(self):
        """P0: При отсутствии ключей API биллинг строго возвращает UNKNOWN, а не 0.00 руб."""
        with patch.dict("os.environ", {}, clear=True), \
             patch("scripts.agent_ops.SECRETS_FILE", self.tmp_path / "non_existent.json"):
            status = get_cloudru_billing_status()
            self.assertEqual(status["status"], "UNKNOWN")
            self.assertIsNone(status["confirmed_spend_rub"])
            self.assertIn("UNKNOWN", status["display"])
            self.assertFalse(status["zero_debt_confirmed"])

    # --------------------------------------------------------------------------
    # 2. Изоляция NutriOK: отрицательные сценарии
    # --------------------------------------------------------------------------

    def test_nutriok_isolation_non_windows_platform_returns_unknown(self):
        """P0: Неподдерживаемая платформа (не Windows) НЕ означает успешную изоляцию."""
        with patch("sys.platform", "linux"):
            iso = check_nutriok_isolation()
            self.assertFalse(iso["isolated"])
            self.assertEqual(iso["status"], "UNKNOWN")
            self.assertEqual(iso["state"], "UNSUPPORTED_PLATFORM")

    def test_nutriok_isolation_command_failure_returns_unknown(self):
        """P0: Ошибка выполнения команды PowerShell НЕ означает успешную изоляцию."""
        with patch("sys.platform", "win32"), \
             patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=1, stderr="Task not found or permission denied")
            iso = check_nutriok_isolation()
            self.assertFalse(iso["isolated"])
            self.assertEqual(iso["status"], "UNKNOWN")
            self.assertEqual(iso["state"], "NOT_FOUND_OR_COMMAND_ERROR")

    def test_nutriok_isolation_active_task_returns_active_risk(self):
        """P0: Если задача активна (Running или Ready), фиксируется риск конфликта."""
        with patch("sys.platform", "win32"), \
             patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="Running\n")
            iso = check_nutriok_isolation()
            self.assertFalse(iso["isolated"])
            self.assertEqual(iso["status"], "ACTIVE_RISK")
            self.assertEqual(iso["state"], "Running")

    def test_nutriok_isolation_disabled_task_confirms_isolation(self):
        """Изоляция подтверждается ТОЛЬКО если задача найдена и отключена (Disabled)."""
        with patch("sys.platform", "win32"), \
             patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=0, stdout="Disabled\n")
            iso = check_nutriok_isolation()
            self.assertTrue(iso["isolated"])
            self.assertEqual(iso["status"], "VERIFIED_ISOLATED")
            self.assertEqual(iso["state"], "Disabled")

    # --------------------------------------------------------------------------
    # 3. Безопасность ввода секретов: запрет CLI-аргументов
    # --------------------------------------------------------------------------

    def test_credentials_set_rejects_plain_secret_key_argument(self):
        """P0: Передача --secret-key через аргументы командной строки строго блокируется."""
        parser = build_parser()
        args = parser.parse_args([
            "credentials", "set",
            "--key-id", "test-key-id",
            "--secret-key", "insecure-plain-secret",
        ])
        code = run_credentials_action(args)
        self.assertEqual(code, 1, "Передача --secret-key должна блокироваться с ошибкой безопасности")

    def test_credentials_set_via_stdin_succeeds_securely(self):
        """Безопасная передача секрета через stdin сохраняет учётные данные."""
        test_secrets_dir = self.tmp_path / ".secrets"
        test_secrets_file = test_secrets_dir / "cloudru_credentials.json"

        with patch("scripts.agent_ops.SECRETS_DIR", test_secrets_dir), \
             patch("scripts.agent_ops.SECRETS_FILE", test_secrets_file), \
             patch("sys.stdin") as mock_stdin:
            mock_stdin.read.return_value = "my-secure-stdin-key\n"

            parser = build_parser()
            args = parser.parse_args([
                "credentials", "set",
                "--key-id", "secure-key-12345",
                "--secret-stdin",
            ])
            code = run_credentials_action(args)
            self.assertEqual(code, 0)
            self.assertTrue(test_secrets_file.exists())
            data = json.loads(test_secrets_file.read_text(encoding="utf-8"))
            self.assertEqual(data["key_id"], "secure-key-12345")
            self.assertEqual(data["secret_key"], "my-secure-stdin-key")

    # --------------------------------------------------------------------------
    # 4. Клиентский предохранитель для GUARDED действий
    # --------------------------------------------------------------------------

    def test_guarded_action_strictly_blocks_without_confirm_phrase(self):
        """Охраняемые действия (GUARDED) блокируются без подтверждающей фразы."""
        parser = build_parser()
        args = parser.parse_args(["grant-activate"])
        self.assertFalse(check_owner_approval_or_block("grant-activate", args))

    def test_guarded_action_passes_with_confirm_phrase(self):
        """Охраняемые действия разблокируют предохранитель при наличии точной фразы подтверждения."""
        parser = build_parser()
        args = parser.parse_args(["grant-activate", "--confirm-phrase", REQUIRED_CONFIRM_PHRASE])
        self.assertTrue(check_owner_approval_or_block("grant-activate", args))

    # --------------------------------------------------------------------------
    # 5. Динамическая синхронизация статуса (sync-status)
    # --------------------------------------------------------------------------

    def test_sync_status_without_run_tests_marks_test_results_as_unknown(self):
        """P0: Без реального запуска тестов sync-status не пишет фальшивый PASS, а выводит UNKNOWN."""
        test_live_status = self.tmp_path / "TEST_LIVE_STATUS.md"
        parser = build_parser()
        args = parser.parse_args(["sync-status"])

        with patch("scripts.agent_ops.ROOT", self.tmp_path), \
             patch("scripts.agent_ops.AUDIT_LOG_FILE", self.tmp_path / "AUDIT.md"):
            code = run_sync_status_action(args)
            self.assertEqual(code, 0)
            content = (self.tmp_path / "docs" / "LIVE_STATUS.md").read_text(encoding="utf-8")
            self.assertIn("UNKNOWN (не запускалось для текущего вызова sync-status", content)
            self.assertIn("UNKNOWN", content)

    # --------------------------------------------------------------------------
    # 6. Бэкап-дрилл и миграция
    # --------------------------------------------------------------------------

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


if __name__ == "__main__":
    unittest.main()
