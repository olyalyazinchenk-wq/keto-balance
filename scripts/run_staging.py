#!/usr/bin/env python3
"""Owner-Only Staging Launcher for Telegram WebApp Validation.

Features:
- Enforces owner allowlist (ID 1084557944) after HMAC validation before any user creation.
- Disables payments (PAYMENTS_ENABLED=0).
- Disables demo auth and anonymous bypass.
- Strictly bounds execution time (default: 1 hour / 3600 seconds auto-shutdown).
- Binds to isolated test port (default 18080), avoiding reserved system ports.
- Isolated SQLite database in scratch/staging_pilot.db.
- Writes and cleans PID file in scratch/staging.pid.
"""

import argparse
import asyncio
import os
import signal
import sys
import tempfile
import threading
from pathlib import Path

# Safety guards: strictly no dotenv loading from root
os.environ["KETO_LOAD_DOTENV"] = "0"
if "APP_STAGE" not in os.environ:
    os.environ["APP_STAGE"] = "staging"
os.environ["PAYMENTS_ENABLED"] = "0"
os.environ["PAYMENT_MODE"] = "disabled"

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

FORBIDDEN_PORTS = {8000, 18080, 4387, 8090, 10808, 10809}
DEFAULT_OWNER_ID = 1084557944
DEFAULT_LIFETIME_SECONDS = 3600  # 1 hour


def get_scratch_dir() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        scratch = Path(local_app_data) / "hermes" / "cache" / "scratch"
    else:
        scratch = Path(tempfile.gettempdir()) / "hermes" / "cache" / "scratch"
    scratch.mkdir(parents=True, exist_ok=True)
    return scratch


