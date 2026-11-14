import argparse
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import uuid

ROOT = Path(__file__).resolve().parent.parent

def setup_test_environment() -> Path:
    local_app_data = os.environ.get('LOCALAPPDATA', '')
    if local_app_data:
        scratch_base = Path(local_app_data) / 'hermes' / 'cache' / 'scratch'
    else:
        scratch_base = Path(tempfile.gettempdir()) / 'hermes' / 'cache' / 'scratch'

    scratch_base.mkdir(parents=True, exist_ok=True)
    run_root = scratch_base / f"test-run-{uuid.uuid4().hex[:8]}"
    run_root.mkdir(parents=True, exist_ok=True)

    os.environ['KETO_TEST_ROOT'] = str(run_root)
    os.environ['TMPDIR'] = str(run_root)
    os.environ['TMP'] = str(run_root)
    os.environ['TEMP'] = str(run_root)
    tempfile.tempdir = str(run_root)

    os.environ['KETO_LOAD_DOTENV'] = '0'
    os.environ['PAYMENT_MODE'] = 'disabled'
    os.environ['PAYMENTS_ENABLED'] = '0'
    os.environ['APP_STAGE'] = 'test'

    return run_root

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--suite', nargs='+')
    parser.add_argument('--no-guard', action='store_true', help='Disable pilot IO guard')
    args = parser.parse_args()

    run_root = setup_test_environment()
    sys.path.insert(0, str(ROOT))

    if not args.no_guard:
        try:
            from tests.helpers.pilot_io_guard import install_pilot_io_guard
            install_pilot_io_guard(run_root)
        except Exception as e:
            print(f"[FATAL] Failed to install pilot IO guard: {e}", file=sys.stderr)
            return 1

    if args.suite:
        suite = unittest.defaultTestLoader.loadTestsFromNames(args.suite)
    else:
        suite = unittest.defaultTestLoader.discover(str(ROOT / 'tests' / 'backend'), top_level_dir=str(ROOT))

    result = unittest.TextTestRunner(verbosity=2).run(suite)
    valid = result.testsRun > 0 and result.wasSuccessful() and not result.skipped

    # Check for IO guard violations
    guard_violations = 0
    if not args.no_guard:
        try:
            from tests.helpers.pilot_io_guard import get_violations
            violations = get_violations()
            if violations:
                print(f"[ERROR] Pilot IO Guard violations detected ({len(violations)}):", file=sys.stderr)
                for v in violations[:10]:
                    print(f"  - {v}", file=sys.stderr)
                guard_violations = len(violations)
                valid = False
        except Exception:
            pass

    print(f'BACKEND_RESULT tests={result.testsRun} failures={len(result.failures)} errors={len(result.errors)} skipped={len(result.skipped)}')
    return 0 if valid and guard_violations == 0 else 1

if __name__ == '__main__':
    raise SystemExit(main())
