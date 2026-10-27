import os
os.environ['KETO_LOAD_DOTENV'] = '0'
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from bot import bot as app


class TestLogRedaction(unittest.IsolatedAsyncioTestCase):
    async def test_error_handler_does_not_log_exception_or_update(self):
        marker = 'SYNTHETIC_SECRET_TOKEN_AND_MESSAGE'
        with self.assertLogs(app.logger, level='ERROR') as logs:
            await app.error_handler(SimpleNamespace(text=marker), SimpleNamespace(error=RuntimeError(marker)))
        self.assertNotIn(marker, '\n'.join(logs.output))

    async def test_post_init_does_not_log_exception(self):
        marker = 'SYNTHETIC_SECRET_TOKEN_AND_MESSAGE'
        application = SimpleNamespace(bot=SimpleNamespace(set_my_commands=AsyncMock(side_effect=RuntimeError(marker))))
        with self.assertLogs(app.logger, level='WARNING') as logs:
            await app.post_init(application)
        self.assertNotIn(marker, '\n'.join(logs.output))
