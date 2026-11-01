#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/home_pilot.py — Unified Process Manager & Orchestrator for Home Pilot (Port 18081).

Features:
- Validates and enforces execution under project virtualenv (.venv-p0/Scripts/python.exe).
- Subcommands: start, stop, status, restart, supervisor.
- Manages staging server on port 18081 (--persistent) and SSH tunnel (localhost.run).
- Saves and tracks process metadata in .home_pilot_state.json (pid, create_time, executable, port, started_at, receipt_path).
- Duplicate prevention: checks running state and listening port before spawning.
- Safe termination: checks PID + create_time + executable matching before terminating.
- Cleans up child SSH tunnel processes safely without affecting foreign sessions.
- Pinned build receipt verification: checks local & public endpoints match receipt fingerprint and build ID.
- Reliable readiness check with discrete LOCAL_READY and PUBLIC_READY modes.
- Exponential backoff recovery (5, 10, 20, 40, 60s) resetting only on confirmed public readiness.
"""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from typing import Any, Dict, Optional, Tuple

ROOT = Path(__file__).resolve().parent.parent
STATE_FILE = ROOT / ".home_pilot_state.json"
LOGS_DIR = ROOT / "logs"
TUNNEL_URL_FILE = ROOT / "current_tunnel_url.txt"
SSH_STATE_FILE = ROOT / ".tunnel_ssh_state.json"
STAGING_PORT = 18081
OLGA_CHAT_ID = 1084557944
BACKOFF_STEPS = [5, 10, 20, 40, 60]


def ensure_venv_python() -> Path:
    """Validates that execution uses project virtualenv .venv-p0."""
    expected_python = ROOT / ".venv-p0" / "Scripts" / "python.exe"
    if not expected_python.is_file():
        expected_python = ROOT / ".venv-p0" / "bin" / "python"
    if not expected_python.is_file():
        raise RuntimeError(f"Project virtual environment not found at {expected_python}")

    current_python = Path(sys.executable).resolve()
    if current_python != expected_python.resolve():
        is_direct_run = (
            len(sys.argv) > 0 and (
                Path(sys.argv[0]).resolve() == Path(__file__).resolve()
                or sys.argv[0].endswith("home_pilot.py")
            )
        )
        if is_direct_run:
            args = [str(expected_python), str(Path(__file__).resolve())] + sys.argv[1:]
            res = subprocess.run(args, cwd=str(ROOT))
            sys.exit(res.returncode)

    return expected_python


def get_bot_token() -> str:
    """Retrieves Telegram bot token from environment or .env file without leaking it."""
    token = os.environ.get("KETO_BOT_TOKEN") or os.environ.get("TELEGRAM_BOT_TOKEN")
    if token:
        return token.strip()
    env_file = ROOT / ".env"
    if env_file.is_file():
        try:
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and ("KETO_BOT_TOKEN=" in line or "TELEGRAM_BOT_TOKEN=" in line):
                    k, v = line.split("=", 1)
                    if k.strip() in ("KETO_BOT_TOKEN", "TELEGRAM_BOT_TOKEN"):
                        t = v.strip().strip('"').strip("'")
                        if t:
                            return t
        except Exception:
            pass
    return ""


def get_process_info(pid: int) -> Optional[Dict[str, Any]]:
    """Retrieves process metadata (pid, create_time, executable) safely."""
    if pid <= 0:
        return None
    if os.name == "nt":
        import ctypes
        import ctypes.wintypes
        h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return None
        try:
            ct = ctypes.wintypes.FILETIME()
            et = ctypes.wintypes.FILETIME()
            kt = ctypes.wintypes.FILETIME()
            ut = ctypes.wintypes.FILETIME()
            if not ctypes.windll.kernel32.GetProcessTimes(h, ctypes.byref(ct), ctypes.byref(et), ctypes.byref(kt), ctypes.byref(ut)):
                return None
            buf = ctypes.create_unicode_buffer(1024)
            size = ctypes.wintypes.DWORD(1024)
            if not ctypes.windll.kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
                return None
            create_time = (ct.dwHighDateTime << 32) + ct.dwLowDateTime
            return {
                "pid": pid,
                "create_time": create_time,
                "executable": buf.value,
            }
        finally:
            ctypes.windll.kernel32.CloseHandle(h)
    else:
        try:
            os.kill(pid, 0)
            exe_path = os.path.realpath(f"/proc/{pid}/exe") if os.path.exists(f"/proc/{pid}/exe") else ""
            stat_mtime = os.stat(f"/proc/{pid}").st_mtime if os.path.exists(f"/proc/{pid}") else 0
            return {
                "pid": pid,
                "create_time": int(stat_mtime),
                "executable": exe_path,
            }
        except (OSError, ProcessLookupError):
            return None


def is_matching_executable(current_exe: str, expected_exe: str) -> bool:
    """Matches executable taking into account path normalization and Windows file systems."""
    if not current_exe or not expected_exe:
        return False
    if not isinstance(current_exe, str) or not isinstance(expected_exe, str):
        return False
    if not os.path.isabs(current_exe) or not os.path.isabs(expected_exe):
        return False
    cur_norm = os.path.normcase(os.path.abspath(current_exe))
    exp_norm = os.path.normcase(os.path.abspath(expected_exe))
    return cur_norm == exp_norm


def is_process_alive_and_matched(proc_info: Optional[Dict[str, Any]]) -> bool:
    """Verifies that a managed process is actively running and matches stored metadata."""
    if not proc_info or not isinstance(proc_info, dict) or not proc_info.get("pid"):
        return False
    pid = proc_info["pid"]
    expected_ctime = proc_info.get("create_time")
    expected_exe = proc_info.get("executable")
    if expected_ctime is None or expected_ctime == "" or not expected_exe or not os.path.isabs(expected_exe):
        return False
    current = get_process_info(pid)
    if not current:
        return False
    if current.get("create_time") != expected_ctime:
        return False
    if not current.get("executable") or not is_matching_executable(current["executable"], expected_exe):
        return False
    return True


def is_port_listening(host: str, port: int) -> bool:
    """Checks whether the given port is actively listening."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.6)
        try:
            return s.connect_ex((host, port)) == 0
        except Exception:
            return False


