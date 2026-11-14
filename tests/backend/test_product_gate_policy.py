import os
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.verification import (
    GateError, Step, assert_report, build_plan, run_step, validate_plan,
)


class ProductGatePolicyTests(unittest.TestCase):
    def test_k1_does_not_require_deferred_private_features(self):
        steps = build_plan(Path.cwd(), 'k1-local')
        paths = {path for step in steps for path in step.required_paths}
        self.assertIn('tests/frontend/menu-controller.test.cjs', paths)
        self.assertNotIn('tests/backend/test_reminders.py', paths)
        self.assertNotIn('tests/backend/test_admin_api.py', paths)
        self.assertNotIn('tests/backend/test_session_api.py', paths)

    def test_k2_requires_identity_and_user_isolation(self):
        steps = build_plan(Path.cwd(), 'k2-pilot')
        paths = {path for step in steps for path in step.required_paths}
        self.assertIn('tests/backend/test_auth.py', paths)
        self.assertIn('tests/backend/test_session_api.py', paths)
        self.assertIn('tests/backend/test_user_api.py', paths)
        self.assertIn('tests/e2e/persistence.spec.ts', paths)

    def test_k3_requires_refund_and_billing(self):
        steps = build_plan(Path.cwd(), 'k3-pilot')
        paths = {path for step in steps for path in step.required_paths}
        self.assertIn('tests/backend/test_refunds.py', paths)
        self.assertIn('tests/e2e/billing.spec.ts', paths)

    def test_missing_required_suite_blocks(self):
        tmpdir = os.environ.get('TMPDIR')
        with tempfile.TemporaryDirectory(dir=tmpdir) as folder:
            root = Path(folder)
            with self.assertRaises(GateError):
                validate_plan(root, build_plan(root, 'k1-local'))

    def test_each_suite_is_run_separately(self):
        steps = build_plan(Path.cwd(), 'k2-pilot')
        for step in steps:
            if step.kind == 'backend':
                self.assertEqual(step.command.count('--suite'), 1)
                self.assertEqual(len(step.command[step.command.index('--suite') + 1:]), 1)
            elif step.kind == 'tap':
                self.assertEqual(len(step.required_paths), 1)

    def test_zero_or_skipped_suite_is_not_success(self):
        empty = '# tests 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'
        with self.assertRaises(GateError):
            assert_report('tap', empty, Path.cwd())
        skipped = '# tests 1\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n'
        with self.assertRaises(GateError):
            assert_report('tap', skipped, Path.cwd())

    def test_failed_synthetic_child_blocks(self):
        step = Step('synthetic-child',
                    (sys.executable, '-B', '-c', 'raise SystemExit(7)'), ()
        )
        with self.assertRaises(GateError):
            run_step(step, Path.cwd())


if __name__ == '__main__':
    unittest.main()
