import os
os.environ['KETO_LOAD_DOTENV'] = '0'
import unittest
import asyncio
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from bot.app_settings import AppSettings
from bot import bot as app


class TestLogRedaction(unittest.IsolatedAsyncioTestCase):
    async def test_error_handler_does_not_log_exception_or_update(self):
        marker = 'SYNTHETIC_SECRET_TOKEN_AND_MESSAGE'
        with self.assertLogs(app.logger, level='ERROR') as logs:
            await app.error_handler(SimpleNamespace(text=marker), SimpleNamespace(error=RuntimeError(marker)))
        self.assertNotIn(marker, '\n'.join(logs.output))

    async def test_post_init_does_not_log_exception(self):
        marker = 'SYNTHETIC_SECRET_TOKEN_AND_MESSAGE'
        application = SimpleNamespace(bot_data={}, bot=SimpleNamespace(set_my_commands=AsyncMock(side_effect=RuntimeError(marker))))
        with tempfile.TemporaryDirectory() as folder:
            settings = AppSettings(db_path=Path(folder) / 'support.db')
            with patch('bot.app_settings.get_settings',return_value=settings), patch.dict(os.environ, {'KETO_BOT_HEARTBEAT_PATH':str(Path(folder) / 'heartbeat.txt')}), self.assertLogs(app.logger, level='WARNING') as logs:
                await app.post_init(application)
            application.bot_data['support_worker'].cancel()
            try:
                await application.bot_data['support_worker']
            except asyncio.CancelledError:
                pass
        self.assertNotIn(marker, '\n'.join(logs.output))