def load_state() -> Dict[str, Any]:
    if not STATE_FILE.is_file():
        return {}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(state: Dict[str, Any]) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def safe_terminate_process(proc_info: Dict[str, Any]) -> bool:
    """Safely terminates a process only after verifying PID, create_time, and executable."""
    if not proc_info or not isinstance(proc_info, dict):
        return False
    pid = proc_info.get("pid")
    expected_ctime = proc_info.get("create_time")
    expected_exe = proc_info.get("executable")
    if not pid or not isinstance(pid, int) or pid <= 0:
        return False

    current = get_process_info(pid)
    if not current:
        return True  # Already terminated

    if expected_ctime is None or expected_ctime == "":
        print(f"[WARN] PID {pid} has no confirmed create_time in state. Process not killed.", file=sys.stderr)
        return False

    if current.get("create_time") != expected_ctime:
        print(f"[WARN] PID {pid} create_time mismatch (expected {expected_ctime}, got {current.get('create_time')}). Process not killed.", file=sys.stderr)
        return False

    if not expected_exe or not isinstance(expected_exe, str) or not os.path.isabs(expected_exe):
        print(f"[WARN] PID {pid} has no confirmed full executable path in state. Process not killed.", file=sys.stderr)
        return False

    if not current.get("executable") or not is_matching_executable(current["executable"], expected_exe):
        print(f"[WARN] PID {pid} executable mismatch (expected {expected_exe}, got {current.get('executable')}). Process not killed.", file=sys.stderr)
        return False

    try:
        if os.name == "nt":
            # Safely terminate verified process and its children to avoid leaving orphaned listeners
            res = subprocess.run(["taskkill.exe", "/F", "/T", "/PID", str(pid)], capture_output=True, text=True)
            if res.returncode != 0:
                import ctypes
                h = ctypes.windll.kernel32.OpenProcess(0x0001, False, pid)  # PROCESS_TERMINATE
                if h:
                    ctypes.windll.kernel32.TerminateProcess(h, 0)
                    ctypes.windll.kernel32.CloseHandle(h)
        else:
            os.kill(pid, 15)  # SIGTERM
    except Exception as e:
        print(f"[WARN] Could not terminate process {pid}: {e}", file=sys.stderr)
        return False
    return True


def query_orphan_ssh_pids(port: int = STAGING_PORT) -> list:
    """Termination of orphan SSH processes by address/port is disabled to avoid killing foreign processes."""
    return []


def cleanup_tunnel_ssh(port: int = STAGING_PORT) -> None:
    """Safely terminates only our tunnel's child SSH process without affecting other SSH sessions."""
    # Check tracked SSH state file with confirmed PID, create_time, and executable
    if SSH_STATE_FILE.is_file():
        try:
            ssh_data = json.loads(SSH_STATE_FILE.read_text(encoding="utf-8"))
            ssh_pid = ssh_data.get("pid")
            ssh_port = ssh_data.get("port")
            ssh_ctime = ssh_data.get("create_time")
            ssh_exe = ssh_data.get("executable")
            if ssh_pid and ssh_port == port:
                safe_terminate_process({
                    "pid": ssh_pid,
                    "create_time": ssh_ctime,
                    "executable": ssh_exe,
                })
        except Exception:
            pass
        finally:
            SSH_STATE_FILE.unlink(missing_ok=True)


