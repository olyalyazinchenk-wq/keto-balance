"""Offline checks for the VPS Telegram URL guard."""
import unittest
from scripts.sync_telegram_buttons import check_url


class DeployContract(unittest.TestCase):
    def test_matching_https(self):
        self.assertEqual(check_url('https://app.example.com', 'https://app.example.com/'),
                         'https://app.example.com')

    def test_wrong_environment(self):
        with self.assertRaises(ValueError):
            check_url('https://new.example.com', 'https://old.example.com')

    def test_refuse_insecure_or_path(self):
        for url in ('http://app.example.com', 'https://user:pass@app.example.com',
                    'https://app.example.com/page', 'https://app.example.com?q=1'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                check_url(url, url)
