"""Personal measurements: session isolation, validation, CAS and data rights.

Only synthetic accounts and a temporary SQLite database are used.
"""
import json
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from bot.app_db import create_session, get_db_connection, init_db, StaleRevisionError
from bot.progress import ProgressWrite, save_progress
from bot.app_settings import AppSettings
from bot.server import create_app


class ProgressTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='keto-progress-test-')
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.db = root / 'synthetic.db'
        dist = root / 'dist'; dist.mkdir()
        catalog = json.loads((Path(__file__).parents[1] / 'fixtures/pilot/catalog.json').read_text())
        settings = AppSettings(app_stage='test', access_mode='public', db_path=self.db, dist_dir=dist)
        self.client = TestClient(create_app(settings=settings, db_path=self.db, dist_dir=dist, catalog_provider=lambda: catalog))
        create_session(101, 'synthetic-progress-a', db_path=self.db)
        create_session(102, 'synthetic-progress-b', db_path=self.db)
        self.a = {'Authorization': 'Bearer synthetic-progress-a'}
        self.b = {'Authorization': 'Bearer synthetic-progress-b'}
        self.today = datetime.now(timezone(timedelta(hours=3))).date().isoformat()

    def payload(self, revision=0, **entry):
        return {'age': 40, 'entry': {'date': self.today, 'weight': 80.5, 'waist': 90, **entry}, 'expected_revision': revision, 'consent': True}

    def test_auth_and_initial_state(self):
        self.assertEqual(self.client.get('/api/progress').status_code, 401)
        self.assertEqual(self.client.put('/api/progress', json=self.payload()).status_code, 401)
        self.assertEqual(self.client.get('/api/progress', headers=self.a).json(), {'age': None, 'height_cm': None, 'entries': [], 'revision': 0})

    def test_upsert_persistence_isolation_and_conflict(self):
        response = self.client.put('/api/progress', headers=self.a, json=self.payload())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['revision'], 1)
        self.assertEqual(self.client.get('/api/progress', headers=self.a).json()['entries'][0]['waist'], 90)
        self.assertEqual(self.client.get('/api/progress', headers=self.b).json()['entries'], [])
        stale = self.client.put('/api/progress', headers=self.a, json=self.payload(weight=79))
        self.assertEqual(stale.status_code, 409)
        updated = self.client.put('/api/progress', headers=self.a, json=self.payload(1, weight=79)).json()
        self.assertEqual(len(updated['entries']), 1)
        self.assertEqual(updated['entries'][0]['weight'], 79)
        self.assertEqual(updated['revision'], 2)
        spoofed = self.payload(2); spoofed['user_id'] = 102
        self.assertEqual(self.client.put('/api/progress', headers=self.a, json=spoofed).status_code, 422)
        self.assertEqual(self.client.get('/api/progress?user_id=102', headers=self.a).status_code, 403)

    def test_height_roundtrip_and_legacy_writes_preserve_it(self):
        with get_db_connection(self.db) as conn:
            conn.execute('ALTER TABLE progress_profiles DROP COLUMN height_cm')
            conn.execute('INSERT INTO progress_profiles(user_id,age,revision) VALUES (101,40,0)')
        init_db(self.db, force=True)
        self.assertEqual(self.client.get('/api/progress', headers=self.a).json()['age'], 40)

        payload = {**self.payload(), 'height_cm': 168.5}
        saved = self.client.put('/api/progress', headers=self.a, json=payload)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()['height_cm'], 168.5)
        self.assertIsNone(self.client.get('/api/progress', headers=self.b).json()['height_cm'])

        legacy = self.client.put('/api/progress', headers=self.a, json=self.payload(revision=1, weight=79))
        self.assertEqual(legacy.json()['height_cm'], 168.5)
        for invalid in [True, 79, 251, '168.5']:
            result = self.client.put('/api/progress', headers=self.a, json={**self.payload(revision=2), 'height_cm': invalid})
            self.assertEqual(result.status_code, 422)
        cleared = self.client.put('/api/progress', headers=self.a, json={**self.payload(revision=2), 'height_cm': None})
        self.assertIsNone(cleared.json()['height_cm'])

    def test_validation_and_explicit_consent(self):
        bad = [dict(age=17), dict(age=121), dict(consent=False), dict(expected_revision=-1)]
        for change in bad:
            body = self.payload(); body.update(change)
            self.assertEqual(self.client.put('/api/progress', headers=self.a, json=body).status_code, 422, change)
        for entry in [{'weight': 0}, {'weight': 401}, {'waist': 0}, {'chest': 301}, {'weight': 'NaN'}, {'date':'2099-01-01'}, {'date':'1899-01-01'}, {'date':'2026-02-30'}, {'weight': None, 'waist': None}]:
            self.assertEqual(self.client.put('/api/progress', headers=self.a, json=self.payload(**entry)).status_code, 422, entry)
        self.assertEqual(self.client.get('/api/progress', headers=self.a).json()['entries'], [])

    def test_sort_and_sparse_measurements(self):
        body = self.payload(date='2020-02-01', weight=None, waist=85)
        self.assertEqual(self.client.put('/api/progress', headers=self.a, json=body).status_code, 200)
        response = self.client.put('/api/progress', headers=self.a, json=self.payload(1, date='2020-01-01', chest=100)).json()
        self.assertEqual([e['date'] for e in response['entries']], ['2020-01-01','2020-02-01'])

    def test_delete_requires_current_revision_and_own_record(self):
        self.client.put('/api/progress', headers=self.a, json=self.payload())
        path = '/api/progress/' + self.today
        self.assertEqual(self.client.delete(path + '?expected_revision=0', headers=self.a).status_code, 409)
        self.assertEqual(self.client.delete(path + '?expected_revision=0', headers=self.b).status_code, 404)
        deleted = self.client.delete(path + '?expected_revision=1', headers=self.a)
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()['entries'], [])
        self.assertEqual(deleted.json()['revision'], 2)

    def test_export_consent_and_account_erasure(self):
        self.client.put('/api/progress', headers=self.a, json=self.payload())
        exported = self.client.get('/api/user/data', headers=self.a).json()
        self.assertEqual(exported['progress']['entries'][0]['weight'], 80.5)
        self.assertTrue(any(c['consent_type']=='body_progress' and c['granted'] for c in exported['consents']))
        self.assertEqual(self.client.delete('/api/user/data', headers=self.a).status_code, 200)
        self.assertEqual(self.client.get('/api/progress', headers=self.a).status_code, 401)
        with get_db_connection(self.db) as conn:
            for table in ['progress_profiles', 'progress_entries']:
                self.assertEqual(conn.execute(f'SELECT COUNT(*) FROM {table} WHERE user_id=101').fetchone()[0], 0)

    def test_additive_schema_preserves_existing_data_and_reinitializes(self):
        self.client.put('/api/progress', headers=self.a, json=self.payload())
        init_db(self.db, force=True)
        self.assertEqual(self.client.get('/api/progress', headers=self.a).json()['entries'][0]['weight'], 80.5)

    def test_parallel_stale_updates_never_silently_overwrite(self):
        barrier = Barrier(2)
        def save(value):
            body = ProgressWrite.model_validate(self.payload(weight=value))
            barrier.wait()
            try:
                return save_progress(101, body, self.db)['revision']
            except StaleRevisionError:
                return 'conflict'
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(save, [80, 81]))
        self.assertCountEqual(results, [1, 'conflict'])
        saved = self.client.get('/api/progress', headers=self.a).json()
        self.assertEqual(saved['revision'], 1)
        self.assertEqual(len(saved['entries']), 1)
        self.assertIn(saved['entries'][0]['weight'], [80, 81])

    def test_private_cache_headers_and_header_spoofing(self):
        self.assertEqual(self.client.get('/api/progress', headers=self.a).headers.get('Cache-Control'), 'no-store')
        self.assertEqual(self.client.put('/api/progress', headers=self.a, json=self.payload()).headers.get('Cache-Control'), 'no-store')
        self.assertEqual(self.client.get('/api/progress', headers={**self.a, 'x-user-id':'102'}).status_code, 403)
        self.assertEqual(self.client.get('/api/progress', headers={'Authorization':'Bearer missing'}).status_code, 401)
