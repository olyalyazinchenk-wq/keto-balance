"""
bot/app_db.py — Изолированное хранилище SQLite (WAL, Foreign Keys, GDPR Export/Delete, Backup/Restore).
"""
import json
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from bot.app_settings import get_settings

@contextmanager
def get_db_connection(db_path: Optional[Path] = None):
    target = db_path if db_path is not None else get_settings().db_path
    target.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(target), timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    else:
        conn.commit()
    finally:
        conn.close()

def init_db(db_path: Optional[Path] = None) -> None:
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id INTEGER PRIMARY KEY,
                weight REAL,
                height REAL,
                age INTEGER,
                gender TEXT,
                goal TEXT,
                contraindications_json TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                session_token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at REAL NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_states (
                user_id INTEGER PRIMARY KEY,
                onboarding_completed INTEGER DEFAULT 0,
                selected_day INTEGER DEFAULT 1,
                cooked_recipe_ids_json TEXT DEFAULT '[]',
                shopping_checked_json TEXT DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shopping_states (
                user_id INTEGER PRIMARY KEY,
                items_json TEXT DEFAULT '[]',
                checked_map_json TEXT DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS support_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                topic TEXT DEFAULT 'general',
                message TEXT NOT NULL,
                contact TEXT,
                status TEXT DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """)

def create_or_get_user(
    user_id: int,
    username: str = "",
    first_name: str = "",
    db_path: Optional[Path] = None
) -> Dict[str, Any]:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        if row:
            return dict(row)
        cur.execute(
            "INSERT INTO users (user_id, username, first_name) VALUES (?, ?, ?)",
            (user_id, username or "", first_name or "")
        )
        cur.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        return dict(cur.fetchone())

def create_session(
    user_id: int,
    session_token: str,
    expires_in_seconds: int = 86400,
    db_path: Optional[Path] = None
) -> None:
    create_or_get_user(user_id, db_path=db_path)
    expires_at = time.time() + expires_in_seconds
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO user_sessions (session_token, user_id, expires_at) VALUES (?, ?, ?)",
            (session_token, user_id, expires_at)
        )

def get_session_user(session_token: str, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT u.user_id, u.username, u.first_name, s.expires_at
            FROM user_sessions s
            JOIN users u ON s.user_id = u.user_id
            WHERE s.session_token = ?
            """,
            (session_token,)
        )
        row = cur.fetchone()
        if not row:
            return None
        if time.time() > row["expires_at"]:
            return None
        return dict(row)

def save_user_profile(user_id: int, profile: Dict[str, Any], db_path: Optional[Path] = None) -> None:
    create_or_get_user(user_id, db_path=db_path)
    contra_json = json.dumps(profile.get("contraindications", []), ensure_ascii=False)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT OR REPLACE INTO user_profiles
            (user_id, weight, height, age, gender, goal, contraindications_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                user_id,
                profile.get("weight"),
                profile.get("height"),
                profile.get("age"),
                profile.get("gender"),
                profile.get("goal"),
                contra_json
            )
        )

def get_user_profile(user_id: int, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM user_profiles WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        if not row:
            return None
        res = dict(row)
        res["contraindications"] = json.loads(res.pop("contraindications_json") or "[]")
        return res

def save_user_state(user_id: int, state: Dict[str, Any], db_path: Optional[Path] = None) -> None:
    create_or_get_user(user_id, db_path=db_path)
    cooked_json = json.dumps(state.get("cooked_recipe_ids", []), ensure_ascii=False)
    checked_json = json.dumps(state.get("shopping_checked", {}), ensure_ascii=False)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT OR REPLACE INTO user_states
            (user_id, onboarding_completed, selected_day, cooked_recipe_ids_json, shopping_checked_json, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                user_id,
                1 if state.get("onboarding_completed") else 0,
                state.get("selected_day", 1),
                cooked_json,
                checked_json
            )
        )

def get_user_state(user_id: int, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM user_states WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        if not row:
            return None
        res = dict(row)
        res["onboarding_completed"] = bool(res.get("onboarding_completed", 0))
        res["cooked_recipe_ids"] = json.loads(res.pop("cooked_recipe_ids_json") or "[]")
        res["shopping_checked"] = json.loads(res.pop("shopping_checked_json") or "{}")
        return res

def save_shopping_state(user_id: int, shopping_data: Dict[str, Any], db_path: Optional[Path] = None) -> None:
    create_or_get_user(user_id, db_path=db_path)
    items_json = json.dumps(shopping_data.get("items", []), ensure_ascii=False)
    checked_json = json.dumps(shopping_data.get("checked_map", {}), ensure_ascii=False)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT OR REPLACE INTO shopping_states
            (user_id, items_json, checked_map_json, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (user_id, items_json, checked_json)
        )

def get_shopping_state(user_id: int, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM shopping_states WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        if not row:
            return None
        return {
            "items": json.loads(row["items_json"] or "[]"),
            "checked_map": json.loads(row["checked_map_json"] or "{}"),
            "updated_at": row["updated_at"]
        }

def create_support_ticket(
    user_id: int,
    topic: str,
    message: str,
    contact: Optional[str] = None,
    db_path: Optional[Path] = None
) -> int:
    create_or_get_user(user_id, db_path=db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO support_tickets (user_id, topic, message, contact)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, topic or "general", message, contact or "")
        )
        return cur.lastrowid

def get_support_tickets(user_id: int, db_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM support_tickets WHERE user_id = ? ORDER BY id DESC", (user_id,))
        return [dict(r) for r in cur.fetchall()]

def export_all_user_data(user_id: int, db_path: Optional[Path] = None) -> Dict[str, Any]:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        user_row = cur.fetchone()
        if not user_row:
            return {"user_id": user_id, "found": False}

        profile = get_user_profile(user_id, db_path=db_path)
        state = get_user_state(user_id, db_path=db_path)
        shopping = get_shopping_state(user_id, db_path=db_path)
        tickets = get_support_tickets(user_id, db_path=db_path)

        return {
            "user_id": user_id,
            "found": True,
            "user": dict(user_row),
            "profile": profile,
            "state": state,
            "shopping": shopping,
            "tickets": tickets,
            "exported_at": datetime.now(timezone.utc).isoformat()
        }

def delete_all_user_data(user_id: int, db_path: Optional[Path] = None) -> bool:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
        return cur.rowcount > 0

def backup_database(src_db_path: Path, dst_backup_path: Path) -> None:
    dst_backup_path.parent.mkdir(parents=True, exist_ok=True)
    src_conn = sqlite3.connect(str(src_db_path))
    dst_conn = sqlite3.connect(str(dst_backup_path))
    try:
        src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()

def restore_database(backup_path: Path, target_db_path: Path) -> None:
    target_db_path.parent.mkdir(parents=True, exist_ok=True)
    src_conn = sqlite3.connect(str(backup_path))
    dst_conn = sqlite3.connect(str(target_db_path))
    try:
        src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()