def resolve_and_validate_receipt(receipt_path_str: Optional[str] = None) -> Path:
    """Finds, validates and pins a valid build receipt."""
    candidates = []
    if receipt_path_str:
        p = Path(receipt_path_str).resolve()
        if not p.is_file():
            raise RuntimeError(f"Specified build receipt not found: {receipt_path_str}")
        candidates.append(p)
    else:
        # Check hermes scratch directory
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        if local_app_data:
            scratch = Path(local_app_data) / "hermes" / "cache" / "scratch"
            candidates.append(scratch / "latest-build-receipt.json")
            candidates.append(scratch / "build-receipt.json")
        # Check docs evidence receipts
        candidates.append(ROOT / "docs" / "release" / "evidence" / "k2-pilot-receipt.json")

    for cand in candidates:
        if cand.is_file():
            try:
                data = json.loads(cand.read_text(encoding="utf-8"))
                dist_dir = data.get("dist_dir")
                if dist_dir and Path(dist_dir).is_dir() and (Path(dist_dir) / "index.html").is_file():
                    # Resolve to inner receipt if latest-build-receipt points to build-receipt
                    inner_receipt = data.get("receipt_path")
                    if inner_receipt and Path(inner_receipt).is_file():
                        return Path(inner_receipt).resolve()
                    return cand.resolve()
            except Exception:
                continue

    raise RuntimeError("No valid build receipt with existing dist files found. Substituting root dist is forbidden.")


def get_receipt_metadata(receipt_path: Path) -> Dict[str, str]:
    """Reads expected build identification metadata from receipt."""
    if not receipt_path.is_file():
        raise RuntimeError(f"Receipt file does not exist: {receipt_path}")
    data = json.loads(receipt_path.read_text(encoding="utf-8"))
    build_id = data.get("build_id") or data.get("buildId") or ""
    backend_fp = data.get("backend_fingerprint") or data.get("backendFingerprint") or ""
    catalog_hash = data.get("catalog_hash") or data.get("catalogHash") or ""
    dist_dir = data.get("dist_dir") or ""
    if not dist_dir or not Path(dist_dir).is_dir() or not (Path(dist_dir) / "index.html").is_file():
        raise RuntimeError(f"Dist directory specified in receipt does not exist or missing index.html: {dist_dir}")
    return {
        "build_id": build_id,
        "backend_fingerprint": backend_fp,
        "catalog_hash": catalog_hash,
        "dist_dir": dist_dir,
    }


