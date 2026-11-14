"""
tests/helpers/pilot_io_guard.py — Guard изоляции тестового ввода-вывода (I/O Audit Guard).
Перехватывает попытки несанкционированного доступа к боевым секретам (.env),
runtime-файлам (bot_data.json, .tunnel_cache.json, app.db), БД вне тестового дерева
и внешней сети. Записывает нарушения ДО вызова исключения.
"""
import builtins
import io
import os
from pathlib import Path
import socket
import sqlite3
from typing import Any, List, Optional, Set

VIOLATIONS: List[str] = []
_ORIGINAL_OPEN = builtins.open
_ORIGINAL_IO_OPEN = io.open
_ORIGINAL_SQLITE_CONNECT = sqlite3.connect
_ORIGINAL_SOCKET_CONNECT = socket.socket.connect
_ORIGINAL_SOCKET_BIND = socket.socket.bind
_GUARD_INSTALLED = False
_ALLOWED_ROOT: Optional[Path] = None
_BOUND_LOCAL_PORTS: Set[int] = set()

FORBIDDEN_BASENAMES = {
    ".env",
    ".env.production",
    ".env.staging",
    ".env.local",
    ".env.test",
    ".env.example",
    "bot_data.json",
    ".tunnel_cache.json",
    "current_tunnel_url.txt",
}
FORBIDDEN_BASENAMES_LOWER = {b.lower() for b in FORBIDDEN_BASENAMES}

FORBIDDEN_PORTS = {8000, 4387, 8090, 10808, 10809, 18081}

FORBIDDEN_EXTENSIONS = {
    ".db",
    ".sqlite",
    ".sqlite3",
}
FORBIDDEN_EXTENSIONS_LOWER = {e.lower() for e in FORBIDDEN_EXTENSIONS}

class AuditViolationError(PermissionError):
    """Возникает при попытке обращения к несанкционированному I/O во время тестов."""
    pass

def _record_and_raise(msg: str):
    VIOLATIONS.append(msg)
    raise AuditViolationError(msg)

def _is_path_allowed(path_obj: Path, allowed_root: Optional[Path]) -> bool:
    try:
        resolved = path_obj.resolve()
    except Exception:
        resolved = path_obj

    name_lower = resolved.name.lower()
    suffix_lower = resolved.suffix.lower()

    # 1. Запрещённые имена файлов (.env* и другие секреты/runtime) с case-folding
    if name_lower.startswith(".env") or name_lower in FORBIDDEN_BASENAMES_LOWER:
        # Разрешено ТОЛЬКО если файл находится строго внутри allowed_root
        if allowed_root is None:
            return False
        try:
            resolved.relative_to(allowed_root.resolve())
            return True
        except ValueError:
            return False

    # 2. Проверка расширений баз данных с case-folding
    if suffix_lower in FORBIDDEN_EXTENSIONS_LOWER:
        if allowed_root is None:
            return False
        try:
            resolved.relative_to(allowed_root.resolve())
            return True
        except ValueError:
            return False

    return True

def _guarded_open(file: Any, *args, **kwargs):
    global _ALLOWED_ROOT
    if isinstance(file, (str, bytes, os.PathLike)):
        p = Path(os.fsdecode(file))
        if not _is_path_allowed(p, _ALLOWED_ROOT):
            _record_and_raise(f"Unauthorized file open: {p}")
    return _ORIGINAL_OPEN(file, *args, **kwargs)

def _guarded_io_open(file: Any, *args, **kwargs):
    global _ALLOWED_ROOT
    if isinstance(file, (str, bytes, os.PathLike)):
        p = Path(os.fsdecode(file))
        if not _is_path_allowed(p, _ALLOWED_ROOT):
            _record_and_raise(f"Unauthorized io.open: {p}")
    return _ORIGINAL_IO_OPEN(file, *args, **kwargs)

