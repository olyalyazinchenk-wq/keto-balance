import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class GateError(RuntimeError):
    """A required verification cannot be accepted."""


@dataclass(frozen=True)
class Step:
    name: str
    command: tuple[str, ...]
    required_paths: tuple[str, ...]
    kind: str = 'command'


P0_BACK = (
    'test_import_safety',
    'test_database',
    'test_payments_disabled',
    'test_payment_callbacks',
    'test_server_security',
    'test_safety',
    'test_verify_script',
)
P0_FRONT = ('harness', 'catalog', 'eligibility', 'menu', 'replacement', 'honesty', 'safety')
VIS_BACK = ('test_verify_script', 'test_server_security', 'test_release_version')
VIS_FRONT = ('routes', 'telegram')
FREE_BACK = (
    'test_auth',
    'test_app_settings',
    'test_app_db',
    'test_session_api',
    'test_app_models',
    'test_user_api',
    'test_data_rights',
    'test_catalog_api',
    'test_admin_api',
    'test_content_publication',
    'test_support',
    'test_reminders',
    'test_release_boundaries',
    'test_safety_routing',
    'test_log_redaction',
)
FREE_FRONT = ('routes', 'telegram', 'shopping', 'calendar', 'legacy', 'preferences')
PAID_BACK = (
    'test_products',
    'test_billing_orders',
    'test_stars_handlers',
    'test_entitlements',
    'test_subscription_lifecycle',
    'test_release_gate',
    'test_backup_restore',
)
VIS_E2E = ('layout', 'navigation', 'onboarding', 'visual')
FREE_E2E = VIS_E2E + ('p0', 'menu-flow', 'shopping', 'diary', 'support', 'persistence', 'admin')

PRODUCT_GATES = ('k1-local', 'k2-pilot', 'k3-pilot')
K1_BACK = P0_BACK + ('test_product_gate_policy',)
K1_FRONT = tuple(dict.fromkeys(P0_FRONT + (
    'routes', 'telegram', 'catalog-build-safety', 'food-view-adapter',
    'menu-controller', 'food-import-boundary', 'food-shell', 'food-flow',
    'food-shopping', 'food-clipboard', 'support-onboarding',
)))
K2_BACK = K1_BACK + (
    'test_auth', 'test_app_settings', 'test_app_db', 'test_session_api',
    'test_app_models', 'test_user_api', 'test_data_rights', 'test_catalog_api',
    'test_support', 'test_log_redaction', 'test_release_boundaries',
    'test_safety_routing', 'test_backup_restore',
    'test_pilot_auth_regressions', 'test_pilot_harness', 'test_pilot_roundtrip',
    'test_staging_and_demo',
)
K2_FRONT = tuple(dict.fromkeys(K1_FRONT + (
    'pilot-client', 'pilot-state', 'pilot-preferences', 'release-catalog-export',
)))
K3_BACK = K2_BACK + (
    'test_products', 'test_billing_orders', 'test_stars_handlers',
    'test_entitlements', 'test_refunds', 'test_release_gate',
)


def build_product_plan(root: Path, stage: str) -> list[Step]:
    back = {
        'k1-local': K1_BACK, 'k2-pilot': K2_BACK, 'k3-pilot': K3_BACK,
    }[stage]
    npm = 'npm.cmd' if os.name == 'nt' else 'npm'
    steps = []
    for name in dict.fromkeys(back):
        steps.append(Step(
            f'Backend:{name}',
            (sys.executable, '-B', 'scripts/run_backend_tests.py',
             '--suite', f'tests.backend.{name}'),
            ('scripts/run_backend_tests.py', f'tests/backend/{name}.py'),
            'backend',
        ))
    front = K2_FRONT if stage in ('k2-pilot', 'k3-pilot') else K1_FRONT
    for name in front:
        file = f'tests/frontend/{name}.test.cjs'
        steps.append(Step(
            f'Frontend:{name}',
            ('node', '--test', '--test-reporter=tap', file), (file,), 'tap',
        ))
    steps.extend((
        Step('Typecheck', (npm, 'run', 'typecheck'), ('tsconfig.json',)),
        Step('Build', ('node', 'scripts/build-isolated.mjs'), ('scripts/build-isolated.mjs',)),
    ))
    if stage != 'k1-local':
        specs = ('food-flow', 'support', 'persistence')
        if stage == 'k3-pilot':
            specs += ('billing',)
        config = 'playwright.full.config.ts'
        for name in specs:
            file = f'tests/e2e/{name}.spec.ts'
            steps.append(Step(
                f'E2E:{name}',
                ('node', 'node_modules/@playwright/test/cli.js',
                 'test', f'--config={config}', file),
                (config, file), 'playwright',
            ))
    return steps


