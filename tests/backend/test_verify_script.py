import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from scripts.verification import GateError, Step, assert_report, build_plan, run_step, validate_plan

class TestVerifyP0Script(unittest.TestCase):
    def test_missing_suite_blocks_before_process(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(GateError):
                validate_plan(Path(folder), [Step('x', ('unused',), ('missing.py',))])

    def test_missing_e2e_script_blocks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            package = {'scripts': {'test:unit': 'unit', 'typecheck': 'types', 'build': 'build'},
                       'devDependencies': {'@playwright/test': '1.64.1'}}
            (root / 'package.json').write_text(json.dumps(package), encoding='utf-8')
            with self.assertRaisesRegex(GateError, 'test:e2e'):
                validate_plan(root, [Step('e2e', ('unused',), (), 'playwright')])

    def test_empty_and_skipped_collections_block(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for text in ('# tests 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n',
                         '# tests 1\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n'):
                with self.subTest(text=text), self.assertRaises(GateError):
                    assert_report('tap', text, root)
            with self.assertRaises(GateError):
                assert_report('backend', 'BACKEND_RESULT tests=0 failures=0 errors=0 skipped=0', root)

    def test_nonzero_child_blocks(self):
        with tempfile.TemporaryDirectory() as folder:
            step = Step('synthetic-child', (sys.executable, '-B', '-c', 'raise SystemExit(77)'), ())
            with self.assertRaisesRegex(GateError, '77'):
                run_step(step, Path(folder))

    def test_policy_does_not_invoke_real_runner(self):
        with tempfile.TemporaryDirectory() as folder, patch('scripts.verification.subprocess.run') as run:
            steps = build_plan(Path(folder), 'p0')
            self.assertTrue(steps)
            run.assert_not_called()
            self.assertFalse(any('verify-p0.py' in item for step in steps for item in step.command))

    def test_e2e_zero_selection_blocks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'test-results').mkdir()
            report = {'stats': {'expected': 0, 'unexpected': 0, 'flaky': 0, 'skipped': 0}}
            (root / 'test-results/e2e.json').write_text(json.dumps(report), encoding='utf-8')
            with self.assertRaises(GateError):
                assert_report('playwright', '', root)

    def test_unknown_stage_is_not_success(self):
        with self.assertRaises(GateError):
            build_plan(Path('.'), 'invented')

if __name__ == '__main__':
    unittest.main()

