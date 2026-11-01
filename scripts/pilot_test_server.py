import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

# Enforce no dotenv loading and test stage before importing bot modules
os.environ['KETO_LOAD_DOTENV'] = '0'
os.environ['APP_STAGE'] = 'test'
os.environ['PAYMENTS_ENABLED'] = '0'
os.environ['PAYMENT_MODE'] = 'disabled'

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

FORBIDDEN_PORTS = {8000, 4387, 8090, 10808, 10809}
SYNTHETIC_SIGNING_KEY = "synthetic-pilot-signing-key-not-a-telegram-token"


def get_scratch_dir() -> Path:
    local_app_data = os.environ.get('LOCALAPPDATA', '')
    if local_app_data:
        scratch = Path(local_app_data) / 'hermes' / 'cache' / 'scratch'
    else:
        scratch = Path(tempfile.gettempdir()) / 'hermes' / 'cache' / 'scratch'
    scratch.mkdir(parents=True, exist_ok=True)
    return scratch


def main():
    parser = argparse.ArgumentParser(description="Isolated Test HTTP Server for Pilot E2E Verification")
    parser.add_argument("--port", type=int, default=18080, help="Port to bind (default: 18080)")
    parser.add_argument("--dist", type=str, default="", help="Path to isolated dist directory (defaults to latest scratch build or dist/)")
    parser.add_argument("--catalog", type=str, default="", help="Path to synthetic test catalog JSON (defaults to fixture catalog)")
    parser.add_argument("--db", type=str, default="", help="Path to isolated test SQLite DB")
    args = parser.parse_args()

    if args.port in FORBIDDEN_PORTS:
        print(f"[ERROR] Port {args.port} is reserved for existing services and cannot be used by test server.", file=sys.stderr)
        sys.exit(1)

    scratch = get_scratch_dir()
    latest_receipt_file = scratch / "latest-build-receipt.json"
    discovered_dist = None
    discovered_catalog = None

    if latest_receipt_file.is_file():
        try:
            with open(latest_receipt_file, "r", encoding="utf-8") as f:
                rdata = json.load(f)
                if rdata.get("dist_dir") and Path(rdata["dist_dir"]).is_dir():
                    discovered_dist = Path(rdata["dist_dir"])
                if rdata.get("test_catalog_path") and Path(rdata["test_catalog_path"]).is_file():
                    discovered_catalog = Path(rdata["test_catalog_path"])
        except Exception:
            pass

    if args.dist:
        dist_path = Path(args.dist).resolve()
    elif discovered_dist:
        dist_path = discovered_dist
    else:
        candidate = ROOT / "dist"
        if candidate.is_dir() and (candidate / "index.html").is_file():
            dist_path = candidate
        else:
            print("[ERROR] Dist directory not specified and no isolated build receipt found. Run node scripts/build-isolated.mjs first.", file=sys.stderr)
            sys.exit(1)

    if not dist_path.is_dir():
        print(f"[ERROR] Dist directory not found: {dist_path}", file=sys.stderr)
        sys.exit(1)

    if args.catalog:
        catalog_path = Path(args.catalog).resolve()
    elif discovered_catalog:
        catalog_path = discovered_catalog
    else:
        candidate = ROOT / "tests" / "fixtures" / "pilot" / "catalog.json"
        if candidate.is_file():
            catalog_path = candidate
        else:
            print("[ERROR] Catalog file not specified and fixture catalog not found.", file=sys.stderr)
            sys.exit(1)

    if not catalog_path.is_file():
        print(f"[ERROR] Catalog file not found: {catalog_path}", file=sys.stderr)
        sys.exit(1)

    with open(catalog_path, "r", encoding="utf-8") as f:
        catalog_data = json.load(f)

    if args.db:
        db_path = Path(args.db).resolve()
        db_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        temp_dir = tempfile.TemporaryDirectory(prefix="pilot-test-server-", dir=scratch)
        db_path = Path(temp_dir.name) / "test_pilot.db"

    from bot.app_settings import AppSettings
    from bot.app_db import init_db
    from bot.server import create_app
    import uvicorn

    init_db(db_path)

    released_ids = frozenset(catalog_data.get("released_ids", []))
    settings = AppSettings(
        app_stage="test",
        telegram_bot_token=SYNTHETIC_SIGNING_KEY,
        allow_anonymous_preview=False,
        db_path=db_path,
        dist_dir=dist_path,
        released_recipe_ids=released_ids,
    )

    catalog_provider = lambda: catalog_data

    app = create_app(
        dist_dir=dist_path,
        db_path=db_path,
        settings=settings,
        catalog_provider=catalog_provider,
    )

    print(f"[PILOT_TEST_SERVER] Starting isolated test server on http://127.0.0.1:{args.port}", flush=True)
    print(f"[PILOT_TEST_SERVER] Dist: {dist_path}", flush=True)
    print(f"[PILOT_TEST_SERVER] DB: {db_path}", flush=True)
    print(f"[PILOT_TEST_SERVER] Catalog: {catalog_path} (released_ids: {len(released_ids)})", flush=True)

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
