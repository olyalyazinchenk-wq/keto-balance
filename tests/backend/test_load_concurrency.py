import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import unittest
from scripts.run_load_test import run_load_test

class TestLoadConcurrency(unittest.TestCase):
    def test_ten_concurrent_scenarios_execute_under_sla_without_errors(self):
        """
        Real concurrent load testing: 10 concurrent worker scenarios must execute
        simultaneously without errors (0 failures) and p95 latency must be strictly under 2.0s (2000 ms).
        """
        result = run_load_test(concurrent_workers=10)
        self.assertTrue(result["passed"], f"Load test failed: {result}")
        self.assertEqual(result["failed_requests"], 0, f"Expected 0 failures, got {result['failed_requests']}")
        self.assertGreaterEqual(result["successful_requests"], 70, f"Expected >= 70 requests, got {result['successful_requests']}")
        self.assertLess(result["p95_ms"], 2000.0, f"p95 latency {result['p95_ms']:.2f}ms exceeds 2000ms SLA")

if __name__ == "__main__":
    unittest.main()