def check_ready(
    mode: str = "PUBLIC_READY",
    port: int = STAGING_PORT,
    timeout: float = 6.0,
    receipt_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Verifies operational readiness with strict JSON response validation, build receipt comparison,
    and process liveness checks.

    Modes:
    - LOCAL_READY: Checks server process, local /api/health, /api/version, and receipt matching.
    - PUBLIC_READY: All local checks PLUS tunnel process, external URL existence, /api/health, and /api/version.
    """
    import urllib.request
    import urllib.error

    state = load_state()
    active_receipt_str = receipt_path or state.get("receipt_path")
    if not active_receipt_str or not Path(active_receipt_str).is_file():
        return {
            "ready": False,
            "mode": mode,
            "error": f"Saved build receipt missing or not found: {active_receipt_str}"
        }

    try:
        receipt_meta = get_receipt_metadata(Path(active_receipt_str))
    except Exception as e:
        return {
            "ready": False,
            "mode": mode,
            "error": f"Failed to validate receipt metadata: {e}"
        }

    # 1. Process checks
    server_info = state.get("server")
    if not is_process_alive_and_matched(server_info):
        return {
            "ready": False,
            "mode": mode,
            "error": "Staging Server process is not running or PID metadata mismatched"
        }

    if mode == "PUBLIC_READY":
        tunnel_info = state.get("tunnel")
        if not is_process_alive_and_matched(tunnel_info):
            return {
                "ready": False,
                "mode": "PUBLIC_READY",
                "error": "SSH Tunnel process is not running or PID metadata mismatched"
            }

    # 2. Local Health Check
    start_t = time.time()
    local_health_ok = False
    last_err = ""

    while time.time() - start_t < timeout:
        if not is_port_listening("127.0.0.1", port):
            last_err = "Port not listening yet"
            time.sleep(0.3)
            continue
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{port}/api/health")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                content_type = resp.headers.get("Content-Type", "")
                if "text/html" in content_type:
                    return {
                        "ready": False,
                        "mode": mode,
                        "error": "Local /api/health returned HTML instead of expected JSON"
                    }
                body = resp.read().decode("utf-8")
                data = json.loads(body)
                if resp.status == 200 and data.get("status") == "ok":
                    local_health_ok = True
                    break
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}"
        except json.JSONDecodeError:
            return {
                "ready": False,
                "mode": mode,
                "error": "Local /api/health returned corrupted JSON"
            }
        except Exception as e:
            last_err = str(e)
            time.sleep(0.4)

    if not local_health_ok:
        return {
            "ready": False,
            "mode": mode,
            "error": f"Local port {port} health check timed out: {last_err}"
        }

    # 3. Local Version Check
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/version")
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "text/html" in content_type:
                return {
                    "ready": False,
                    "mode": mode,
                    "error": "Local /api/version returned HTML instead of JSON"
                }
            local_version = json.loads(resp.read().decode("utf-8"))
    except json.JSONDecodeError:
        return {
            "ready": False,
            "mode": mode,
            "error": "Local /api/version returned corrupted JSON"
        }
    except Exception as e:
        return {
            "ready": False,
            "mode": mode,
            "error": f"Failed to retrieve local /api/version: {e}"
        }

    # Receipt comparison
    if local_version.get("buildId") != receipt_meta["build_id"]:
        return {
            "ready": False,
            "mode": mode,
            "error": f"Local buildId mismatch with receipt ({local_version.get('buildId')} != {receipt_meta['build_id']})"
        }
    if local_version.get("backendFingerprint") != receipt_meta["backend_fingerprint"]:
        return {
            "ready": False,
            "mode": mode,
            "error": f"Local backendFingerprint mismatch with receipt ({local_version.get('backendFingerprint')} != {receipt_meta['backend_fingerprint']})"
        }
    if local_version.get("catalogHash") != receipt_meta["catalog_hash"]:
        return {
            "ready": False,
            "mode": mode,
            "error": f"Local catalogHash mismatch with receipt ({local_version.get('catalogHash')} != {receipt_meta['catalog_hash']})"
        }

    if mode == "LOCAL_READY":
        return {
            "ready": True,
            "mode": "LOCAL_READY",
            "port": port,
            "health": "ok",
            "version": local_version,
            "receipt": receipt_meta,
        }

    # 4. PUBLIC_READY checks
    active_tunnel_file = getattr(sys.modules[__name__], "TUNNEL_URL_FILE", TUNNEL_URL_FILE)

    # External health check
    def fetch_url(target: str, timeout_sec: float = 4.0):
        req = urllib.request.Request(target, headers={"User-Agent": "HomePilotReadyCheck/1.0"})
        try:
            return urllib.request.urlopen(req, timeout=timeout_sec)
        except urllib.error.HTTPError:
            # Server responded with an HTTP status error (e.g. 502, 404, 500) -> do not retry through proxy
            raise
        except Exception:
            # Fallback through local proxy if configured and listening
            if is_port_listening("127.0.0.1", 10809):
                opener_proxy = urllib.request.build_opener(urllib.request.ProxyHandler({"https": "http://127.0.0.1:10809"}))
                return opener_proxy.open(req, timeout=timeout_sec)
            raise

    start_ext = time.time()
    ext_health_ok = False
    last_ext_err = ""
    tunnel_url = ""

    while time.time() - start_ext < timeout:
        if not active_tunnel_file.is_file():
            last_ext_err = "External tunnel URL missing from current_tunnel_url.txt"
            time.sleep(0.4)
            continue

        try:
            tunnel_url = active_tunnel_file.read_text(encoding="utf-8").strip().rstrip("/")
        except Exception as e:
            last_ext_err = f"Failed to read current_tunnel_url.txt: {e}"
            time.sleep(0.4)
            continue

        if not tunnel_url or not tunnel_url.startswith("https://"):
            last_ext_err = f"Invalid external tunnel URL format: {tunnel_url}"
            time.sleep(0.4)
            continue

        try:
            with fetch_url(f"{tunnel_url}/api/health", timeout_sec=3.0) as resp:
                content_type = resp.headers.get("Content-Type", "")
                if "text/html" in content_type:
                    return {
                        "ready": False,
                        "mode": "PUBLIC_READY",
                        "error": "External /api/health returned HTML instead of expected JSON"
                    }
                if resp.status == 200:
                    ext_h = json.loads(resp.read().decode("utf-8"))
                    if ext_h.get("status") == "ok":
                        ext_health_ok = True
                        break
                    else:
                        last_ext_err = f"External /api/health returned invalid status: {ext_h}"
                else:
                    last_ext_err = f"External /api/health returned HTTP {resp.status}"
        except urllib.error.HTTPError as e:
            last_ext_err = f"External /api/health returned HTTP error: {e.code} ({e.reason})"
            time.sleep(0.4)
        except Exception as e:
            last_ext_err = f"External /api/health connection failed: {e}"
            time.sleep(0.4)

    if not ext_health_ok:
        return {
            "ready": False,
            "mode": "PUBLIC_READY",
            "error": last_ext_err or f"External tunnel health check timed out after {timeout}s"
        }

    # External version check
    try:
        with fetch_url(f"{tunnel_url}/api/version", timeout_sec=4.0) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "text/html" in content_type:
                return {
                    "ready": False,
                    "mode": "PUBLIC_READY",
                    "error": "External /api/version returned HTML instead of expected JSON"
                }
            if resp.status != 200:
                return {
                    "ready": False,
                    "mode": "PUBLIC_READY",
                    "error": f"External /api/version returned HTTP {resp.status}"
                }
            ext_version = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {
            "ready": False,
            "mode": "PUBLIC_READY",
            "error": f"External /api/version returned HTTP error: {e.code} ({e.reason})"
        }
    except json.JSONDecodeError:
        return {
            "ready": False,
            "mode": "PUBLIC_READY",
            "error": "External /api/version returned corrupted JSON"
        }
    except Exception as e:
        return {
            "ready": False,
            "mode": "PUBLIC_READY",
            "error": f"External /api/version connection failed: {e}"
        }

    # Compare external version with receipt
    if ext_version.get("buildId") != receipt_meta["build_id"]:
        return {
            "ready": False,
            "mode": "PUBLIC_READY",
            "error": f"External buildId mismatch with receipt ({ext_version.get('buildId')} != {receipt_meta['build_id']})"
        }
    if ext_version.get("backendFingerprint") != receipt_meta["backend_fingerprint"]:
        return {
            "ready": False,
            "mode": "PUBLIC_READY",
            "error": f"External backendFingerprint mismatch with receipt ({ext_version.get('backendFingerprint')} != {receipt_meta['backend_fingerprint']})"
        }
    if ext_version.get("catalogHash") != receipt_meta["catalog_hash"]:
        return {
            "ready": False,
            "mode": "PUBLIC_READY",
            "error": f"External catalogHash mismatch with receipt ({ext_version.get('catalogHash')} != {receipt_meta['catalog_hash']})"
        }
    if ext_version != local_version:
        return {
            "ready": False,
            "mode": "PUBLIC_READY",
            "error": f"External version differs from local version ({ext_version} != {local_version})"
        }

    return {
        "ready": True,
        "mode": "PUBLIC_READY",
        "port": port,
        "health": "ok",
        "tunnel_url": tunnel_url,
        "version": local_version,
        "receipt": receipt_meta,
    }


def start(with_tunnel: bool = True, receipt_path: Optional[str] = None) -> int:
    ensure_venv_python()
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    state = load_state()

    # 1. Resolve and pin receipt
    pinned_receipt = None
    if receipt_path:
        pinned_receipt = resolve_and_validate_receipt(receipt_path)
    elif state.get("receipt_path"):
        try:
            pinned_receipt = resolve_and_validate_receipt(state["receipt_path"])
        except RuntimeError as e:
            print(f"[HOME_PILOT ERROR] Pinned receipt validation failed: {e}", file=sys.stderr)
            return 1
    else:
        try:
            pinned_receipt = resolve_and_validate_receipt()
        except RuntimeError as e:
            print(f"[HOME_PILOT ERROR] {e}", file=sys.stderr)
            return 1

    state["receipt_path"] = str(pinned_receipt)
    state["with_tunnel"] = with_tunnel
    save_state(state)

    python_exe = str(ROOT / ".venv-p0" / "Scripts" / "python.exe")
    if not Path(python_exe).is_file():
        python_exe = sys.executable

    # 2. Check and manage Staging Server independently
    server_info = state.get("server")
    server_alive = is_process_alive_and_matched(server_info)
    port_listening = is_port_listening("127.0.0.1", STAGING_PORT)

    if server_alive and port_listening:
        print(f"[HOME_PILOT] Staging Server is already running on PID {server_info['pid']} (port {STAGING_PORT}). Preserving server process.")
    elif not server_alive and port_listening:
        print(f"[HOME_PILOT ERROR] Port {STAGING_PORT} is already listening by an unmanaged process. Refusing to start or terminate.", file=sys.stderr)
        return 1
    else:
        # Launch Server
        bot_token = get_bot_token()
        token_configured = bool(bot_token)
        print(f"[HOME_PILOT] Bot token configured: {token_configured}")
        if not token_configured:
            print("[HOME_PILOT ERROR] No Telegram bot token found in environment or .env.", file=sys.stderr)
            return 1

        server_stdout = open(LOGS_DIR / "home_pilot_server.stdout.log", "a", encoding="utf-8")
        server_stderr = open(LOGS_DIR / "home_pilot_server.stderr.log", "a", encoding="utf-8")

        server_cmd = [
            python_exe,
            "-u",
            str(ROOT / "scripts" / "run_staging.py"),
            "--port", str(STAGING_PORT),
            "--persistent",
            "--owner-id", str(OLGA_CHAT_ID),
            "--receipt", str(pinned_receipt),
        ]

        server_env = os.environ.copy()
        server_env["TELEGRAM_BOT_TOKEN"] = bot_token
        server_env["KETO_BOT_TOKEN"] = bot_token

        print(f"[HOME_PILOT] Starting Staging Server on port {STAGING_PORT} (--persistent, receipt={pinned_receipt.name})...", flush=True)
        spawn_flags = (subprocess.CREATE_NO_WINDOW | getattr(subprocess, "DETACHED_PROCESS", 0x00000008)) if os.name == "nt" else 0
        try:
            server_proc = subprocess.Popen(
                server_cmd,
                cwd=str(ROOT),
                stdout=server_stdout,
                stderr=server_stderr,
                env=server_env,
                creationflags=spawn_flags,
            )
        except Exception as e:
            print(f"[HOME_PILOT ERROR] Failed to spawn staging server: {e}", file=sys.stderr)
            return 1
        finally:
            server_stdout.close()
            server_stderr.close()

        server_meta = get_process_info(server_proc.pid) or {}
        server_meta.update({
            "pid": server_proc.pid,
            "port": STAGING_PORT,
            "started_at": datetime.now(timezone.utc).isoformat(),
        })
        state["server"] = server_meta
        save_state(state)

        # Wait for local server readiness
        local_ready = check_ready(mode="LOCAL_READY", port=STAGING_PORT, timeout=12.0)
        if not local_ready.get("ready"):
            print(f"[HOME_PILOT ERROR] Staging Server failed to become ready: {local_ready.get('error')}", file=sys.stderr)
            stop()
            return 1
        print(f"[HOME_PILOT] Staging Server ready on port {STAGING_PORT} (PID {server_proc.pid}).", flush=True)

    # 3. Check and manage SSH Tunnel independently
    if with_tunnel:
        tunnel_info = state.get("tunnel")
        tunnel_alive = is_process_alive_and_matched(tunnel_info)

        if tunnel_alive:
            # Check if public connection is operational
            public_check = check_ready(mode="PUBLIC_READY", port=STAGING_PORT, timeout=3.0)
            if public_check.get("ready"):
                print(f"[HOME_PILOT] SSH Tunnel is already running on PID {tunnel_info['pid']} and operational. No new tunnel spawned.")
            else:
                print(f"[HOME_PILOT] SSH Tunnel process is running (PID {tunnel_info['pid']}), but unready ({public_check.get('error')}). Restarting tunnel...")
                safe_terminate_process(tunnel_info)
                cleanup_tunnel_ssh(STAGING_PORT)
                tunnel_alive = False

        if not tunnel_alive:
            cleanup_tunnel_ssh(STAGING_PORT)

            tunnel_stdout = open(LOGS_DIR / "home_pilot_tunnel.stdout.log", "a", encoding="utf-8")
            tunnel_stderr = open(LOGS_DIR / "home_pilot_tunnel.stderr.log", "a", encoding="utf-8")

            tunnel_cmd = [
                python_exe,
                "-u",
                str(ROOT / "scripts" / "run_ssh_tunnel.py"),
                "--port", str(STAGING_PORT),
                "--chat-id", str(OLGA_CHAT_ID),
            ]

            tunnel_env = os.environ.copy()
            bot_token = get_bot_token()
            if bot_token:
                tunnel_env["TELEGRAM_BOT_TOKEN"] = bot_token
                tunnel_env["KETO_BOT_TOKEN"] = bot_token

            print(f"[HOME_PILOT] Starting SSH Tunnel to port {STAGING_PORT} (chat_id={OLGA_CHAT_ID})...", flush=True)
            spawn_flags = (subprocess.CREATE_NO_WINDOW | getattr(subprocess, "DETACHED_PROCESS", 0x00000008)) if os.name == "nt" else 0
            try:
                tunnel_proc = subprocess.Popen(
                    tunnel_cmd,
                    cwd=str(ROOT),
                    stdout=tunnel_stdout,
                    stderr=tunnel_stderr,
                    env=tunnel_env,
                    creationflags=spawn_flags,
                )
            except Exception as e:
                print(f"[HOME_PILOT ERROR] Failed to spawn SSH tunnel: {e}", file=sys.stderr)
                return 1
            finally:
                tunnel_stdout.close()
                tunnel_stderr.close()

            tunnel_meta = get_process_info(tunnel_proc.pid) or {}
            tunnel_meta.update({
                "pid": tunnel_proc.pid,
                "port": STAGING_PORT,
                "started_at": datetime.now(timezone.utc).isoformat(),
            })
            state["tunnel"] = tunnel_meta
            save_state(state)

            print(f"[HOME_PILOT] Verifying external tunnel connectivity...", flush=True)
            pub_ready = check_ready(mode="PUBLIC_READY", port=STAGING_PORT, timeout=20.0)
            if not pub_ready.get("ready"):
                print(f"[HOME_PILOT ERROR] Tunnel failed public readiness check: {pub_ready.get('error')}", file=sys.stderr)
                return 1

    status(mode="PUBLIC_READY" if with_tunnel else "LOCAL_READY")
    final_check = check_ready(mode="PUBLIC_READY" if with_tunnel else "LOCAL_READY", port=STAGING_PORT, timeout=2.0)
    return 0 if final_check.get("ready") else 1


def stop() -> int:
    ensure_venv_python()
    state = load_state()
    if not state:
        print("[HOME_PILOT] No active home pilot state file found.")
        cleanup_tunnel_ssh(STAGING_PORT)
        return 0

    print("[HOME_PILOT] Stopping Home Pilot services safely...", flush=True)

    # 1. Stop Tunnel & its SSH child
    tunnel_info = state.get("tunnel")
    if tunnel_info:
        pid = tunnel_info.get("pid")
        if safe_terminate_process(tunnel_info):
            print(f"[HOME_PILOT] Stopped Tunnel process (PID {pid}).")
    cleanup_tunnel_ssh(STAGING_PORT)

    # 2. Stop Server
    server_info = state.get("server")
    if server_info:
        pid = server_info.get("pid")
        if safe_terminate_process(server_info):
            print(f"[HOME_PILOT] Stopped Staging Server process (PID {pid}).")

    if STATE_FILE.is_file():
        STATE_FILE.unlink(missing_ok=True)

    print("[HOME_PILOT] All services stopped cleanly.", flush=True)
    return 0


def status(mode: Optional[str] = None) -> int:
    ensure_venv_python()
    state = load_state()
    target_mode = mode or ("PUBLIC_READY" if state.get("with_tunnel", True) else "LOCAL_READY")

    print("=" * 60)
    print("  KETO BALANCE HOME PILOT: STATUS REPORT")
    print("=" * 60)

    server_info = state.get("server")
    server_alive = False
    if server_info:
        pid = server_info.get("pid")
        proc = get_process_info(pid)
        server_alive = is_process_alive_and_matched(server_info)
        listening = is_port_listening("127.0.0.1", STAGING_PORT)
        print(f"  Staging Server: {'RUNNING' if server_alive else 'STOPPED'} (PID: {pid}, Port: {STAGING_PORT}, Listening: {listening})")
        if proc:
            print(f"    Executable:   {proc.get('executable')}")
            print(f"    Started At:   {server_info.get('started_at')}")
    else:
        listening = is_port_listening("127.0.0.1", STAGING_PORT)
        print(f"  Staging Server: NOT CONFIGURED (Port {STAGING_PORT} Listening: {listening})")

    tunnel_info = state.get("tunnel")
    tunnel_alive = False
    if tunnel_info:
        pid = tunnel_info.get("pid")
        proc = get_process_info(pid)
        tunnel_alive = is_process_alive_and_matched(tunnel_info)
        print(f"  SSH Tunnel:     {'RUNNING' if tunnel_alive else 'STOPPED'} (PID: {pid})")
        if proc:
            print(f"    Executable:   {proc.get('executable')}")
            print(f"    Started At:   {tunnel_info.get('started_at')}")
    else:
        print("  SSH Tunnel:     NOT CONFIGURED")

    pinned_receipt = state.get("receipt_path")
    print(f"  Pinned Receipt: {pinned_receipt or 'NONE'}")

    active_tunnel_file = getattr(sys.modules[__name__], "TUNNEL_URL_FILE", TUNNEL_URL_FILE)
    if active_tunnel_file.is_file():
        try:
            url = active_tunnel_file.read_text(encoding="utf-8").strip()
            print(f"  Public HTTPS:   {url}")
        except Exception:
            pass

    ready = check_ready(mode=target_mode, port=STAGING_PORT, timeout=6.0)
    print(f"  Ready Check ({target_mode}): {'PASSED' if ready.get('ready') else 'FAILED'}")
    if ready.get("ready"):
        if ready.get("version"):
            v = ready["version"]
            print(f"    Build ID:     {v.get('buildId')}")
            print(f"    Backend Hash: {v.get('backendFingerprint')}")
            print(f"    Catalog Hash: {v.get('catalogHash')}")
    else:
        print(f"    Reason:       {ready.get('error')}")

    print("=" * 60)
    return 0 if ready.get("ready") else 1


def restart(receipt_path: Optional[str] = None) -> int:
    state = load_state()
    with_tunnel = state.get("with_tunnel", True)
    receipt = receipt_path or state.get("receipt_path")
    stop()
    time.sleep(1)
    return start(with_tunnel=with_tunnel, receipt_path=receipt)


def supervisor(with_tunnel: bool = True, receipt_path: Optional[str] = None) -> int:
    """Runs Home Pilot supervisor in foreground with exponential backoff recovery and confirmed reset."""
    ensure_venv_python()
    target_mode = "PUBLIC_READY" if with_tunnel else "LOCAL_READY"
    code = start(with_tunnel=with_tunnel, receipt_path=receipt_path)
    if code != 0:
        print(f"[HOME_PILOT SUPERVISOR WARNING] Initial start returned code {code}. Entering auto-recovery loop...", flush=True)

    print(f"[HOME_PILOT SUPERVISOR] Monitoring services ({target_mode}). Press Ctrl+C to stop.", flush=True)
    consecutive_failures = 0

    try:
        while True:
            time.sleep(5)
            state = load_state()

            # Check server
            server_info = state.get("server")
            server_ok = is_process_alive_and_matched(server_info)

            # Check tunnel
            tunnel_ok = True
            if with_tunnel:
                tunnel_info = state.get("tunnel")
                tunnel_ok = is_process_alive_and_matched(tunnel_info)

            ready_info = check_ready(mode=target_mode, port=STAGING_PORT, timeout=3.0)
            is_operational = server_ok and tunnel_ok and ready_info.get("ready")

            if is_operational:
                if consecutive_failures > 0:
                    print(f"[HOME_PILOT SUPERVISOR] Confirmed recovery verified! Resetting failure counter (was {consecutive_failures}).", flush=True)
                    consecutive_failures = 0
                continue

            # Failure detected
            if consecutive_failures >= len(BACKOFF_STEPS):
                print(f"[HOME_PILOT SUPERVISOR ERROR] Maximum consecutive recovery attempts ({len(BACKOFF_STEPS)}) reached. Halting supervisor.", file=sys.stderr)
                return 1

            delay = BACKOFF_STEPS[consecutive_failures]
            consecutive_failures += 1
            print(f"[HOME_PILOT SUPERVISOR] Failure detected (Server: {server_ok}, Tunnel: {tunnel_ok}, Error: {ready_info.get('error')}).", flush=True)
            print(f"[HOME_PILOT SUPERVISOR] Recovery attempt {consecutive_failures}/{len(BACKOFF_STEPS)} scheduled in {delay}s...", flush=True)
            time.sleep(delay)

            # Perform recovery
            saved_receipt = receipt_path or state.get("receipt_path")
            recovery_code = start(with_tunnel=with_tunnel, receipt_path=saved_receipt)
            verify_recovery = check_ready(mode=target_mode, port=STAGING_PORT, timeout=15.0)

            if recovery_code == 0 and verify_recovery.get("ready"):
                print(f"[HOME_PILOT SUPERVISOR] Recovery confirmed operational! (Attempt {consecutive_failures})", flush=True)
                consecutive_failures = 0
            else:
                print(f"[HOME_PILOT SUPERVISOR WARNING] Recovery attempt {consecutive_failures} did not achieve confirmed readiness: {verify_recovery.get('error')}", file=sys.stderr)

    except KeyboardInterrupt:
        print("\n[HOME_PILOT SUPERVISOR] Stopping services on interrupt...", flush=True)
        stop()
    return 0


def main():
    parser = argparse.ArgumentParser(description="Keto Balance Home Pilot Process Manager")
    parser.add_argument("action", choices=["start", "stop", "status", "restart", "supervisor"], help="Action to execute")
    parser.add_argument("--no-tunnel", action="store_true", help="Start server without tunnel")
    parser.add_argument("--receipt", type=str, default=None, help="Explicit path to build receipt JSON")
    parser.add_argument("--mode", choices=["LOCAL_READY", "PUBLIC_READY"], default=None, help="Target ready check mode")
    args = parser.parse_args()

    if args.action == "start":
        sys.exit(start(with_tunnel=not args.no_tunnel, receipt_path=args.receipt))
    elif args.action == "stop":
        sys.exit(stop())
    elif args.action == "status":
        sys.exit(status(mode=args.mode))
    elif args.action == "restart":
        sys.exit(restart(receipt_path=args.receipt))
    elif args.action == "supervisor":
        sys.exit(supervisor(with_tunnel=not args.no_tunnel, receipt_path=args.receipt))


if __name__ == "__main__":
    main()
