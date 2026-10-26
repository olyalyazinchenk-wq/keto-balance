import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import unittest
from unittest.mock import patch
import subprocess
import sys
import io
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent

class TestVerifyP0Script(unittest.TestCase):
    def test_full_mode_fails_and_blocks_when_mandatory_tests_missing(self):
        """Negative test: verify-p0.py must exit non-zero and print [BLOCKED] when mandatory tests are missing."""
        env = os.environ.copy()
        env.pop("PYTHONPATH", None)
        env["KETO_LOAD_DOTENV"] = "0"
        
        script_path = ROOT / "scripts" / "verify-p0.py"
        res = subprocess.run(
            [sys.executable, "-B", str(script_path)],
            cwd=str(ROOT),
            env=env,
            capture_output=True,
            text=True
        )
        
        self.assertNotEqual(res.returncode, 0, "verify-p0.py in full mode must exit non-zero when mandatory files are missing")
        output = res.stderr + res.stdout
        self.assertIn("[BLOCKED]", output)
        self.assertIn("Full P0 audit requires all mandatory test suites", output)
        self.assertNotIn("All P0 verifications passed", output)

    def test_checkpoint_mode_does_not_claim_full_p0_readiness(self):
        """Checkpoint mode runs without blocking on missing future tests, but must never claim full P0 success."""
        spec = importlib.util.spec_from_file_location("verify_p0", str(ROOT / "scripts" / "verify-p0.py"))
        assert spec is not None and spec.loader is not None
        vp0 = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(vp0)

        out_buf = io.StringIO()
        with patch.object(sys, "argv", ["verify-p0.py", "--checkpoint", "test_guard"]):
            with patch.object(vp0, "run_cmd") as mock_run:
                with patch("sys.stdout", out_buf):
                    vp0.main()

        output = out_buf.getvalue()
        self.assertIn("Mode: CHECKPOINT (test_guard)", output)
        self.assertIn("[CHECKPOINT PASSED] Checkpoint 'test_guard' verified successfully.", output)
        self.assertNotIn("All P0 verifications passed!", output)
        self.assertTrue(mock_run.called)

    def test_run_cmd_propagates_non_zero_exit_code(self):
        """Negative test: verify-p0.py run_cmd raises SystemExit on failure."""
        spec = importlib.util.spec_from_file_location("verify_p0", str(ROOT / "scripts" / "verify-p0.py"))
        assert spec is not None and spec.loader is not None
        vp0 = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(vp0)
        
        with self.assertRaises(SystemExit) as ctx:
            vp0.run_cmd([sys.executable, "-c", "import sys; sys.exit(77)"], "Failing step test")
        self.assertEqual(ctx.exception.code, 77)

if __name__ == '__main__':
    unittest.main()
