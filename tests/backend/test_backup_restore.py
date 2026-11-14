import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import tempfile
import unittest
from pathlib import Path

from bot.app_db import (
    init_db,
    create_or_get_user,
    save_user_profile,
    get_user_profile,
    backup_database,
    restore_database,
)

class TestBackupRestore(unittest.TestCase):
    def test_backup_and_restore_cycle(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            source_db = tmp_path / "live.db"
            backup_file = tmp_path / "backups" / "backup_live.db"
            restored_db = tmp_path / "restored.db"

            # 1. Создаем пользователя и данные в исходной БД
            init_db(source_db)
            create_or_get_user(501, username="backup_user", first_name="Back", db_path=source_db)
            save_user_profile(501, {"weight": 82.5, "goal": "keto_restore"}, db_path=source_db)

            # 2. Выполняем бэкап
            backup_database(source_db, backup_file)
            self.assertTrue(backup_file.is_file())
            self.assertGreater(backup_file.stat().st_size, 0)

            # 3. Восстанавливаем из бэкапа в новый файл БД
            restore_database(backup_file, restored_db)
            self.assertTrue(restored_db.is_file())

            # 4. Проверяем целостность данных в восстановленной БД
            profile = get_user_profile(501, db_path=restored_db)
            self.assertIsNotNone(profile)
            self.assertEqual(profile["weight"], 82.5)
            self.assertEqual(profile["goal"], "keto_restore")
