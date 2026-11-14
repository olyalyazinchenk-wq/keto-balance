import unittest
from unittest.mock import patch, MagicMock
import urllib.error

from scripts.check_telegram_access import (
    check_dns,
    check_http_endpoint,
    check_bot_token,
    diagnose_connectivity,
)


class TestTelegramConnectivity(unittest.TestCase):
    @patch("socket.getaddrinfo")
    def test_dns_resolution_success(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (2, 1, 6, "", ("149.154.167.220", 443)),
            (2, 1, 6, "", ("149.154.167.221", 443)),
        ]
        res = check_dns()
        self.assertTrue(res["ok"])
        self.assertIn("149.154.167.220", res["ips"])
        self.assertIsNone(res["error"])

    @patch("socket.getaddrinfo", side_effect=Exception("Name or service not known"))
    def test_dns_resolution_failure(self, mock_getaddrinfo):
        res = check_dns()
        self.assertFalse(res["ok"])
        self.assertEqual(res["ips"], [])
        self.assertIn("Name or service not known", res["error"])

    @patch("urllib.request.build_opener")
    def test_direct_https_success(self, mock_build_opener):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_opener = MagicMock()
        mock_opener.open.return_value.__enter__.return_value = mock_resp
        mock_build_opener.return_value = mock_opener

        res = check_http_endpoint("https://api.telegram.org/")
        self.assertTrue(res["ok"])
        self.assertEqual(res["status_code"], 200)

    @patch("urllib.request.build_opener")
    def test_direct_https_blocks_or_times_out(self, mock_build_opener):
        mock_opener = MagicMock()
        mock_opener.open.side_effect = TimeoutError("Connection timed out")
        mock_build_opener.return_value = mock_opener

        res = check_http_endpoint("https://api.telegram.org/")
        self.assertFalse(res["ok"])
        self.assertEqual(res["status_code"], 0)
        self.assertIn("timed out", res["error"])

    @patch("urllib.request.build_opener")
    def test_direct_https_accepts_http_404_as_network_success(self, mock_build_opener):
        # HTTP 404 from Telegram means connection & TLS work, endpoint path is just empty/missing
        mock_opener = MagicMock()
        mock_opener.open.side_effect = urllib.error.HTTPError(
            url="https://api.telegram.org/", code=404, msg="Not Found", hdrs={}, fp=None
        )
        mock_build_opener.return_value = mock_opener

        res = check_http_endpoint("https://api.telegram.org/")
        self.assertTrue(res["ok"])
        self.assertEqual(res["status_code"], 404)

    @patch("scripts.check_telegram_access.check_http_endpoint")
    def test_bot_token_verification(self, mock_check_endpoint):
        mock_check_endpoint.return_value = {"ok": True, "status_code": 200, "elapsed_ms": 45.0, "error": None}
        res = check_bot_token("123456789:ABCDEF1234567890abcdef")
        self.assertTrue(res["tested"])
        self.assertTrue(res["valid"])

    @patch("scripts.check_telegram_access.check_dns")
    @patch("scripts.check_telegram_access.check_http_endpoint")
    def test_diagnose_connectivity_fallback_to_proxy_when_direct_fails(
        self, mock_endpoint, mock_dns
    ):
        mock_dns.return_value = {"ok": True, "elapsed_ms": 5.0, "ips": ["1.2.3.4"], "error": None}
        # First call is direct (fails), second call is via proxy (succeeds)
        mock_endpoint.side_effect = [
            {"ok": False, "status_code": 0, "elapsed_ms": 7000.0, "error": "Connection timed out"},
            {"ok": True, "status_code": 200, "elapsed_ms": 120.0, "error": None},
        ]

        report = diagnose_connectivity(proxy_url="http://proxy.example.com:8080")
        self.assertEqual(report["status"], "TELEGRAM_PROXY_OK")
        self.assertEqual(report["exit_code"], 0)
        self.assertFalse(report["direct_https"]["ok"])
        self.assertTrue(report["proxy_https"]["ok"])


if __name__ == "__main__":
    unittest.main()
