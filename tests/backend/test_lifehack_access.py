"""The user-provided author text must never become a client prescription."""
import json
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from bot.app_db import create_session, save_user_subscription
from bot.app_settings import AppSettings
from bot.server import create_app

class TestLifehackAccess(unittest.TestCase):
    def test_author_copy_only_owner_client_has_no_original_schema(self):
        with tempfile.TemporaryDirectory(prefix='lifehack-api-') as tmp:
            db = Path(tmp) / 'test.db'
            dist = Path(tmp) / 'dist'; dist.mkdir()
            catalog = json.loads((Path(__file__).parents[1] / 'fixtures/pilot/catalog.json').read_text())
            settings = AppSettings(app_stage='test', access_mode='public', db_path=db, dist_dir=dist)
            client = TestClient(create_app(settings=settings, db_path=db, dist_dir=dist, catalog_provider=lambda:catalog))
            create_session(42, 'synthetic-owner-lifehack', db_path=db)
            create_session(43, 'synthetic-reader-lifehack', db_path=db)
            save_user_subscription(db, 43, 'premium', 'active', (datetime.now(timezone.utc)+timedelta(days=1)).isoformat())
            data = json.loads((Path(__file__).parents[2] / 'docs/content/educational-guides.json').read_text())
            original = next(g for g in data if g['id'] == 'lifehack_olga_original')
            self.assertEqual(original['editorial_status'], 'draft_for_owner_review')
            for headers in [{}, {'Authorization':'Bearer synthetic-reader-lifehack'}]:
                response = client.get('/api/education/guides', headers=headers)
                self.assertEqual(response.status_code, 200)
                self.assertNotIn('lifehack_olga_original', [g['id'] for g in response.json()['guides']])
            owner_settings = AppSettings(app_stage='staging', access_mode='owner', owner_allowlist=frozenset({42}), db_path=db, dist_dir=dist)
            owner_client = TestClient(create_app(settings=owner_settings, db_path=db, dist_dir=dist, catalog_provider=lambda:catalog))
            owner = owner_client.get('/api/education/guides', headers={'Authorization':'Bearer synthetic-owner-lifehack'})
            self.assertEqual(owner.status_code, 200)
            copy = next(g for g in owner.json()['guides'] if g['id']=='lifehack_olga_original')
            self.assertEqual(copy['content'], original['content'])
            self.assertEqual(copy['sources'], [])
