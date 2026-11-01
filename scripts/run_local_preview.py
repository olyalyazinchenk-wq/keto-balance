#!/usr/bin/env python3
"""Local Browser Preview Launcher for Olga (Owner-Only Demo).

Features:
- Binds strictly to 127.0.0.1 on isolated port 18080.
- Enables /api/demo-session for owner ID 1084557944 in test stage.
- Immediate 1-click bootstrap without Telegram WebApp wrapper:
  http://127.0.0.1:18080/?demo_user=1084557944
- Enforces owner ID allowlist (1084557944) on demo session endpoint.
- Strictly isolated SQLite database in scratch/preview_pilot.db.
- Auto-shutdown timer (default: 3600s / 1 hour).
- Writes and cleans PID file in scratch/preview.pid.
"""

import argparse
import os
import signal
import sys
import tempfile
import threading
from pathlib import Path

# Safety guards
os.environ["KETO_LOAD_DOTENV"] = "0"
os.environ["APP_STAGE"] = "test"
os.environ["PAYMENTS_ENABLED"] = "0"
os.environ["PAYMENT_MODE"] = "disabled"

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

FORBIDDEN_PORTS = {8000, 4387, 8090, 10808, 10809}
DEFAULT_OWNER_ID = 1084557944
DEFAULT_LIFETIME_SECONDS = 3600
SYNTHETIC_KEY = "preview-demo-signing-key-not-a-telegram-token"


def get_scratch_dir() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        scratch = Path(local_app_data) / "hermes" / "cache" / "scratch"
    else:
        scratch = Path(tempfile.gettempdir()) / "hermes" / "cache" / "scratch"
    scratch.mkdir(parents=True, exist_ok=True)
    return scratch


def main():
    parser = argparse.ArgumentParser(description="Local Browser Preview Launcher for Olga")
    parser.add_argument("--port", type=int, default=18080, help="Port to bind (default: 18080)")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind (strictly loopback, default: 127.0.0.1)")
    parser.add_argument("--owner-id", type=int, default=DEFAULT_OWNER_ID, help="Owner ID (default: 1084557944)")
    parser.add_argument("--lifetime", type=int, default=DEFAULT_LIFETIME_SECONDS, help="Lifetime in seconds before auto-shutdown (default: 3600)")
    parser.add_argument("--db", type=str, default="", help="Custom isolated DB path")
    parser.add_argument("--dist", type=str, default="", help="Custom dist directory")
    parser.add_argument("--catalog", type=str, default="", help="Custom catalog JSON path (or approved demo sidecar)")
    args = parser.parse_args()

    # 1. Strictly enforce loopback
    def is_loopback_host(h: str) -> bool:
        if h in ("127.0.0.1", "localhost", "::1"):
            return True
        try:
            import ipaddress
            return ipaddress.ip_address(h).is_loopback
        except ValueError:
            return False

    if not is_loopback_host(args.host):
        print(f"[ERROR] Non-loopback host '{args.host}' is forbidden for preview demo. Must bind to 127.0.0.1.", file=sys.stderr)
        sys.exit(1)

    # 2. Port check
    if args.port in FORBIDDEN_PORTS:
        print(f"[ERROR] Port {args.port} is reserved. Use an isolated port (e.g. 18080).", file=sys.stderr)
        sys.exit(1)

    # 3. Lifetime check
    if not (0 < args.lifetime <= 86400):
        print(f"[ERROR] Invalid lifetime {args.lifetime}s. Must be between 1 and 86400 seconds.", file=sys.stderr)
        sys.exit(1)

    scratch = get_scratch_dir()

    # 4. Dist directory check
    if args.dist:
        dist_path = Path(args.dist).resolve()
    else:
        receipt_path = scratch / "latest-build-receipt.json"
        dist_path = None
        if receipt_path.is_file():
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

    # 5. Catalog loading (5 candidates demo sidecar)
    catalog_provider = None
    catalog_path = Path(args.catalog).resolve() if args.catalog else None
    if catalog_path is None:
        receipt_path = scratch / "latest-build-receipt.json"
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

    catalog_info = "empty"
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

    # 6. Database path and per-run root
    if args.db:
        db_path = Path(args.db).resolve()
        root_db = (ROOT / "bot" / "keto_balance.db").resolve()
        if db_path == root_db or db_path.parent == (ROOT / "bot").resolve():
            print("[ERROR] Pointing preview to root working database is forbidden.", file=sys.stderr)
            sys.exit(1)
        run_root = db_path.parent
    else:
        import time
        run_id = f"preview-run-{int(time.time())}-{os.getpid()}"
        run_root = scratch / run_id
        run_root.mkdir(parents=True, exist_ok=True)
        db_path = run_root / "preview_pilot.db"

    pid_file = run_root / "preview.pid"

    # 7. VALIDATE SETTINGS BEFORE DB INITIALIZATION
    from bot.app_settings import AppSettings
    from bot.app_db import init_db
    from bot.server import create_app
    import uvicorn

    owner_allowlist = frozenset([args.owner_id])
    settings = AppSettings(
        app_stage="test",
        telegram_bot_token=SYNTHETIC_KEY,
        owner_allowlist=owner_allowlist,
        allow_demo_auth=True,
        allow_anonymous_preview=False,
        session_max_lifetime_seconds=args.lifetime,
        db_path=db_path,
        dist_dir=dist_path,
    )

    # 8. Initialize DB only after configuration validation
    init_db(db_path)

    app = create_app(
        dist_dir=dist_path,
        db_path=db_path,
        settings=settings,
        catalog_provider=catalog_provider,
    )

    # 9. Server configuration and timer setup (server constructed before timer)
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

    def shutdown_server():
        print(f"\n[PREVIEW] Maximum lifetime of {args.lifetime}s expired. Shutting down cleanly...", flush=True)
        server.should_exit = True

    timer = threading.Timer(float(args.lifetime), shutdown_server)
    timer.daemon = True
    timer.start()

    def sig_handler(sig, frame):
        print(f"\n[PREVIEW] Received signal {sig}. Terminating...", flush=True)
        timer.cancel()
        server.should_exit = True
        clean_pid()
        sys.exit(0)

    signal.signal(signal.SIGINT, sig_handler)
    signal.signal(signal.SIGTERM, sig_handler)

    preview_url = f"http://{args.host}:{args.port}/?demo_user={args.owner_id}"

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
    print("  КЕТО БАЛАНС: LOCAL BROWSER PREVIEW FOR OLGA", flush=True)
    print("=" * 60, flush=True)
    print(f"  Stage:          test (isolated demo auth)", flush=True)
    print(f"  Preview URL:    {preview_url}", flush=True)
    print(f"  Owner ID:       {args.owner_id}", flush=True)
    print(f"  Auto-Shutdown:  {args.lifetime} seconds (1 hour)", flush=True)
    print(f"  Dist Dir:       {dist_path} ({release_info})", flush=True)
    print(f"  Catalog:        {catalog_info}", flush=True)
    print(f"  Database:       {db_path}", flush=True)
    print(f"  PID File:       {pid_file} (PID {os.getpid()})", flush=True)
    print("=" * 60, flush=True)
    print(f"\n👉 Откройте в браузере: {preview_url}\n", flush=True)

    try:
        server.run()
    finally:
        timer.cancel()
        clean_pid()
        print("[PREVIEW] Server terminated cleanly.", flush=True)


if __name__ == "__main__":
    main()
