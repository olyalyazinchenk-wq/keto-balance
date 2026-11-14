import os
os.environ['KETO_LOAD_DOTENV'] = '0'
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from bot.app_settings import AppSettings
from bot.app_db import create_or_get_user
from bot.auth import generate_telegram_init_data
from bot.server import create_app

KEY = 'synthetic-pilot-signing-key-not-a-telegram-token'
SCRATCH = Path(os.environ.get('KETO_TEST_ROOT') or (Path(os.environ.get('LOCALAPPDATA', tempfile.gettempdir())) / 'hermes' / 'cache' / 'scratch'))

class TestPilotAuthRegressions(unittest.TestCase):
    def setUp(self):
        SCRATCH.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='pilot-auth-', dir=SCRATCH)
        self.root = Path(self.temp.name)
        self.db = self.root / 'fixture.db'
        create_or_get_user(1001, username='synthetic_a', db_path=self.db)
        create_or_get_user(1002, username='synthetic_b', db_path=self.db)
        self.clients = []

    def tearDown(self):
        for client in self.clients:
            client.close()
        self.temp.cleanup()

    def client(self, stage='production', preview=False, key=KEY):
        settings = AppSettings(
            app_stage=stage, telegram_bot_token=key,
            allow_anonymous_preview=preview, db_path=self.db,
            dist_dir=self.root, released_recipe_ids=frozenset(),
        )
        app = create_app(dist_dir=self.root, db_path=self.db, settings=settings)
        client = TestClient(app)
        self.clients.append(client)
        return client

    def test_unverified_identity_never_authorizes_personal_routes(self):
        writes = {
            'schema_version': 1, 'expected_revision': 0,
            'profile': {'settings': None, 'goal': 'synthetic'}, 'state': None,
        }
        cases = [
            ('get', '/api/user', {}),
            ('get', '/api/user?user_id=1001', {}),
            ('get', '/api/user', {'headers': {'X-User-Id': '1001'}}),
            ('put', '/api/user?user_id=1001', {'json': writes}),
            ('get', '/api/shopping?user_id=1001', {}),
            ('put', '/api/shopping?user_id=1001', {'json': {
                'schema_version': 1, 'expected_revision': 0, 'items': []}}),
            ('get', '/api/user/data?user_id=1001', {}),
            ('delete', '/api/user/data?user_id=1001', {}),
        ]
        for stage in ('production', 'k2-pilot'):
            for preview in (False, True):
                client = self.client(stage, preview)
                for method, path, kwargs in cases:
                    with self.subTest(stage=stage, preview=preview, method=method, path=path):
                        response = getattr(client, method)(path, **kwargs)
                        self.assertEqual(response.status_code, 401)

    def test_unsigned_magic_strings_never_create_sessions(self):
        for stage in ('production', 'k2-pilot'):
            for preview in (False, True):
                client = self.client(stage, preview)
                for value in ('', 'test_init_data&user_id=1001', 'mock_user&user_id=1001'):
                    for endpoint in ('/api/session', '/api/auth/validate'):
                        with self.subTest(stage=stage, preview=preview, endpoint=endpoint, value=value):
                            response = client.post(endpoint, json={'init_data': value})
                            self.assertEqual(response.status_code, 401)

    def test_missing_signing_key_does_not_enable_guest(self):
        for stage in ('production', 'k2-pilot', 'test'):
            with self.subTest(stage=stage):
                response = self.client(stage, True, '').post('/api/session', json={'init_data': ''})
                self.assertEqual(response.status_code, 503)

    def test_both_claimed_ids_must_match_verified_session(self):
        client = self.client()
        signed = generate_telegram_init_data({'id': 1001, 'first_name': 'Synthetic'}, KEY)
        session = client.post('/api/session', json={'init_data': signed})
        self.assertEqual(session.status_code, 200)
        token = session.json()['session_token']
        headers = {'Authorization': 'Bearer ' + token, 'X-User-Id': '1002'}
        response = client.get('/api/user?user_id=1001', headers=headers)
        self.assertEqual(response.status_code, 403)

    def test_valid_signed_name_containing_mock_is_not_a_bypass_or_rejected(self):
        client = self.client()
        signed = generate_telegram_init_data({'id': 1001, 'first_name': 'synthetic_mock_name'}, KEY)
        response = client.post('/api/session', json={'init_data': signed})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['user_id'], 1001)

    def test_malformed_authorization_does_not_fall_back_to_guest(self):
        for stage in ('production', 'k2-pilot'):
            for header in ('Basic synthetic', 'Bearer ', 'Bearer invalid-synthetic-token'):
                with self.subTest(stage=stage, header=header):
                    response = self.client(stage, True).get('/api/user', headers={'Authorization': header})
                    self.assertEqual(response.status_code, 401)

if __name__ == '__main__':
    unittest.main()
