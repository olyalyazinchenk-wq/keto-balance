"""Regression cases reproduced by independent review before these guards."""
import calendar
import json
import os
os.environ['KETO_LOAD_DOTENV'] = '0'
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import patch, mock_open
from bot.app_db import create_session, save_pilot_user, save_user_subscription
from bot.app_settings import AppSettings
from bot.catalog import CatalogService
from bot.server import create_app


class TestPublicProductBoundaries(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.db = self.root / 'boundary.db'
        self.dist = self.root / 'dist'; self.dist.mkdir()
        self.catalog = json.loads((Path(__file__).parents[1] / 'fixtures/pilot/catalog.json').read_text(encoding='utf-8'))
        self.catalog['test_only'] = False
        self.catalog['recipes'].append({**self.catalog['recipes'][0], 'id':'k6'})
        self.catalog['released_ids'].append('k6')
        settings = AppSettings(app_stage='pilot', access_mode='public', db_path=self.db, dist_dir=self.dist)
        self.client = TestClient(create_app(settings=settings, db_path=self.db, dist_dir=self.dist, catalog_provider=lambda:self.catalog))
        create_session(42, 'free-token', db_path=self.db)
        self.headers = {'Authorization':'Bearer free-token'}

    def tearDown(self): self.tmp.cleanup()

    def menu_payload(self, days=30, recipe='k2'):
        return {'schema_version':1,'expected_revision':0,'profile':{'settings':{
            'confirmed18Plus':True,'approach':'keto','restrictions':[],'prepTimeMax':240,
            'mealsPerDay':2,'planDays':days,'month':'2026-11'}},'state':{
            'schema_version':1,'selected_date':'2026-11-01','menu':{'mode':'keto','numDays':days,'meals':2,
            'portion':1,'saved':True,'created':1793491200000,'catalog_id':self.catalog['catalog_id'],
            'month':'2026-11','days':[{'date':f'2026-11-{i:02d}','slots':{'breakfast':'k1','dinner':recipe}} for i in range(1,days+1)]}}}

    def test_free_cannot_write_monthly_but_can_save_introductory_day(self):
        self.assertFalse(self.client.get('/api/subscription',headers=self.headers).json()['is_premium'])
        self.assertEqual(self.client.put('/api/user',json=self.menu_payload(),headers=self.headers).status_code,403)
        self.assertEqual(self.client.put('/api/user',json=self.menu_payload(1),headers=self.headers).status_code,200)

    def test_expired_saved_menu_is_readable_and_markable_but_new_swap_is_not(self):
        payload = self.menu_payload()
        result = save_pilot_user(42, payload, db_path=self.db)
        payload['expected_revision'] = result['revision']
        payload['state']['selected_date'] = '2026-11-02'
        self.assertEqual(self.client.put('/api/user',json=payload,headers=self.headers).status_code,200)
        self.assertEqual(self.client.get('/api/user',headers=self.headers).json()['state']['menu']['numDays'],30)
        payload['expected_revision'] += 1
        payload['state']['menu']['days'][0]['slots']['dinner'] = 'k3'
        self.assertEqual(self.client.put('/api/user',json=payload,headers=self.headers).status_code,403)

    def test_free_catalog_five_but_saved_history_recipes_remain_accessible(self):
        self.assertEqual(len(self.client.get('/api/catalog').json()['recipes']),5)
        self.assertEqual(self.client.get('/api/recipes/k6',headers=self.headers).status_code,403)
        save_pilot_user(42,self.menu_payload(recipe='k6'),db_path=self.db)
        self.assertEqual(self.client.get('/api/recipes/k6',headers=self.headers).status_code,200)
        self.assertEqual(len(self.client.get('/api/catalog',headers=self.headers).json()['recipes']),6)

    def test_paid_access_has_catalog_and_month_until_expiry(self):
        save_user_subscription(self.db,42,'premium','active',(datetime.now(timezone.utc)+timedelta(days=1)).isoformat())
        self.assertEqual(len(self.client.get('/api/catalog',headers=self.headers).json()['recipes']),6)
        self.assertEqual(self.client.put('/api/user',json=self.menu_payload(),headers=self.headers).status_code,200)

    def test_future_draft_catalog_never_publicly_exposed(self):
        cid = 'released-catalog-202701-draft'
        (self.dist / f'{cid}.json').write_text(json.dumps({**self.catalog,'catalog_id':cid,'editorial_status':'draft_for_owner_review'}),encoding='utf-8')
        self.assertEqual(self.client.get('/api/catalog',params={'catalog_id':cid}).status_code,403)
        self.assertEqual(self.client.get('/api/recipes/k1',params={'catalog_id':cid}).status_code,404)

    def test_approved_carnivore_lookup_matches_listing_without_prefix_rule(self):
        approved = {'schema_version':1,'catalog_id':'approved-carnivore-test','released_ids':['c100'],
            'public_released_ids':['c100'],'recipes':[{'id':'c100','mode':'carnivore','editorial_status':'approved'}]}
        service = CatalogService(self.dist,provider=lambda:approved)
        self.assertEqual(service.get_recipe_by_id('c100')['id'],'c100')
        approved['recipes'][0]['editorial_status'] = 'review'; service.invalidate_cache()
        self.assertIsNone(service.get_recipe_by_id('c100'))

    def test_free_guides_two_premium_all_and_unapproved_never_public(self):
        guide_path = Path(__file__).parents[2] / 'docs/content/educational-guides.json'
        guides = json.loads(guide_path.read_text(encoding='utf-8'))
        self.assertEqual(self.client.get('/api/education/guides').json()['count'],0)
        approved = [{**g, 'editorial_status':'approved'} for g in guides]
        # Explicit synthetic approved fixtures; no production content is modified.
        with patch('builtins.open',mock_open(read_data=json.dumps(approved))):
            self.assertEqual(self.client.get('/api/education/guides').json()['count'],2)
            save_user_subscription(self.db,42,'premium','active',(datetime.now(timezone.utc)+timedelta(days=1)).isoformat())
            self.assertEqual(self.client.get('/api/education/guides',headers=self.headers).json()['count'],8)
        owner_settings = AppSettings(app_stage='staging',access_mode='owner',owner_allowlist=frozenset({42}),db_path=self.db,dist_dir=self.dist)
        owner_client = TestClient(create_app(settings=owner_settings,db_path=self.db,dist_dir=self.dist))
        self.assertEqual(owner_client.get('/api/education/guides',headers=self.headers).json()['count'],8)