def build_plan(root: Path, stage: str) -> list[Step]:
    if stage in PRODUCT_GATES:
        return build_product_plan(root, stage)
    if stage == 'public-paid':
        npm = 'npm.cmd' if os.name == 'nt' else 'npm'
        config = 'playwright.full.config.ts'
        return [
            Step('Backend', (sys.executable, '-B', 'scripts/run_backend_tests.py'), ('scripts/run_backend_tests.py',), 'backend'),
            Step('Frontend', (npm, 'run', 'test:unit'), ('package.json',), 'tap'),
            Step('Typecheck', (npm, 'run', 'typecheck'), ('tsconfig.json',)),
            Step('Build', ('node', 'scripts/build-isolated.mjs'), ('scripts/build-isolated.mjs',)),
            Step('E2E', ('npx.cmd' if os.name == 'nt' else 'npx', '--no-install', 'playwright', 'test', f'--config={config}'), (config,), 'playwright'),
        ]
    if stage not in {'checkpoint', 'p0', 'visual', 'free', 'paid'}:
        raise GateError('Unknown verification stage')
    npm = 'npm.cmd' if os.name == 'nt' else 'npm'
    if stage == 'visual':
        back, front, specs = VIS_BACK, VIS_FRONT, VIS_E2E
    else:
        back, front = P0_BACK, P0_FRONT
        specs = ('p0',)
        if stage in {'free', 'paid'}:
            back += FREE_BACK
            front += FREE_FRONT
            specs = FREE_E2E
        if stage == 'paid':
            back += PAID_BACK
            specs += ('billing',)
    back_paths = tuple(f'tests/backend/{name}.py' for name in back)
    front_paths = tuple(f'tests/frontend/{name}.test.cjs' for name in front)
    back_cmd = [sys.executable, '-B', 'scripts/run_backend_tests.py']
    if stage == 'visual':
        back_cmd += ['--suite'] + [f'tests.backend.{name}' for name in back]
    front_cmd = (
        ('node', '--test', '--test-reporter=tap', *front_paths)
        if stage == 'visual'
        else (npm, 'run', 'test:unit')
    )
    steps = [
        Step('Backend', tuple(back_cmd), ('scripts/run_backend_tests.py',) + back_paths, 'backend'),
        Step('Frontend', tuple(front_cmd), front_paths, 'tap'),
        Step('Typecheck', (npm, 'run', 'typecheck'), ('tsconfig.json',)),
        Step('Build', (npm, 'run', 'build'), ('scripts/stamp-release.mjs',)),
    ]
    if stage != 'checkpoint':
        config = 'playwright.full.config.ts' if stage in {'free', 'paid'} else 'playwright.config.ts'
        spec_paths = tuple(f'tests/e2e/{name}.spec.ts' for name in specs)
        steps.append(
            Step(
                'E2E',
                (
                    'npx.cmd' if os.name == 'nt' else 'npx',
                    '--no-install',
                    'playwright',
                    'test',
                    f'--config={config}',
                    *spec_paths,
                ),
                (config,) + spec_paths,
                'playwright',
            )
        )
    return steps