def _guarded_sqlite_connect(database: Any, *args, **kwargs):
    global _ALLOWED_ROOT
    if isinstance(database, (str, bytes, os.PathLike)):
        db_str = os.fsdecode(database)
        if db_str not in (":memory:", ""):
            # Check for URI memory database: e.g. file::memory: or file:memdb?mode=memory
            is_uri_memory = False
            if kwargs.get("uri"):
                import urllib.parse
                parsed = urllib.parse.urlsplit(db_str)
                if parsed.scheme == "file":
                    if parsed.netloc not in ("", "localhost"):
                        _record_and_raise("Unauthorized remote SQLite URI")
                    query_params = urllib.parse.parse_qs(parsed.query)
                    if parsed.path == ":memory:" or query_params.get("mode") == ["memory"]:
                        is_uri_memory = True
                    else:
                        from urllib.request import url2pathname
                        db_str = url2pathname(parsed.path)
            if not is_uri_memory:
                p = Path(db_str)
                if _ALLOWED_ROOT is None:
                    _record_and_raise(f"Unauthorized sqlite3 connect without allowed root: {p}")
                try:
                    resolved = p.resolve()
                    resolved.relative_to(_ALLOWED_ROOT.resolve())
                except Exception:
                    _record_and_raise(f"Unauthorized sqlite3 connect outside test root: {p}")
    return _ORIGINAL_SQLITE_CONNECT(database, *args, **kwargs)

def _is_stdlib_socketpair() -> bool:
    import sys
    try:
        f = sys._getframe(2)
        while f:
            name = f.f_code.co_name
            filename = f.f_code.co_filename.replace("\\", "/").lower()
            if name in ("_fallback_socketpair", "socketpair", "_make_self_pipe") and ("socket.py" in filename or "asyncio" in filename):
                return True
            f = f.f_back
        return False
    except Exception:
        return False

def _guarded_socket_bind(self, address, *args, **kwargs):
    if isinstance(address, tuple):
        host, port = address[:2]
        if host not in ("127.0.0.1", "::1", "localhost") or port in FORBIDDEN_PORTS:
            _record_and_raise(f"Unauthorized application socket bind to {host}:{port}")
    return _ORIGINAL_SOCKET_BIND(self, address, *args, **kwargs)

def _guarded_socket_connect(self, address, *args, **kwargs):
    # Разрешать ТОЛЬКО внутренние stdlib self-pipes (например, socket.socketpair)
    if not _is_stdlib_socketpair():
        host = address[0] if isinstance(address, tuple) and len(address) >= 1 else "unknown"
        port = address[1] if isinstance(address, tuple) and len(address) >= 2 else "unknown"
        _record_and_raise(f"Unauthorized application socket connect to {host}:{port}; only stdlib self-pipes allowed")
    return _ORIGINAL_SOCKET_CONNECT(self, address, *args, **kwargs)

def install_pilot_io_guard(allowed_root: Optional[Path] = None) -> None:
    global _GUARD_INSTALLED, _ALLOWED_ROOT
    _ALLOWED_ROOT = allowed_root
    if not _GUARD_INSTALLED:
        builtins.open = _guarded_open
        io.open = _guarded_io_open
        sqlite3.connect = _guarded_sqlite_connect
        socket.socket.bind = _guarded_socket_bind
        socket.socket.connect = _guarded_socket_connect
        _GUARD_INSTALLED = True

def uninstall_pilot_io_guard() -> None:
    global _GUARD_INSTALLED
    if _GUARD_INSTALLED:
        builtins.open = _ORIGINAL_OPEN
        io.open = _ORIGINAL_IO_OPEN
        sqlite3.connect = _ORIGINAL_SQLITE_CONNECT
        socket.socket.bind = _ORIGINAL_SOCKET_BIND
        socket.socket.connect = _ORIGINAL_SOCKET_CONNECT
        _GUARD_INSTALLED = False
        _BOUND_LOCAL_PORTS.clear()

def get_violations() -> List[str]:
    return list(VIOLATIONS)

def clear_violations() -> None:
    VIOLATIONS.clear()

def assert_no_violations() -> None:
    if VIOLATIONS:
        raise AssertionError(f"I/O violations detected: {VIOLATIONS}")
