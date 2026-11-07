"""scripts/import_proxy_secret.py
Secure helper to import a single authorized proxy profile without leaking secrets.
"""
import os
import sys
import subprocess
from pathlib import Path

SECRETS_DIR = Path(__file__).resolve().parent.parent / ".secrets"
TARGET_FILE = SECRETS_DIR / "telegram_proxy.txt"

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

def import_profile(from_clipboard: bool = True) -> bool:
    SECRETS_DIR.mkdir(parents=True, exist_ok=True)
    if from_clipboard:
        text = get_clipboard_text()
    elif TARGET_FILE.is_file():
        text = TARGET_FILE.read_text(encoding="utf-8").strip()
    else:
        print("[ERROR] No profile in clipboard and file does not exist.", file=sys.stderr)
        return False

    if not text:
        print("[ERROR] Clipboard or file is empty.", file=sys.stderr)
        return False

    scheme = ""
    for s in SUPPORTED_SCHEMES:
        if text.lower().startswith(s):
            scheme = s[:-3].upper()
            break

    if not scheme:
        print("[ERROR] Unsupported format. Expected link starting with vless://, vmess://, ss://, or trojan://", file=sys.stderr)
        return False

    # Save to protected file
    TARGET_FILE.write_text(text, encoding="utf-8")
    # On Windows, enforce restrictive ACL
    if sys.platform == "win32":
        try:
            user = os.environ.get("USERNAME", "")
            if user:
                subprocess.run(
                    ["icacls", str(TARGET_FILE), "/inheritance:r", "/grant:r", f"{user}:F"],
                    capture_output=True,
                    check=False,
                )
        except Exception:
            pass

    print(f"[OK] Authorized profile saved securely. Protocol: {scheme}. Secrets not exposed.")
    return True

if __name__ == "__main__":
    from_clip = "--from-file" not in sys.argv
    success = import_profile(from_clipboard=from_clip)
    sys.exit(0 if success else 1)
