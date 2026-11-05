import json
import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.auth import generate_telegram_init_data
from bot.server import create_app

TEST_TOKEN = "111222333:TEST_BOT_TOKEN_FOR_SESSION_API"

SYNTHETIC_CATALOG = {
    "schema_version": 1,
    "catalog_id": "synthetic-test-catalog-v2",
    "test_only": True,
    "released_ids": ["k1", "k2", "k3", "k4", "k5", "s1", "s2", "s3"],
    "recipes": [
        {
            "id": "k1",
            "title": "Сливочная яичница с беконом и шпинатом",
            "mode": "keto",
            "time": 12,
            "ing": [["Яйца", "4 шт"], ["Бекон", "80 г"], ["Шпинат", "100 г"], ["Сливочное масло", "20 г"]],
        },
        {
            "id": "k2",
            "title": "Омлет с сыром и зеленью",
            "mode": "keto",
            "time": 10,
            "ing": [["Яйца", "3 шт"], ["Сыр твёрдый", "40 г"], ["Сливки 33%", "30 мл"], ["Сливочное масло", "10 г"]],
        },
        {
            "id": "k3",
            "title": "Ленивые сырники в духовке (кето)",
            "mode": "keto",
            "time": 35,
            "ing": [["Творог 5%", "400 г"], ["Яйца", "2 шт"], ["Сметана", "2 ст. л."]],
        },
        {
            "id": "k4",
            "title": "Авокадо-тосты на кето-хлебе",
            "mode": "keto",
            "time": 10,
            "ing": [["Авокадо", "1 шт"], ["Кокосовая мука", "40 г"], ["Яйца", "2 шт"], ["Оливковое масло", "1 ст. л."]],
        },
        {
            "id": "k5",
            "title": "Яичные маффины с овощами и ветчиной",
            "mode": "keto",
            "time": 30,
            "ing": [["Яйца", "4 шт"], ["Ветчина", "60 г"]],
        },
        # Dairy-free and egg-free recipes for restriction testing:
        {
            "id": "s1",
            "title": "Салат с курицей и авокадо",
            "mode": "keto",
            "time": 10,
            "ing": [["Куриное филе (готовое)", "240 г"], ["Авокадо", "1 шт"], ["Оливковое масло", "1 ст. л."], ["Огурцы свежие", "150 г"]],
        },
        {
            "id": "s2",
            "title": "Стейк из индейки с цукини",
            "mode": "keto",
            "time": 15,
            "ing": [["Филе индейки", "200 г"], ["Цукини", "150 г"], ["Оливковое масло", "1 ст. л."]],
        },
        {
            "id": "s3",
            "title": "Кето-боул с говядиной и шпинатом",
            "mode": "keto",
            "time": 15,
            "ing": [["Говядина запечённая", "180 г"], ["Шпинат свежий", "100 г"], ["Оливковое масло", "1 ст. л."]],
        },
    ]
}