def validate_plan(root: Path, steps: list[Step]) -> None:
    missing = [path for step in steps for path in step.required_paths if not (root / path).is_file()]
    if missing:
        raise GateError('Missing required files: ' + ', '.join(sorted(set(missing))))
    try:
        package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise GateError('Invalid package.json') from exc
    scripts = package.get('scripts', {})
    for script in ('test:unit', 'typecheck', 'build'):
        if not scripts.get(script):
            raise GateError(f'Missing npm script: {script}')
    if any(step.kind == 'playwright' for step in steps):
        if not scripts.get('test:e2e'):
            raise GateError('Missing npm script: test:e2e')
        if '@playwright/test' not in package.get('devDependencies', {}):
            raise GateError('Missing declared Playwright dependency')


def assert_report(kind: str, output: str, root: Path) -> None:
    if kind == 'backend':
        match = re.search(r'BACKEND_RESULT tests=(\d+) failures=(\d+) errors=(\d+) skipped=(\d+)', output)
        if not match or int(match[1]) <= 0 or any(int(match[i]) for i in (2, 3, 4)):
            raise GateError('Invalid, empty, failed or skipped backend collection')
    elif kind == 'tap':
        values = {}
        for name in ('tests', 'fail', 'cancelled', 'skipped', 'todo'):
            match = re.search(rf'(?m)^# {name} (\d+)\s*$', output)
            if not match:
                raise GateError(f'Missing TAP summary: {name}')
            values[name] = int(match[1])
        if values['tests'] <= 0 or any(values[key] for key in ('fail', 'cancelled', 'skipped', 'todo')):
            raise GateError('Empty, failed or incomplete frontend collection')
    elif kind == 'playwright':
        try:
            report = json.loads((root / 'test-results/e2e.json').read_text(encoding='utf-8'))
            stats = report['stats']
            if stats['expected'] <= 0 or any(stats[key] for key in ('unexpected', 'flaky', 'skipped')):
                raise GateError('Empty, failed, flaky or skipped E2E collection')
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise GateError('Missing or invalid E2E report') from exc


def run_step(step: Step, root: Path, env: dict[str, str] | None = None) -> None:
    merged = os.environ.copy()
    merged.pop("PYTHONPATH", None)
    merged['CI'] = '1'
    merged['KETO_LOAD_DOTENV'] = '0'
    merged['PAYMENT_MODE'] = 'disabled'
    merged['PAYMENTS_ENABLED'] = '0'
    merged['APP_STAGE'] = 'test'
    if env:
        merged.update(env)
    merged.update(
        KETO_LOAD_DOTENV='0',
        PYTHONDONTWRITEBYTECODE='1',
        PAYMENT_MODE='disabled',
        PAYMENTS_ENABLED='0',
        APP_STAGE='test',
    )
    if step.kind == 'playwright':
        (root / 'test-results/e2e.json').unlink(missing_ok=True)
    result = subprocess.run(
        step.command,
        cwd=root,
        env=merged,
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace',
        shell=False,
    )
    print(result.stdout, end='')
    print(result.stderr, end='', file=sys.stderr)
    if result.returncode:
        raise GateError(f'{step.name} failed with exit code {result.returncode}')
    assert_report(step.kind, result.stdout + '\n' + result.stderr, root)


def main(default_stage: str = 'p0') -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        '--stage', choices=['visual', 'free', 'paid', 'p0', 'public-paid', *PRODUCT_GATES],
        default=default_stage,
    )
    parser.add_argument('--checkpoint', nargs='?', const='current')
    args = parser.parse_args()
    stage = 'checkpoint' if args.checkpoint is not None else args.stage
    try:
        steps = build_plan(ROOT, stage)
        validate_plan(ROOT, steps)
        for step in steps:
            print(f'[RUN] {step.name}')
            run_step(step, ROOT)
    except (GateError, OSError) as exc:
        print(f'[BLOCKED] {exc}', file=sys.stderr)
        return 1
    if stage == 'checkpoint':
        print('[CHECKPOINT PASSED] Not a full release approval')
    else:
        print(f'[TECHNICAL STAGE PASSED] {stage}; external/business approvals remain separate')
    return 0


if __name__ == '__main__':
    sys.exit(main())

