import hashlib
from contextlib import closing
import json
import os
os.environ['KETO_LOAD_DOTENV'] = '0'
from pathlib import Path
import sqlite3
import tempfile
import unittest

from scripts.rehearse_support_migration import rehearse


class TestSupportMigrationRehearsal(unittest.TestCase):
    def test_new_copy_migration_preserves_legacy_source_and_old_rows(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); source = root / 'legacy.db'; dest = root / 'rehearsal.db'
            with closing(sqlite3.connect(source)) as conn:
                conn.execute('CREATE TABLE users(user_id INTEGER PRIMARY KEY, first_name TEXT)')
                conn.execute('CREATE TABLE support_tickets(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(user_id),topic TEXT,message TEXT,contact TEXT,status TEXT,created_at TEXT)')
                conn.execute("INSERT INTO users VALUES(42, 'Synthetic')")
                conn.execute("INSERT INTO support_tickets VALUES(1,42,'general','Synthetic private text','','open','2026-11-01 00:00:00')")
                conn.commit()
            before = hashlib.sha256(source.read_bytes()).hexdigest()
            result = rehearse(source,dest)
            self.assertTrue(result['passed'])
            self.assertEqual(result['old_reader_rows'],1)
            self.assertTrue(result['idempotent'])
            self.assertEqual(before,hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertNotIn('Synthetic private text',json.dumps(result))
            with closing(sqlite3.connect(dest)) as conn:
                self.assertEqual(conn.execute('SELECT recipient_id,scope FROM support_reviews').fetchone(),(42,'personal'))
            with self.assertRaises(ValueError): rehearse(source,source)
            with self.assertRaises(ValueError): rehearse(source,dest)
