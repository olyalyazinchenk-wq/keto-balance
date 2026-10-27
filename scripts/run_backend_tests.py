import argparse
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--suite', nargs='+')
    args = parser.parse_args()
    os.environ['KETO_LOAD_DOTENV'] = '0'
    os.environ['PAYMENT_MODE'] = 'disabled'
    os.environ['PAYMENTS_ENABLED'] = '0'
    os.environ['APP_STAGE'] = 'test'
    sys.path.insert(0, str(ROOT))
    if args.suite:
        suite = unittest.defaultTestLoader.loadTestsFromNames(args.suite)
    else:
        suite = unittest.defaultTestLoader.discover(str(ROOT / 'tests' / 'backend'), top_level_dir=str(ROOT))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    valid = result.testsRun > 0 and result.wasSuccessful() and not result.skipped
    print(f'BACKEND_RESULT tests={result.testsRun} failures={len(result.failures)} errors={len(result.errors)} skipped={len(result.skipped)}')
    return 0 if valid else 1

if __name__ == '__main__':
    raise SystemExit(main())
