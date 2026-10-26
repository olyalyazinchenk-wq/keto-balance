"""
verify-p0.py — скрипт валидации этапа P0.
Запускает последовательно проверки backend unittest, frontend unit, typecheck, build.
"""
import sys
import os
import shutil
import subprocess
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def run_cmd(cmd: list[str], desc: str, env: dict | None = None) -> None:
    print(f"\n[RUN] {desc}: {' '.join(cmd)}")
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    merged_env.pop("PYTHONPATH", None)
    merged_env["_VERIFY_P0_INTERNAL"] = "1"
    res = subprocess.run(cmd, cwd=str(ROOT), env=merged_env)
    if res.returncode != 0:
        print(f"[FAIL] {desc} returned exit code {res.returncode}", file=sys.stderr)
        sys.exit(res.returncode)
    print(f"[PASS] {desc}")

MANDATORY_BACKEND_TESTS = [
    "test_import_safety.py",
    "test_database.py",
    "test_payments_disabled.py",
    "test_payment_callbacks.py",
    "test_server_security.py",
    "test_safety.py",
    "test_verify_script.py",
]

MANDATORY_FRONTEND_TESTS = [
    "harness.test.cjs",
    "catalog.test.cjs",
    "eligibility.test.cjs",
    "menu.test.cjs",
    "replacement.test.cjs",
    "honesty.test.cjs",
    "safety.test.cjs",
]

MANDATORY_E2E_SPECS = [
    "tests/e2e/p0.spec.ts",
]

def main():
    parser = argparse.ArgumentParser(description="Keto Balance P0 Verifier")
    parser.add_argument(
        "--checkpoint",
        nargs="?",
        const="current",
        default=None,
        help="Run in checkpoint mode without asserting full P0 readiness"
    )
    args = parser.parse_args()

    is_checkpoint = args.checkpoint is not None
    checkpoint_name = args.checkpoint or "current"

    print("=== Keto Balance P0 Verification ===")
    if is_checkpoint:
        print(f"Mode: CHECKPOINT ({checkpoint_name})")
    else:
        print("Mode: FULL P0 AUDIT")
    
    backend_tests = list((ROOT / "tests" / "backend").glob("test_*.py"))
    frontend_tests = list((ROOT / "tests" / "frontend").glob("*.test.cjs"))
    e2e_spec = ROOT / "tests" / "e2e" / "p0.spec.ts"

    # 1. Проверка наличия обязательных тестовых файлов
    missing = []
    if not is_checkpoint:
        for f in MANDATORY_BACKEND_TESTS:
            if not (ROOT / "tests" / "backend" / f).exists():
                missing.append(f"tests/backend/{f}")
        for f in MANDATORY_FRONTEND_TESTS:
            if not (ROOT / "tests" / "frontend" / f).exists():
                missing.append(f"tests/frontend/{f}")
        for f in MANDATORY_E2E_SPECS:
            if not (ROOT / f).exists():
                missing.append(f)

        if missing:
            print(f"[BLOCKED] Full P0 audit requires all mandatory test suites. Missing {len(missing)} files:", file=sys.stderr)
            for m in missing:
                print(f"  - {m}", file=sys.stderr)
            print("Hint: Run with --checkpoint <name> for intermediate checkpoint verification.", file=sys.stderr)
            sys.exit(1)
    
    if not backend_tests:
        print("[FAIL] No backend test files found!", file=sys.stderr)
        sys.exit(1)
    if not frontend_tests:
        print("[FAIL] No frontend test files found!", file=sys.stderr)
        sys.exit(1)

    npm_bin = "npm.cmd" if os.name == "nt" else "npm"
    npm_path = shutil.which(npm_bin) or npm_bin
    python_bin = sys.executable
    
    # 2. Backend tests
    run_cmd(
        [python_bin, "-B", "-m", "unittest", "discover", "-s", "tests/backend", "-p", "test_*.py", "-v"],
        "Backend Unit Tests (isolated)"
    )
    
    # 3. Frontend unit tests
    run_cmd(
        [npm_path, "run", "test:unit"],
        "Frontend Unit Tests (node:test)"
    )
        
    # 4. TypeScript typecheck
    run_cmd(
        [npm_path, "run", "typecheck"],
        "TypeScript Typecheck (tsc --noEmit)"
    )
    
    # 5. Build
    run_cmd(
        [npm_path, "run", "build"],
        "Vite Frontend Production Build"
    )
    
    # 6. E2E tests
    if e2e_spec.exists():
        run_cmd(
            [npm_path, "run", "test:e2e"],
            "Playwright E2E Tests"
        )
        
    if is_checkpoint:
        print(f"\n[CHECKPOINT PASSED] Checkpoint '{checkpoint_name}' verified successfully.")
    else:
        print("\n[SUCCESS] All P0 verifications passed!")

if __name__ == "__main__":
    main()