def main():
    parser = argparse.ArgumentParser(description="Owner-Only Staging Launcher for Telegram WebApp")
    parser.add_argument("--token", type=str, default="", help="Telegram Bot Token")
    parser.add_argument("--token-file", type=str, default="", help="Path to file containing Telegram Bot Token")
    parser.add_argument("--port", type=int, default=18081, help="Port to bind (default: 18081)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--owner-id", type=int, default=DEFAULT_OWNER_ID, help="Allowed Telegram user ID (default: 1084557944)")
    parser.add_argument("--lifetime", type=int, default=DEFAULT_LIFETIME_SECONDS, help="Lifetime in seconds before auto-shutdown (default: 3600)")
    parser.add_argument("--persistent", action="store_true", help="Reuse fixed staging database (data/staging_pilot.db) across restarts without auto-shutdown")
    parser.add_argument("--receipt", type=str, default="", help="Path to build-receipt.json")
    parser.add_argument("--db", type=str, default="", help="Custom isolated DB path")
    parser.add_argument("--dist", type=str, default="", help="Custom dist directory")
    parser.add_argument("--catalog", type=str, default="", help="Custom catalog JSON path (or approved demo sidecar)")
    args = parser.parse_args()

    if args.port in FORBIDDEN_PORTS:
        print(f"[ERROR] Port {args.port} is reserved for existing system services. Use an isolated port (e.g. 18081).", file=sys.stderr)
        sys.exit(1)

    if not (0 < args.lifetime <= 86400):
        print(f"[ERROR] Invalid lifetime {args.lifetime}s. Must be between 1 and 86400 seconds.", file=sys.stderr)
        sys.exit(1)

    bot_token = ""
    if args.token_file:
        tf = Path(args.token_file).resolve()
        if tf.is_file():
            bot_token = tf.read_text(encoding="utf-8").strip()
    if not bot_token and args.token:
        bot_token = args.token.strip()
    if not bot_token:
        bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", os.environ.get("KETO_BOT_TOKEN", "")).strip()

    if not bot_token:
        print("[ERROR] Telegram bot token is required for staging mode.", file=sys.stderr)
        print("Pass via --token-file <path>, TELEGRAM_BOT_TOKEN environment variable, or --token.", file=sys.stderr)
        sys.exit(1)

    scratch = get_scratch_dir()

    receipt_path = Path(args.receipt).resolve() if args.receipt else (scratch / "latest-build-receipt.json")
    if not receipt_path.is_file():
        alt_receipt = scratch / "build-receipt.json"
        if alt_receipt.is_file():
            receipt_path = alt_receipt

    dist_path = None
    if args.dist:
        dist_path = Path(args.dist).resolve()
    elif receipt_path.is_file():
        try:
            import json
            r_data = json.loads(receipt_path.read_text(encoding="utf-8"))
            d_cand = Path(r_data.get("dist_dir", ""))
            if d_cand.is_dir() and (d_cand / "index.html").is_file():
                dist_path = d_cand
        except Exception:
            pass
    if dist_path is None:
        dist_path = ROOT / "dist"

    if not dist_path.is_dir() or not (dist_path / "index.html").is_file():
        print(f"[ERROR] Dist directory not found or index.html missing: {dist_path}", file=sys.stderr)
        print("Run build first: node scripts/build-isolated.mjs", file=sys.stderr)
        sys.exit(1)

    # Catalog loading (approved-for-demo sidecar connection)
    catalog_provider = None
    catalog_path = Path(args.catalog).resolve() if args.catalog else None
    if catalog_path is None:
        if receipt_path.is_file():
            try:
                import json
                r_data = json.loads(receipt_path.read_text(encoding="utf-8"))
                cand = Path(r_data.get("test_catalog_path", ""))
                if cand.is_file():
                    catalog_path = cand
            except Exception:
                pass
    if catalog_path is None:
        fixture_cat = ROOT / "tests" / "fixtures" / "pilot" / "catalog.json"
        if fixture_cat.is_file():
            catalog_path = fixture_cat

    catalog_info = "standard (empty production allowlist)"
    if catalog_path and catalog_path.is_file():
        try:
            import json
            cat_data = json.loads(catalog_path.read_text(encoding="utf-8"))
            if isinstance(cat_data, dict) and "recipes" in cat_data:
                catalog_provider = lambda: cat_data
                catalog_info = f"{len(cat_data.get('recipes', []))} recipes ({cat_data.get('catalog_id', 'custom')})"
        except Exception as e:
            print(f"[ERROR] Failed to load catalog from {catalog_path}: {e}", file=sys.stderr)
            sys.exit(1)

    # Database
    if args.db:
        db_path = Path(args.db).resolve()
        root_db = (ROOT / "bot" / "keto_balance.db").resolve()
        if db_path == root_db or db_path.parent == (ROOT / "bot").resolve():
            print("[ERROR] Pointing staging to root working database is forbidden.", file=sys.stderr)
            sys.exit(1)
        run_root = db_path.parent
    elif args.persistent:
        db_path = (ROOT / "data" / "staging_pilot.db").resolve()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        run_root = db_path.parent
    else:
        import time
        run_id = f"staging-run-{int(time.time())}-{os.getpid()}"
        run_root = scratch / run_id
        run_root.mkdir(parents=True, exist_ok=True)
        db_path = run_root / "staging_pilot.db"

    pid_file = run_root / "staging.pid"

    # VALIDATE SETTINGS BEFORE DB INITIALIZATION
    from bot.app_settings import AppSettings
    from bot.app_db import init_db
    from bot.server import create_app
    import uvicorn

    owner_allowlist = frozenset([args.owner_id])
    session_lifetime = None if args.persistent else args.lifetime
    settings = AppSettings(
        app_stage="staging",
        telegram_bot_token=bot_token,
        owner_allowlist=owner_allowlist,
        allow_demo_auth=False,
        allow_anonymous_preview=False,
        session_max_lifetime_seconds=session_lifetime,
        db_path=db_path,
        dist_dir=dist_path,
    )

    # Initialize DB only after configuration validation
    init_db(db_path)

    app = create_app(
        dist_dir=dist_path,
        db_path=db_path,
        settings=settings,
        catalog_provider=catalog_provider,
    )

    config = uvicorn.Config(
        app,
        host=args.host,
        port=args.port,
        log_level="info",
        access_log=False,
    )
    server = uvicorn.Server(config)

    # Write PID
    pid_file.write_text(str(os.getpid()), encoding="utf-8")

    def clean_pid():
        try:
            if pid_file.is_file() and pid_file.read_text(encoding="utf-8").strip() == str(os.getpid()):
                pid_file.unlink()
        except Exception:
            pass

    timer = None
    if not args.persistent and args.lifetime and args.lifetime > 0:
        def shutdown_server():
            print(f"\n[STAGING] Maximum lifetime of {args.lifetime}s expired. Shutting down cleanly...", flush=True)
            server.should_exit = True

        timer = threading.Timer(float(args.lifetime), shutdown_server)
        timer.daemon = True
        timer.start()
    else:
        print("[STAGING] Persistent mode enabled: 3600s auto-shutdown is disabled.", flush=True)

    def sig_handler(sig, frame):
        print(f"\n[STAGING] Received signal {sig}. Terminating...", flush=True)
        if timer is not None:
            timer.cancel()
        server.should_exit = True
        clean_pid()
        sys.exit(0)

    signal.signal(signal.SIGINT, sig_handler)
    signal.signal(signal.SIGTERM, sig_handler)

    # Read release metadata if available
    release_info = "unversioned"
    release_file = dist_path / "release.json"
    if release_file.is_file():
        try:
            import json
            rel_meta = json.loads(release_file.read_text(encoding="utf-8"))
            release_info = f"build={rel_meta.get('buildId', 'unknown')} backend={rel_meta.get('backendFingerprint', 'unknown')}"
        except Exception:
            pass

    print("=" * 60, flush=True)
    print("  КЕТО БАЛАНС: OWNER-ONLY STAGING SERVER", flush=True)
    print("=" * 60, flush=True)
    print(f"  Stage:          staging", flush=True)
    print(f"  Host:           {args.host}", flush=True)
    print(f"  Port:           {args.port}", flush=True)
    print(f"  Owner Allowlist:[{args.owner_id}] (non-owners will get HTTP 403)", flush=True)
    print(f"  Payments:       DISABLED", flush=True)
    print(f"  Demo Auth:      DISABLED", flush=True)
    if args.persistent:
        print(f"  Auto-Shutdown:  DISABLED (--persistent mode)", flush=True)
    else:
        print(f"  Auto-Shutdown:  {args.lifetime} seconds (1 hour)", flush=True)
    print(f"  Dist Dir:       {dist_path} ({release_info})", flush=True)
    print(f"  Catalog:        {catalog_info}", flush=True)
    print(f"  Database:       {db_path}", flush=True)
    print(f"  PID File:       {pid_file} (PID {os.getpid()})", flush=True)
    print("=" * 60, flush=True)

    try:
        server.run()
    finally:
        if timer is not None:
            timer.cancel()
        clean_pid()
        print("[STAGING] Server terminated cleanly.", flush=True)


if __name__ == "__main__":
    main()
