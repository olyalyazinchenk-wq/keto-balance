"""scripts/prepare_server_xray_config.py
Generates a minimal, secure, server-side Xray config for Cloud.ru VM.
Binds strictly to loopback (127.0.0.1:10808 for SOCKS5, 127.0.0.1:10809 for HTTP).
Routes all traffic from inbounds directly to the authorized VLESS outbound.
"""
import json
import os
import sys
import subprocess
from pathlib import Path

SECRETS_DIR = Path(__file__).resolve().parent.parent / ".secrets"
INPUT_FILE = SECRETS_DIR / "telegram_proxy.json"
OUTPUT_FILE = SECRETS_DIR / "xray_server_config.json"

def prepare_config() -> bool:
    if not INPUT_FILE.is_file():
        print(f"[ERROR] Input file {INPUT_FILE} not found.", file=sys.stderr)
        return False

    try:
        raw_data = json.loads(INPUT_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[ERROR] Failed to parse {INPUT_FILE}: {e}", file=sys.stderr)
        return False

    outbounds = raw_data.get("outbounds", [])
    vless_outbound = None
    for ob in outbounds:
        proto = ob.get("protocol") or ob.get("type")
        if proto == "vless":
            vless_outbound = ob
            break

    if not vless_outbound:
        print("[ERROR] No VLESS outbound found in profile.", file=sys.stderr)
        return False

    # Force tag to 'proxy'
    vless_outbound["tag"] = "proxy"

    server_config = {
        "log": {
            "loglevel": "warning"
        },
        "inbounds": [
            {
                "tag": "socks-in",
                "port": 10808,
                "listen": "127.0.0.1",
                "protocol": "socks",
                "settings": {
                    "auth": "noauth",
                    "udp": True
                }
            },
            {
                "tag": "http-in",
                "port": 10809,
                "listen": "127.0.0.1",
                "protocol": "http"
            }
        ],
        "outbounds": [
            vless_outbound,
            {
                "tag": "direct",
                "protocol": "freedom"
            },
            {
                "tag": "block",
                "protocol": "blackhole"
            }
        ],
        "routing": {
            "domainStrategy": "AsIs",
            "rules": [
                {
                    "type": "field",
                    "inboundTag": ["socks-in", "http-in"],
                    "outboundTag": "proxy"
                }
            ]
        }
    }

    OUTPUT_FILE.write_text(json.dumps(server_config, indent=2, ensure_ascii=False), encoding="utf-8")
    if sys.platform == "win32":
        user = os.environ.get("USERNAME", "")
        if not user:
            raise RuntimeError("Cannot determine current Windows USERNAME to restrict permissions")
        res = subprocess.run(
            ["icacls", str(OUTPUT_FILE), "/inheritance:r", "/grant:r", f"{user}:F"],
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode != 0:
            raise RuntimeError(f"Failed to restrict permissions on {OUTPUT_FILE}: {res.stderr.strip()}")

    print("[OK] Server Xray configuration prepared successfully at .secrets/xray_server_config.json. Secrets not exposed.")
    return True

if __name__ == "__main__":
    success = prepare_config()
    sys.exit(0 if success else 1)
