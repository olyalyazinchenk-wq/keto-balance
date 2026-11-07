"""scripts/import_proxy_secret.py
Secure helper to import a single authorized proxy profile without leaking secrets.
Supports URI links and Xray/Sing-box JSON configurations.
"""
import json
import os
import sys
import subprocess
from pathlib import Path

SECRETS_DIR = Path(__file__).resolve().parent.parent / ".secrets"
TARGET_FILE_TXT = SECRETS_DIR / "telegram_proxy.txt"
TARGET_FILE_JSON = SECRETS_DIR / "telegram_proxy.json"

SUPPORTED_SCHEMES = ("vless://", "vmess://", "ss://", "trojan://", "socks5://")

def get_clipboard_text() -> str:
    if sys.platform == "win32":
        try:
            res = subprocess.run(
                ["powershell", "-NoProfile", "-Command", "Get-Clipboard"],
                capture_output=True,
                text=True,
                check=True,
            )
            return res.stdout.strip()
        except Exception:
            return ""
    return ""

def restrict_permissions(target_file: Path) -> None:
    if sys.platform == "win32":
        try:
            user = os.environ.get("USERNAME", "")
            if user:
                subprocess.run(
                    ["icacls", str(target_file), "/inheritance:r", "/grant:r", f"{user}:F"],
                    capture_output=True,
                    check=False,
                )
        except Exception:
            pass

def import_profile() -> bool:
    SECRETS_DIR.mkdir(parents=True, exist_ok=True)
    text = get_clipboard_text()

    if not text:
        print("[ERROR] Clipboard is empty.", file=sys.stderr)
        return False

    # Check if text is JSON config
    if text.startswith("{") and text.endswith("}"):
        try:
            data = json.loads(text)
            outbounds = data.get("outbounds", [])
            protocols = [o.get("protocol") or o.get("type") for o in outbounds if isinstance(o, dict)]
            main_proto = protocols[0] if protocols else "unknown"
            
            TARGET_FILE_JSON.write_text(text, encoding="utf-8")
            restrict_permissions(TARGET_FILE_JSON)
            print(f"[OK] Authorized profile saved securely to telegram_proxy.json. Protocol: {main_proto.upper()}. Secrets not exposed.")
            return True
        except Exception as e:
            print(f"[ERROR] Failed to parse JSON: {e}", file=sys.stderr)
            return False

    # Check URI schemes
    scheme = ""
    for s in SUPPORTED_SCHEMES:
        if text.lower().startswith(s):
            scheme = s[:-3].upper()
            break

    if scheme:
        TARGET_FILE_TXT.write_text(text, encoding="utf-8")
        restrict_permissions(TARGET_FILE_TXT)
        print(f"[OK] Authorized profile saved securely to telegram_proxy.txt. Protocol: {scheme}. Secrets not exposed.")
        return True

    print("[ERROR] Unsupported format. Expected link starting with vless://, vmess://, etc. or a JSON config.", file=sys.stderr)
    return False

if __name__ == "__main__":
    success = import_profile()
    sys.exit(0 if success else 1)
