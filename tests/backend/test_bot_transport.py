import unittest
from unittest.mock import MagicMock, patch
from bot.transport import configure_transport


class TestBotTransport(unittest.TestCase):
    def test_both_requests_use_same_explicit_proxy(self):
        builder = MagicMock()
        builder.request.return_value = builder
        builder.get_updates_request.return_value = builder
        first, second = object(), object()
        with patch('bot.transport.HTTPXRequest', side_effect=[first, second]) as make:
            self.assertIs(configure_transport(builder, 'http://127.0.0.1:10809'), builder)
        self.assertEqual(make.call_count, 2)
        for call in make.call_args_list:
            self.assertEqual(call.kwargs['proxy'], 'http://127.0.0.1:10809')
        builder.request.assert_called_once_with(first)
        builder.get_updates_request.assert_called_once_with(second)

    def test_direct_mode_has_no_forced_local_proxy(self):
        builder = MagicMock()
        builder.request.return_value = builder
        with patch('bot.transport.HTTPXRequest') as make:
            configure_transport(builder)
        self.assertTrue(all(call.kwargs['proxy'] is None for call in make.call_args_list))
