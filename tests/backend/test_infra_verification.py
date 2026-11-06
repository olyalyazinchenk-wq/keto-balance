import json
import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import re
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from bot.server import create_app

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class TestInfraVerification(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.dist_dir = Path(self.tmp_dir.name)

        # Create mock release.json and released-catalog.json
        self.release_data = {
            "version": "1.0.0-release",
            "buildId": "release-build-20261106",
            "gitSha": "abc123def456",
            "builtAt": "2026-11-06T12:00:00Z",
        }
        (self.dist_dir / "release.json").write_text(json.dumps(self.release_data), encoding="utf-8")
        (self.dist_dir / "released-catalog.json").write_text(json.dumps({"recipes": [{"id": "k1"}]}), encoding="utf-8")

        self.app = create_app(dist_dir=self.dist_dir)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp_dir.cleanup()

    # --- VERSION ENDPOINT VERIFICATION ---

    def test_version_endpoint_returns_code_version_catalog_hash_and_stage(self):
        resp = self.client.get("/api/version")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        # Agreed code version
        self.assertIn("version", data)
        self.assertEqual(data["version"], "1.0.0-release")

        # Build ID & Git SHA
        self.assertEqual(data["buildId"], "release-build-20261106")
        self.assertEqual(data["gitSha"], "abc123def456")

        # Backend Fingerprint
        self.assertIn("backendFingerprint", data)
        self.assertTrue(len(data["backendFingerprint"]) >= 8)

        # Catalog hash
        self.assertIn("catalogHash", data)
        self.assertTrue(len(data["catalogHash"]) >= 8)

        # Environment stage
        self.assertIn("appStage", data)

        # Cache headers
        cache_control = resp.headers.get("cache-control", "")
        self.assertIn("no-store", cache_control)

    # --- DOCKER COMPOSE STATIC CONFIGURATION VERIFICATION (DECOUPLED FROM LOAD TESTING) ---

    def test_docker_compose_resource_limits_and_ports(self):
        """
        Static configuration verification for docker-compose.yml (CPU limits, RAM limits, protected ports).
        Note: Real concurrent load testing is completely decoupled and executed via scripts/run_load_test.py
        and tests/backend/test_load_concurrency.py.
        """
        compose_file = PROJECT_ROOT / "docker-compose.yml"
        self.assertTrue(compose_file.is_file(), "docker-compose.yml must exist in project root")

        content = compose_file.read_text(encoding="utf-8")

        # 1. Total CPU limits must be <= 1.5 vCPU
        cpu_matches = re.findall(r'cpus:\s*["\']?([0-9.]+)["\']?', content)
        self.assertTrue(len(cpu_matches) >= 3, f"Expected CPU limits for services, found: {cpu_matches}")
        total_cpus = sum(float(c) for c in cpu_matches)
        self.assertLessEqual(total_cpus, 1.5, f"Total CPU limits ({total_cpus}) exceed 1.5 vCPU ceiling")

        # 2. Total Memory limits must be <= 2.0 GB (2048M)
        mem_matches = re.findall(r'memory:\s*([0-9]+)([MG])', content)
        self.assertTrue(len(mem_matches) >= 3, f"Expected Memory limits for services, found: {mem_matches}")
        total_mem_mb = 0
        for val, unit in mem_matches:
            if unit == "G":
                total_mem_mb += float(val) * 1024
            else:
                total_mem_mb += float(val)
        self.assertLessEqual(total_mem_mb, 2048, f"Total Memory limits ({total_mem_mb}M) exceed 2048M (2GB) ceiling")

        # 3. Protected ports verification: 18081, 10808, 10809 must NEVER be mapped or bound
        protected_ports = ["18081", "10808", "10809"]
        for port in protected_ports:
            self.assertNotIn(f'"{port}:', content, f"Protected port {port} must not be mapped in docker-compose.yml")
            self.assertNotIn(f"'{port}:", content, f"Protected port {port} must not be mapped in docker-compose.yml")
            self.assertNotIn(f":{port}", content, f"Protected port {port} must not be mapped in docker-compose.yml")


if __name__ == "__main__":
    unittest.main()