class TestSessionApi(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "session_test.db"
        self.settings = AppSettings(
            telegram_bot_token=TEST_TOKEN,
            db_path=self.db_path,
            dist_dir=Path(self.tmp_dir.name),
        )
        self.fixture = SYNTHETIC_CATALOG
        self.app = create_app(
            dist_dir=Path(self.tmp_dir.name),
            db_path=self.db_path,
            settings=self.settings,
            catalog_provider=lambda: self.fixture,
        )
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_create_session_with_valid_init_data(self):
        user = {"id": 12345, "first_name": "TestUser", "username": "test_keto"}
        init_data = generate_telegram_init_data(user, TEST_TOKEN)

        resp = self.client.post("/api/session", json={"init_data": init_data})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("session_token", data)
        self.assertEqual(data["user_id"], 12345)
        self.assertEqual(data["username"], "test_keto")

        # Проверка GET /api/session с Bearer токеном
        token = data["session_token"]
        get_resp = self.client.get("/api/session", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(get_resp.status_code, 200)
        session_info = get_resp.json()
        self.assertEqual(session_info["user_id"], 12345)

    def test_create_session_with_invalid_init_data_fails(self):
        resp = self.client.post("/api/session", json={"init_data": "auth_date=1&hash=fake"})
        self.assertEqual(resp.status_code, 401)

    def test_get_session_missing_or_invalid_bearer_token(self):
        resp_no_auth = self.client.get("/api/session")
        self.assertEqual(resp_no_auth.status_code, 401)

        resp_bad_auth = self.client.get("/api/session", headers={"Authorization": "Bearer deadbeef12345678"})
        self.assertEqual(resp_bad_auth.status_code, 401)

    def test_webapp_button_generation_and_local_fallback(self):
        from bot.bot import webapp_button
        # 1. HTTPS URL creates valid WebAppInfo button
        btn_https = webapp_button("📱 Открыть", url="https://tma.ketobalance.ru")
        self.assertIsNotNone(btn_https.web_app)
        self.assertEqual(btn_https.web_app.url, "https://tma.ketobalance.ru")
        self.assertIsNone(btn_https.callback_data)

        # 2. Local/HTTP URL creates callback_data fallback without WebAppInfo (Telegram API restriction)
        btn_http = webapp_button("📱 Открыть", url="http://localhost:5173")
        self.assertIsNone(btn_http.web_app)
        self.assertEqual(btn_http.callback_data, "open_app_local")

    def test_create_session_with_missing_or_empty_init_data(self):
        # Empty string
        resp_empty = self.client.post("/api/session", json={"init_data": ""})
        self.assertEqual(resp_empty.status_code, 401)

        # Whitespace-only string
        resp_ws = self.client.post("/api/session", json={"init_data": "   "})
        self.assertEqual(resp_ws.status_code, 401)

        # Missing hash parameter
        resp_no_hash = self.client.post("/api/session", json={"init_data": "auth_date=1700000000&query_id=123"})
        self.assertEqual(resp_no_hash.status_code, 401)

    def test_create_session_with_tampered_payload_fails(self):
        user = {"id": 1001, "first_name": "AuthenticUser"}
        valid_init = generate_telegram_init_data(user, TEST_TOKEN)
        # Attacker tampers user ID without updating HMAC signature
        tampered_init = valid_init.replace("1001", "7777777")
        resp = self.client.post("/api/session", json={"init_data": tampered_init})
        self.assertEqual(resp.status_code, 401)

    def test_create_session_with_expired_auth_date_fails(self):
        import time
        user = {"id": 2002, "first_name": "ExpiredUser"}
        old_time = int(time.time()) - 90000  # older than 86400s
        expired_init = generate_telegram_init_data(user, TEST_TOKEN, auth_date=old_time)
        resp = self.client.post("/api/session", json={"init_data": expired_init})
        self.assertEqual(resp.status_code, 401)

    def test_create_session_with_owner_allowlist_enforcement(self):
        synthetic_owner_id = 555444333
        staging_settings = AppSettings(
            telegram_bot_token=TEST_TOKEN,
            db_path=self.db_path,
            dist_dir=Path(self.tmp_dir.name),
            owner_allowlist=[synthetic_owner_id],
        )
        staging_app = create_app(dist_dir=Path(self.tmp_dir.name), db_path=self.db_path, settings=staging_settings)
        staging_client = TestClient(staging_app)

        # Non-owner with valid signature is rejected (403 Forbidden)
        intruder_init = generate_telegram_init_data({"id": 9999999, "first_name": "Intruder"}, TEST_TOKEN)
        resp_intruder = staging_client.post("/api/session", json={"init_data": intruder_init})
        self.assertEqual(resp_intruder.status_code, 403)

        # Owner with valid signature is accepted (200 OK)
        owner_init = generate_telegram_init_data({"id": synthetic_owner_id, "first_name": "TestOwner"}, TEST_TOKEN)
        resp_owner = staging_client.post("/api/session", json={"init_data": owner_init})
        self.assertEqual(resp_owner.status_code, 200)

    def test_save_incompatible_menu_rejected_without_partial_write(self):
        """
        Негативный тест: профиль исключает яйца и молочные продукты,
        а запрос пытается сохранить блюда с этими ингредиентами (k1).
        Сервер обязан отклонить запрос (400 Bad Request) без частичной записи.
        """
        user = {"id": 888000222, "first_name": "NegativeTestUser", "username": "neg_test"}
        init_data = generate_telegram_init_data(user, TEST_TOKEN)
        resp_session = self.client.post("/api/session", json={"init_data": init_data})
        self.assertEqual(resp_session.status_code, 200)
        token = resp_session.json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Профиль: исключить молочные продукты и яйца
        incompatible_profile = {
            "settings": {
                "confirmed18Plus": True,
                "approach": "keto",
                "restrictions": ["exclude_dairy", "exclude_eggs"],
                "prepTimeMax": 30,
                "mealsPerDay": 3,
                "planDays": 3,
                "preferenceNote": "",
            },
            "goal": "maintenance",
        }
        # Меню содержит k1 (яичница с беконом и сливочным маслом)
        incompatible_state = {
            "schema_version": 1,
            "menu": {
                "mode": "keto",
                "numDays": 1,
                "meals": 1,
                "portion": 1,
                "saved": True,
                "created": 1730764800,
                "days": [{"date": "2026-11-05", "slots": {"breakfast": "k1"}}],
            },
            "selected_date": "2026-11-05",
            "checked_steps": {},
            "shopping_stale": False,
        }

        put_resp = self.client.put(
            "/api/user",
            json={
                "schema_version": 1,
                "expected_revision": 0,
                "profile": incompatible_profile,
                "state": incompatible_state,
            },
            headers=headers,
        )
        # Обязано быть отклонено сервером
        self.assertEqual(put_resp.status_code, 400)
        self.assertIn("incompatible with user restrictions", put_resp.json()["detail"])

        # Проверка отсутствия частичной записи: ревизия осталась 0, профиль и состояние пустые
        get_resp = self.client.get("/api/user", headers=headers)
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.json()["revision"], 0)
        self.assertIsNone(get_resp.json()["profile"])
        self.assertIsNone(get_resp.json()["state"])

    def test_restriction_change_prevents_resaving_old_incompatible_menu(self):
        """
        Тест изменения ограничений: старое несовместимое меню не может быть повторно сохранено.
        1. Пользователь сохраняет профиль без ограничений и меню с k1 (ревизия 1).
        2. Пользователь меняет настройки: добавляет exclude_dairy (ревизия 2).
        3. Попытка повторно сохранить старое меню с k1 отклоняется (400 Bad Request).
        4. Сохранение нового совместимого меню (s1) проходит успешно (ревизия 3).
        """
        user = {"id": 888000333, "first_name": "ChangeRestrictUser", "username": "restrict_user"}
        init_data = generate_telegram_init_data(user, TEST_TOKEN)
        token = self.client.post("/api/session", json={"init_data": init_data}).json()["session_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Начальный профиль без ограничений + меню с k1 (ревизия 0 -> 1)
        initial_profile = {
            "settings": {
                "confirmed18Plus": True,
                "approach": "keto",
                "restrictions": [],
                "prepTimeMax": 30,
                "mealsPerDay": 2,
                "planDays": 1,
                "preferenceNote": "",
            }
        }
        menu_with_dairy = {
            "schema_version": 1,
            "menu": {
                "mode": "keto",
                "numDays": 1,
                "meals": 2,
                "portion": 1,
                "saved": True,
                "created": 1730764800,
                "days": [{"date": "2026-11-05", "slots": {"breakfast": "k1", "lunch": "k2"}}],
            },
            "selected_date": "2026-11-05",
            "checked_steps": {},
            "shopping_stale": False,
        }
        resp1 = self.client.put(
            "/api/user",
            json={"schema_version": 1, "expected_revision": 0, "profile": initial_profile, "state": menu_with_dairy},
            headers=headers,
        )
        self.assertEqual(resp1.status_code, 200)
        self.assertEqual(resp1.json()["revision"], 1)

        # 2. Пользователь обновляет настройки в профиле: исключить молочные продукты (ревизия 1 -> 2)
        dairy_free_profile = {
            "settings": {
                "confirmed18Plus": True,
                "approach": "keto",
                "restrictions": ["exclude_dairy"],
                "prepTimeMax": 30,
                "mealsPerDay": 2,
                "planDays": 1,
                "preferenceNote": "",
            }
        }
        resp2 = self.client.put(
            "/api/user",
            json={"schema_version": 1, "expected_revision": 1, "profile": dairy_free_profile, "state": None},
            headers=headers,
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.json()["revision"], 2)

        # 3. Клиент пытается повторно сохранить старое меню с k1 при ревизии 2 -> Отклоняется (400 Bad Request)
        resp3 = self.client.put(
            "/api/user",
            json={"schema_version": 1, "expected_revision": 2, "profile": dairy_free_profile, "state": menu_with_dairy},
            headers=headers,
        )
        self.assertEqual(resp3.status_code, 400)
        self.assertIn("incompatible with user restrictions", resp3.json()["detail"])

        # Проверка отсутствия частичной записи при ошибочном сохранении:
        get_after_fail = self.client.get("/api/user", headers=headers).json()
        self.assertEqual(get_after_fail["revision"], 2)
        self.assertEqual(get_after_fail["profile"]["settings"]["restrictions"], ["exclude_dairy"])

        # 4. Клиент сохраняет новое совместимое меню без молочных продуктов (s1) -> Успешно (ревизия 2 -> 3)
        menu_dairy_free = {
            "schema_version": 1,
            "menu": {
                "mode": "keto",
                "numDays": 1,
                "meals": 1,
                "portion": 1,
                "saved": True,
                "created": 1730764800,
                "days": [{"date": "2026-11-05", "slots": {"breakfast": "s1"}}],
            },
            "selected_date": "2026-11-05",
            "checked_steps": {},
            "shopping_stale": False,
        }
        resp4 = self.client.put(
            "/api/user",
            json={"schema_version": 1, "expected_revision": 2, "profile": dairy_free_profile, "state": menu_dairy_free},
            headers=headers,
        )
        self.assertEqual(resp4.status_code, 200)
        self.assertEqual(resp4.json()["revision"], 3)

        # 5. Повторное чтение GET /api/user и полная проверка целостности данных:
        get_final = self.client.get("/api/user", headers=headers).json()
        # - Ревизия корректна (3)
        self.assertEqual(get_final["revision"], 3)
        # - Профиль и ограничения пользователя действительно сохранены
        self.assertIsNotNone(get_final["profile"])
        self.assertEqual(get_final["profile"]["settings"]["restrictions"], ["exclude_dairy"])
        self.assertTrue(get_final["profile"]["settings"]["confirmed18Plus"])
        # - Совместимое меню сохранено
        self.assertIsNotNone(get_final["state"]["menu"])
        self.assertEqual(get_final["state"]["menu"]["days"][0]["slots"]["breakfast"], "s1")
        # - Старое запрещённое меню не восстановилось
        all_recipe_ids = [slot_id for day in get_final["state"]["menu"]["days"] for slot_id in day["slots"].values()]
        self.assertNotIn("k1", all_recipe_ids)
        self.assertNotIn("k2", all_recipe_ids)

    def test_full_sequential_tma_flow_and_repeat_login(self):
        # Синтетический тестовый пользователь (без реальных ID и персональных данных)
        user = {"id": 888000111, "first_name": "TestUser", "username": "synthetic_pilot_user"}
        init_data_first = generate_telegram_init_data(user, TEST_TOKEN)

        # Step 1: Client opens via button and creates session
        resp_session = self.client.post("/api/session", json={"init_data": init_data_first})
        self.assertEqual(resp_session.status_code, 200)
        session_token = resp_session.json()["session_token"]
        headers = {"Authorization": f"Bearer {session_token}"}

        # Step 2: Fetch initial user data (empty profile before onboarding)
        resp_user_init = self.client.get("/api/user", headers=headers)
        self.assertEqual(resp_user_init.status_code, 200)
        init_data = resp_user_init.json()
        self.assertEqual(init_data["revision"], 0)
        self.assertIsNone(init_data["profile"])

        # Step 3: Complete onboarding & save profile with restrictions and compatible recipes
        profile_to_save = {
            "settings": {
                "confirmed18Plus": True,
                "approach": "keto",
                "restrictions": ["exclude_dairy", "exclude_eggs"],
                "prepTimeMax": 20,
                "mealsPerDay": 3,
                "planDays": 3,
                "preferenceNote": "",
            },
            "goal": "maintenance",
        }
        # Используются реально совместимые с exclude_dairy и exclude_eggs блюда (s1, s2, s3)
        state_to_save = {
            "schema_version": 1,
            "menu": {
                "mode": "keto",
                "numDays": 3,
                "meals": 3,
                "portion": 1,
                "saved": True,
                "created": 1730764800,
                "days": [{"date": "2026-11-05", "slots": {"breakfast": "s1", "lunch": "s2", "dinner": "s3"}}],
            },
            "selected_date": "2026-11-05",
            "checked_steps": {"s1:0": True},
            "shopping_stale": False,
        }
        put_resp = self.client.put(
            "/api/user",
            json={"schema_version": 1, "expected_revision": 0, "profile": profile_to_save, "state": state_to_save},
            headers=headers,
        )
        self.assertEqual(put_resp.status_code, 200)
        self.assertEqual(put_resp.json()["revision"], 1)

        # Step 4: Save shopping list items
        shopping_items = [
            {
                "id": "item-1",
                "name": "Авокадо",
                "amountLabel": "2 шт",
                "department": "Овощи и зелень",
                "linkedRecipeTitles": [],
                "alreadyHave": False,
                "checkedInStore": False,
            }
        ]
        shop_resp = self.client.put(
            "/api/shopping",
            json={"schema_version": 1, "expected_revision": 0, "items": shopping_items},
            headers=headers,
        )
        self.assertEqual(shop_resp.status_code, 200)

        # Step 5: User closes MiniApp and returns later (Repeat Login)
        init_data_second = generate_telegram_init_data(user, TEST_TOKEN)
        resp_second_session = self.client.post("/api/session", json={"init_data": init_data_second})
        self.assertEqual(resp_second_session.status_code, 200)
        second_token = resp_second_session.json()["session_token"]
        second_headers = {"Authorization": f"Bearer {second_token}"}

        # Step 6: Verify backend persistence of profile consent and saved data
        # Примечание: сервер подтверждает сохранение флага confirmed18Plus: True.
        # Фактическое поведение экрана Start Gate (пропуск или отображение на клиенте)
        # регулируется и проверяется соответствующими frontend/UI тестами (tests/frontend/start-gate.test.cjs).
        resp_reentrant = self.client.get("/api/user", headers=second_headers)
        self.assertEqual(resp_reentrant.status_code, 200)
        reentrant_data = resp_reentrant.json()
        self.assertEqual(reentrant_data["revision"], 1)
        self.assertTrue(reentrant_data["profile"]["settings"]["confirmed18Plus"])
        self.assertEqual(reentrant_data["profile"]["settings"]["approach"], "keto")
        self.assertEqual(reentrant_data["state"]["selected_date"], "2026-11-05")
        self.assertEqual(reentrant_data["state"]["menu"]["days"][0]["slots"]["breakfast"], "s1")
        self.assertEqual(reentrant_data["state"]["menu"]["days"][0]["slots"]["lunch"], "s2")
        self.assertEqual(reentrant_data["state"]["menu"]["days"][0]["slots"]["dinner"], "s3")

        # Step 7: Verify shopping items persisted across repeat login
        shop_reentrant = self.client.get("/api/shopping", headers=second_headers)
        self.assertEqual(shop_reentrant.status_code, 200)
        self.assertEqual(len(shop_reentrant.json()["items"]), 1)
        self.assertEqual(shop_reentrant.json()["items"][0]["name"], "Авокадо")

if __name__ == "__main__":
    unittest.main()
