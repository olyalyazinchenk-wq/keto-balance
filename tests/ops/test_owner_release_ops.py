import importlib.util
from contextlib import closing
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
os.environ['KETO_LOAD_DOTENV'] = '0'
from scripts.owner_backup_cycle import backup_cycle
from cryptography.fernet import Fernet

class OwnerReleaseOpsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / 'source.db'
        with closing(sqlite3.connect(self.source)) as conn:
            conn.execute('CREATE TABLE evidence (value TEXT)')
            conn.execute('INSERT INTO evidence VALUES (?)', ('synthetic only',))
            conn.commit()
        self.key = self.root / 'key.txt'
        self.key.write_bytes(Fernet.generate_key())
        self.key.chmod(0o600)

    def test_encrypted_quarter_hour_and_daily_copies_restore_exact_rows(self):
        before = self.source.read_bytes()
        receipt = backup_cycle(self.source, self.root / 'copies', self.key)
        self.assertTrue(receipt['encrypted'])
        self.assertFalse(receipt['offsite_confirmed'])
        targets = [self.root / 'copies' / receipt['file'], self.root / 'copies/daily' / receipt['daily_copy']]
        for index, target in enumerate(targets):
            self.assertFalse(target.read_bytes().startswith(b'SQLite format'))
            restored = self.root / f'restored-{index}.db'
            run = subprocess.run([sys.executable, str(ROOT / 'scripts/restore_db.py'), str(target), '--target', str(restored), '--key-file', str(self.key)], capture_output=True, text=True, env={**os.environ, 'KETO_LOAD_DOTENV': '0'}, timeout=30)
            self.assertEqual(run.returncode, 0, run.stderr + run.stdout)
            with closing(sqlite3.connect(restored)) as conn:
                self.assertEqual(conn.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
                self.assertEqual(conn.execute('SELECT value FROM evidence').fetchall(), [('synthetic only',)])
        self.assertEqual(self.source.read_bytes(), before)
        first_daily = targets[1].read_bytes()
        again = backup_cycle(self.source, self.root / 'copies', self.key)
        self.assertNotEqual(again['file'], receipt['file'])
        self.assertEqual(targets[1].read_bytes(), first_daily)

    def test_low_space_preserves_source_and_existing_copies(self):
        destination = self.root / 'copies'
        destination.mkdir()
        sentinel = destination / 'previous.db.enc'
        sentinel.write_bytes(b'existing ciphertext')
        with patch('scripts.owner_backup_cycle.shutil.disk_usage', return_value=type('Space', (), {'free': 1})()):
            with self.assertRaises(RuntimeError):
                backup_cycle(self.source, destination, self.key)
        self.assertEqual(sentinel.read_bytes(), b'existing ciphertext')
        self.assertEqual(list(destination.iterdir()), [sentinel])

    def test_test_audit_journal_is_outside_repo(self):
        with patch.dict(os.environ, {'KETO_TEST_ROOT': str(self.root)}):
            spec = importlib.util.spec_from_file_location('isolated_agent_ops', ROOT / 'scripts/agent_ops.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            module.log_agent_action('synthetic', module.ActionTier.AUTONOMOUS, 'OK', 'test')
            self.assertTrue(module.AUDIT_LOG_FILE.is_relative_to(self.root))
            self.assertIn('synthetic', module.AUDIT_LOG_FILE.read_text(encoding='utf-8'))

    def test_guard_rejects_protected_bind_before_real_socket_call(self):
        from tests.helpers import pilot_io_guard as guard
        original = len(guard.VIOLATIONS)
        try:
            with patch.object(guard, '_ORIGINAL_SOCKET_BIND') as real_bind:
                for address in [('127.0.0.1', 18081), ('127.0.0.1', 8000), ('0.0.0.0', 0)]:
                    with self.assertRaises(guard.AuditViolationError):
                        guard._guarded_socket_bind(object(), address)
                real_bind.assert_not_called()
                guard._guarded_socket_bind(object(), ('127.0.0.1', 0))
                real_bind.assert_called_once()
        finally:
            del guard.VIOLATIONS[original:]

    def test_guard_allows_local_readonly_uri_but_blocks_outside_and_remote(self):
        from tests.helpers import pilot_io_guard as guard
        original = len(guard.VIOLATIONS)
        try:
            with patch.object(guard, '_ALLOWED_ROOT', self.root):
                with closing(guard._guarded_sqlite_connect(self.source.as_uri() + '?mode=ro', uri=True)) as conn:
                    self.assertEqual(conn.execute('SELECT value FROM evidence').fetchone()[0], 'synthetic only')
                with patch.object(guard, '_ORIGINAL_SQLITE_CONNECT') as real_connect:
                    for uri in [(self.root.parent / 'outside.db').as_uri() + '?mode=ro', 'file://remotehost/data.db?mode=ro']:
                        with self.assertRaises(guard.AuditViolationError):
                            guard._guarded_sqlite_connect(uri, uri=True)
                    real_connect.assert_not_called()
        finally:
            del guard.VIOLATIONS[original:]

if __name__ == '__main__':
    unittest.main()
