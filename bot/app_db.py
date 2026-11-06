"""
bot/app_db.py — Изолированное хранилище SQLite (WAL, Foreign Keys, GDPR Export/Delete, Backup/Restore).
"""
import hashlib
import json
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from bot.app_settings import get_settings

@contextmanager
def get_db_connection(db_path: Optional[Path] = None):
    target = db_path if db_path is not None else get_settings().db_path
    target.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(target), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    else:
        conn.commit()
    finally:
        conn.close()

class StaleRevisionError(Exception):
    """Возникает при несовпадении expected_revision с текущей ревизией в БД (CAS)."""
    pass

class RecipePublicationValidationError(ValueError):
    """Возникает при попытке публикации неполного или непроверенного рецепта."""
    pass

def _migrate_schema_if_needed(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    # 1. user_profiles -> settings_json
    cur.execute("PRAGMA table_info(user_profiles)")
    prof_cols = {row["name"] for row in cur.fetchall()}
    if "settings_json" not in prof_cols:
        cur.execute("ALTER TABLE user_profiles ADD COLUMN settings_json TEXT DEFAULT NULL")

    # 2. user_states -> payload_json, revision
    cur.execute("PRAGMA table_info(user_states)")
    state_cols = {row["name"] for row in cur.fetchall()}
    if "payload_json" not in state_cols:
        cur.execute("ALTER TABLE user_states ADD COLUMN payload_json TEXT DEFAULT NULL")
    if "revision" not in state_cols:
        cur.execute("ALTER TABLE user_states ADD COLUMN revision INTEGER DEFAULT 0")

    # 3. shopping_states -> revision
    cur.execute("PRAGMA table_info(shopping_states)")
    shop_cols = {row["name"] for row in cur.fetchall()}
    if "revision" not in shop_cols:
        cur.execute("ALTER TABLE shopping_states ADD COLUMN revision INTEGER DEFAULT 0")

    # 4. subscriptions table
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='subscriptions'")
    if not cur.fetchone():
        cur.execute("""
            CREATE TABLE IF NOT EXISTS subscriptions (
                user_id INTEGER PRIMARY KEY,
                tier TEXT NOT NULL DEFAULT 'free',
                status TEXT NOT NULL DEFAULT 'active',
                expires_at TEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """)

    # 5. orders table
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'")
    if not cur.fetchone():
        cur.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                order_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                product_id TEXT NOT NULL,
                amount_rub REAL NOT NULL,
                provider TEXT NOT NULL DEFAULT 'demo',
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_consents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                consent_type TEXT NOT NULL,
                version TEXT NOT NULL DEFAULT 'v1.0.0-release',
                granted INTEGER NOT NULL DEFAULT 1,
                granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                source TEXT DEFAULT 'tma',
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_user_consents_uid ON user_consents(user_id)")

    # 6. admin_recipes table
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_recipes'")
    if not cur.fetchone():
        cur.execute("""
            CREATE TABLE IF NOT EXISTS admin_recipes (
                recipe_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'published',
                published_payload_json TEXT DEFAULT NULL,
                draft_payload_json TEXT DEFAULT NULL,
                approval_marks_json TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

    # 7. admin_catalog_versions table
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_catalog_versions'")
    if not cur.fetchone():
        cur.execute("""
            CREATE TABLE IF NOT EXISTS admin_catalog_versions (
                version INTEGER PRIMARY KEY,
                published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                published_by INTEGER,
                recipes_count INTEGER DEFAULT 0,
                snapshot_json TEXT DEFAULT '[]'
            )
        """)

def _seed_admin_recipes_if_empty(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as cnt FROM admin_recipes")
    row = cur.fetchone()
    if row and row["cnt"] > 0:
        return

    fixture_path = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "pilot" / "catalog.json"
    if fixture_path.is_file():
        try:
            cat_data = json.loads(fixture_path.read_text(encoding="utf-8"))
            recipes = cat_data.get("recipes", [])
            for r in recipes:
                rid = r.get("id")
                title = r.get("title", rid)
                cur.execute(
                    """
                    INSERT OR IGNORE INTO admin_recipes
                    (recipe_id, title, version, status, published_payload_json, draft_payload_json, approval_marks_json)
                    VALUES (?, ?, 1, 'published', ?, NULL, ?)
                    """,
                    (
                        rid,
                        title,
                        json.dumps(r, ensure_ascii=False),
                        json.dumps({"approved": False, "approved_by": None, "source": None, "notes": "Seed recipe - pending verification"}, ensure_ascii=False),
                    )
                )
            cur.execute(
                """
                INSERT OR IGNORE INTO admin_catalog_versions
                (version, published_by, recipes_count, snapshot_json)
                VALUES (1, 1084557944, ?, ?)
                """,
                (len(recipes), json.dumps(recipes, ensure_ascii=False)),
            )
        except Exception:
            pass

_INITIALIZED_DBS: set = set()

def init_db(db_path: Optional[Path] = None, force: bool = False) -> None:
    target = Path(db_path if db_path is not None else get_settings().db_path).resolve()
    target_key = str(target)
    if not force and target_key in _INITIALIZED_DBS and target.is_file():
        return
    with get_db_connection(db_path) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
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
                settings_json TEXT DEFAULT NULL,
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
                payload_json TEXT DEFAULT NULL,
                revision INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS shopping_states (
                user_id INTEGER PRIMARY KEY,
                items_json TEXT DEFAULT '[]',
                checked_map_json TEXT DEFAULT '{}',
                revision INTEGER DEFAULT 0,
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
        cur.execute("""
            CREATE TABLE IF NOT EXISTS subscriptions (
                user_id INTEGER PRIMARY KEY,
                tier TEXT NOT NULL DEFAULT 'free',
                status TEXT NOT NULL DEFAULT 'active',
                expires_at TEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                order_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                product_id TEXT NOT NULL,
                amount_rub REAL NOT NULL,
                provider TEXT NOT NULL DEFAULT 'demo',
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_consents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                consent_type TEXT NOT NULL,
                version TEXT NOT NULL DEFAULT 'v1.0.0-release',
                granted INTEGER NOT NULL DEFAULT 1,
                granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                source TEXT DEFAULT 'tma',
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS admin_recipes (
                recipe_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'published',
                published_payload_json TEXT DEFAULT NULL,
                draft_payload_json TEXT DEFAULT NULL,
                approval_marks_json TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS admin_catalog_versions (
                version INTEGER PRIMARY KEY,
                published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                published_by INTEGER,
                recipes_count INTEGER DEFAULT 0,
                snapshot_json TEXT DEFAULT '[]'
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_user_consents_uid ON user_consents(user_id)")
        _migrate_schema_if_needed(conn)
        _seed_admin_recipes_if_empty(conn)
    _INITIALIZED_DBS.add(target_key)

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
            "INSERT OR IGNORE INTO users (user_id, username, first_name) VALUES (?, ?, ?)",
            (user_id, username or "", first_name or "")
        )
        cur.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        return dict(cur.fetchone())

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_session(
    user_id: int,
    session_token: str,
    expires_in_seconds: int = 86400,
    db_path: Optional[Path] = None
) -> None:
    create_or_get_user(user_id, db_path=db_path)
    expires_at = time.time() + expires_in_seconds
    token_hash = _hash_token(session_token)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO user_sessions (session_token, user_id, expires_at) VALUES (?, ?, ?)",
            (token_hash, user_id, expires_at)
        )

def get_session_user(session_token: str, db_path: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    init_db(db_path)
    token_hash = _hash_token(session_token)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT u.user_id, u.username, u.first_name, s.expires_at
            FROM user_sessions s
            JOIN users u ON s.user_id = u.user_id
            WHERE s.session_token = ?
            """,
            (token_hash,)
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
    settings_json = json.dumps(profile.get("settings"), ensure_ascii=False) if profile.get("settings") is not None else None
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT OR REPLACE INTO user_profiles
            (user_id, weight, height, age, gender, goal, contraindications_json, settings_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                user_id,
                profile.get("weight"),
                profile.get("height"),
                profile.get("age"),
                profile.get("gender"),
                profile.get("goal"),
                contra_json,
                settings_json
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
        raw_settings = res.pop("settings_json", None)
        res["settings"] = json.loads(raw_settings) if raw_settings else None
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

def get_pilot_user(user_id: int, db_path: Optional[Path] = None) -> Dict[str, Any]:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT payload_json, revision FROM user_states WHERE user_id = ?", (user_id,))
        state_row = cur.fetchone()
        revision = state_row["revision"] if state_row else 0
        state = json.loads(state_row["payload_json"]) if state_row and state_row["payload_json"] else None

        profile = get_user_profile(user_id, db_path=db_path)
        if profile is not None:
            profile.pop("updated_at", None)
            profile.pop("user_id", None)

        return {
            "schema_version": 1,
            "user_id": user_id,
            "revision": revision,
            "profile": profile,
            "state": state,
        }

def save_pilot_user(
    user_id: int,
    write_data: Dict[str, Any],
    db_path: Optional[Path] = None
) -> Dict[str, Any]:
    init_db(db_path)
    if "expected_revision" not in write_data:
        raise ValueError("Missing expected_revision in write payload")
    expected_revision = write_data["expected_revision"]
    profile_data = write_data.get("profile")
    state_data = write_data.get("state")

    create_or_get_user(user_id, db_path=db_path)

    with get_db_connection(db_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        cur = conn.cursor()
        cur.execute("SELECT revision, payload_json, shopping_checked_json FROM user_states WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        current_revision = row["revision"] if row else 0

        if expected_revision != current_revision:
            raise StaleRevisionError(
                f"Stale user revision: expected {expected_revision}, but current is {current_revision}"
            )

        new_revision = current_revision + 1

        # Check shopping sync / durable stale status
        cur.execute("SELECT checked_map_json FROM shopping_states WHERE user_id = ?", (user_id,))
        s_row = cur.fetchone()
        s_meta = json.loads(s_row["checked_map_json"] or "{}") if s_row and s_row["checked_map_json"] else {}
        s_content_version = s_meta.get("content_version", 1)
        s_paired_rev = s_meta.get("paired_user_revision")

        curr_db_payload = json.loads(row["payload_json"] or "{}") if row and row["payload_json"] else {}
        curr_db_is_stale = bool(curr_db_payload.get("shopping_stale"))

        if state_data is not None:
            # If the database state is already marked stale:
            # An unrelated cached snapshot (e.g. Session A saving day change) cannot clear durable stale!
            if curr_db_is_stale and not state_data.get("shopping_stale"):
                is_paired_refresh = (s_paired_rev == expected_revision)
                if not is_paired_refresh:
                    state_data["shopping_stale"] = True

        payload_json = json.dumps(state_data, ensure_ascii=False) if state_data is not None else None
        synced_version = s_content_version if (state_data and not state_data.get("shopping_stale")) else None
        u_meta_json = json.dumps({"synced_content_version": synced_version}, ensure_ascii=False)

        # Profile and state handled atomically in the exact same transaction
        if profile_data is None:
            cur.execute("DELETE FROM user_profiles WHERE user_id = ?", (user_id,))
        else:
            settings_json = json.dumps(profile_data.get("settings"), ensure_ascii=False) if profile_data.get("settings") is not None else None
            contra_json = json.dumps(profile_data.get("contraindications", []), ensure_ascii=False)
            cur.execute(
                """
                INSERT OR REPLACE INTO user_profiles
                (user_id, weight, height, age, gender, goal, contraindications_json, settings_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    user_id,
                    profile_data.get("weight"),
                    profile_data.get("height"),
                    profile_data.get("age"),
                    profile_data.get("gender"),
                    profile_data.get("goal"),
                    contra_json,
                    settings_json
                )
            )

        if row is None:
            try:
                cur.execute(
                    """
                    INSERT INTO user_states
                    (user_id, payload_json, shopping_checked_json, revision, updated_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (user_id, payload_json, u_meta_json, new_revision)
                )
            except sqlite3.IntegrityError:
                raise StaleRevisionError(f"Stale user revision: concurrent insert detected for user {user_id}")
        else:
            cur.execute(
                """
                UPDATE user_states
                SET payload_json = ?, shopping_checked_json = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND revision = ?
                """,
                (payload_json, u_meta_json, new_revision, user_id, expected_revision)
            )
            if cur.rowcount == 0:
                raise StaleRevisionError(f"Stale user revision: CAS failed for user {user_id}")

        return {
            "status": "ok",
            "user_id": user_id,
            "revision": new_revision
        }

def get_pilot_shopping(user_id: int, db_path: Optional[Path] = None) -> Dict[str, Any]:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT items_json, revision FROM shopping_states WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        if not row:
            return {
                "schema_version": 1,
                "user_id": user_id,
                "revision": 0,
                "items": []
            }
        items = json.loads(row["items_json"] or "[]")
        return {
            "schema_version": 1,
            "user_id": user_id,
            "revision": row["revision"],
            "items": items
        }

def _compute_shopping_content_hash(items: list) -> str:
    canonical = []
    for it in items:
        if isinstance(it, dict):
            canonical.append((
                str(it.get("id", "")),
                str(it.get("name", "")).strip().lower(),
                str(it.get("amountLabel", "")).strip(),
                sorted(it.get("linkedRecipeTitles") or [])
            ))
    canonical.sort()
    return hashlib.sha256(json.dumps(canonical, ensure_ascii=False).encode("utf-8")).hexdigest()

def save_pilot_shopping(
    user_id: int,
    write_data: Dict[str, Any],
    db_path: Optional[Path] = None
) -> Dict[str, Any]:
    init_db(db_path)
    if "expected_revision" not in write_data:
        raise ValueError("Missing expected_revision in write payload")
    expected_revision = write_data["expected_revision"]
    items_data = write_data.get("items", [])

    create_or_get_user(user_id, db_path=db_path)

    with get_db_connection(db_path) as conn:
        conn.execute("BEGIN IMMEDIATE")
        cur = conn.cursor()
        cur.execute("SELECT revision, items_json, checked_map_json FROM shopping_states WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        current_revision = row["revision"] if row else 0

        if expected_revision != current_revision:
            raise StaleRevisionError(
                f"Stale shopping revision: expected {expected_revision}, but current is {current_revision}"
            )

        new_revision = current_revision + 1
        items_json = json.dumps(items_data, ensure_ascii=False)

        prev_items = json.loads(row["items_json"] or "[]") if row and row["items_json"] else []
        prev_meta = json.loads(row["checked_map_json"] or "{}") if row and row["checked_map_json"] else {}
        
        prev_hash = prev_meta.get("content_hash") or _compute_shopping_content_hash(prev_items)
        new_hash = _compute_shopping_content_hash(items_data)

        # Content changed structurally if items, amounts, or recipe links changed
        is_structural_change = (prev_hash != new_hash) if row is not None else False
        prev_version = prev_meta.get("content_version", 0)
        content_version = (prev_version + 1) if is_structural_change else max(prev_version, 1)

        # Read current user state revision to establish pair tracking
        cur.execute("SELECT revision, payload_json, shopping_checked_json FROM user_states WHERE user_id = ?", (user_id,))
        u_row = cur.fetchone()
        current_u_rev = u_row["revision"] if u_row else 0

        new_meta = {
            "content_hash": new_hash,
            "content_version": content_version,
            "paired_user_revision": current_u_rev,
        }
        meta_json = json.dumps(new_meta, ensure_ascii=False)

        if row is None:
            try:
                cur.execute(
                    """
                    INSERT INTO shopping_states
                    (user_id, items_json, checked_map_json, revision, updated_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (user_id, items_json, meta_json, new_revision)
                )
            except sqlite3.IntegrityError:
                raise StaleRevisionError(f"Stale shopping revision: concurrent insert detected for user {user_id}")
        else:
            cur.execute(
                """
                UPDATE shopping_states
                SET items_json = ?, checked_map_json = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND revision = ?
                """,
                (items_json, meta_json, new_revision, user_id, expected_revision)
            )
            if cur.rowcount == 0:
                raise StaleRevisionError(f"Stale shopping revision: CAS failed for user {user_id}")

        # Ensure user state reflects stale shopping ONLY IF content was structurally changed!
        # Checkbox changes (alreadyHave / checkedInStore) never invalidate or stale the menu!
        if is_structural_change and u_row and u_row["payload_json"]:
            try:
                u_payload = json.loads(u_row["payload_json"])
                if isinstance(u_payload, dict) and u_payload.get("menu"):
                    u_payload["shopping_stale"] = True
                    u_meta = {
                        "synced_content_version": None,
                        "stale_since_version": content_version,
                    }
                    cur.execute(
                        "UPDATE user_states SET payload_json = ?, shopping_checked_json = ? WHERE user_id = ?",
                        (json.dumps(u_payload, ensure_ascii=False), json.dumps(u_meta, ensure_ascii=False), user_id)
                    )
            except Exception:
                pass

        return {
            "status": "ok",
            "user_id": user_id,
            "revision": new_revision
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

def record_user_consent(
    user_id: int,
    consent_type: str,
    version: str = "v1.0.0-release",
    granted: bool = True,
    source: str = "tma",
    db_path: Optional[Path] = None
) -> Dict[str, Any]:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO user_consents (user_id, consent_type, version, granted, source, granted_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (user_id, consent_type, version, 1 if granted else 0, source)
        )
        cid = cur.lastrowid
        cur.execute("SELECT * FROM user_consents WHERE id = ?", (cid,))
        row = cur.fetchone()
        return dict(row) if row else {}

def get_user_consents(user_id: int, db_path: Optional[Path] = None) -> List[Dict[str, Any]]:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, user_id, consent_type, version, granted, granted_at, source FROM user_consents WHERE user_id = ? ORDER BY granted_at ASC, id ASC",
            (user_id,)
        )
        rows = cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["granted"] = bool(d["granted"])
            result.append(d)
        return result

def export_all_user_data(user_id: int, db_path: Optional[Path] = None) -> Dict[str, Any]:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        user_row = cur.fetchone()
        if not user_row:
            return {"user_id": user_id, "found": False}

        pilot_user = get_pilot_user(user_id, db_path=db_path)
        pilot_shopping = get_pilot_shopping(user_id, db_path=db_path)
        tickets = get_support_tickets(user_id, db_path=db_path)
        subscription = get_user_subscription(db_path=db_path, user_id=user_id)
        consents = get_user_consents(user_id, db_path=db_path)

        return {
            "user_id": user_id,
            "found": True,
            "user": dict(user_row),
            "profile": pilot_user.get("profile"),
            "state": pilot_user.get("state"),
            "revision": pilot_user.get("revision", 0),
            "shopping": pilot_shopping,
            "tickets": tickets,
            "subscription": subscription,
            "consents": consents,
            "exported_at": datetime.now(timezone.utc).isoformat()
        }

# --- SUBSCRIPTION & MONETIZATION HELPERS ---

def get_user_subscription(
    db_path: Optional[Path | str | int] = None,
    user_id: Optional[int | Path | str] = None,
) -> Optional[Dict[str, Any]]:
    """Возвращает запись подписки пользователя или None, если запись отсутствует."""
    actual_db: Optional[Path] = None
    actual_uid: Optional[int] = None
    if isinstance(db_path, int):
        actual_uid = db_path
        actual_db = Path(user_id) if isinstance(user_id, (str, Path)) else None
    elif isinstance(user_id, int):
        actual_uid = user_id
        actual_db = Path(db_path) if isinstance(db_path, (str, Path)) else None
    elif db_path is not None and user_id is None and isinstance(db_path, (str, Path)):
        actual_db = Path(db_path)

    if actual_uid is None:
        return None

    with get_db_connection(actual_db) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM subscriptions WHERE user_id = ?", (actual_uid,))
        row = cur.fetchone()
        if not row:
            return None
        return dict(row)

def save_user_subscription(
    db_path: Optional[Path | str | int] = None,
    user_id: Optional[int | str] = None,
    tier: str = "free",
    status: str = "active",
    expires_at: Optional[str | float] = None,
) -> Dict[str, Any]:
    """Сохраняет или обновляет подписку пользователя."""
    actual_db: Optional[Path] = None
    actual_uid: Optional[int] = None
    if isinstance(db_path, int):
        actual_uid = db_path
        actual_db = Path(user_id) if isinstance(user_id, (str, Path)) else None
    elif isinstance(user_id, int):
        actual_uid = user_id
        actual_db = Path(db_path) if isinstance(db_path, (str, Path)) else None

    if actual_uid is None:
        raise ValueError("user_id is required for save_user_subscription")

    if isinstance(expires_at, (int, float)):
        exp_str = datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    elif expires_at is not None:
        exp_str = str(expires_at)
    else:
        exp_str = None

    create_or_get_user(actual_uid, db_path=actual_db)
    with get_db_connection(actual_db) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO subscriptions (user_id, tier, status, expires_at, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                tier = excluded.tier,
                status = excluded.status,
                expires_at = excluded.expires_at,
                updated_at = CURRENT_TIMESTAMP
            """,
            (actual_uid, tier, status, exp_str),
        )
        cur.execute("SELECT * FROM subscriptions WHERE user_id = ?", (actual_uid,))
        row = cur.fetchone()
        return dict(row) if row else {}

def create_order(
    db_path: Optional[Path | str | int] = None,
    user_id: Optional[int | str] = None,
    product_id: str = "",
    amount_rub: float = 0.0,
    provider: str = "demo",
) -> str:
    """Создаёт заказ на оплату в таблице orders и возвращает order_id."""
    actual_db: Optional[Path] = None
    actual_uid: Optional[int] = None
    if isinstance(db_path, int):
        actual_uid = db_path
        actual_db = Path(user_id) if isinstance(user_id, (str, Path)) else None
    elif isinstance(user_id, int):
        actual_uid = user_id
        actual_db = Path(db_path) if isinstance(db_path, (str, Path)) else None

    if actual_uid is None:
        raise ValueError("user_id is required for create_order")

    create_or_get_user(actual_uid, db_path=actual_db)
    order_id = f"ord_{actual_uid}_{int(time.time())}_{secrets.token_hex(4)}"
    with get_db_connection(actual_db) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO orders (order_id, user_id, product_id, amount_rub, provider, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """,
            (order_id, actual_uid, product_id, float(amount_rub), provider),
        )
    return order_id

def get_order(
    db_path: Optional[Path | str] = None,
    order_id: Optional[str | Path] = None,
) -> Optional[Dict[str, Any]]:
    """Возвращает информацию о заказе по order_id."""
    actual_db: Optional[Path] = None
    actual_oid: Optional[str] = None
    if isinstance(db_path, str) and not isinstance(order_id, str):
        actual_oid = db_path
        actual_db = Path(order_id) if isinstance(order_id, (str, Path)) else None
    elif isinstance(order_id, str):
        actual_oid = order_id
        actual_db = Path(db_path) if isinstance(db_path, (str, Path)) else None

    if actual_oid is None:
        return None

    with get_db_connection(actual_db) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM orders WHERE order_id = ?", (actual_oid,))
        row = cur.fetchone()
        if not row:
            return None
        return dict(row)

def complete_order(
    db_path: Optional[Path | str] = None,
    order_id: Optional[str | Path] = None,
) -> Dict[str, Any]:
    """Помечает заказ как completed и активирует подписку для пользователя атомарно и идемпотентно."""
    actual_db: Optional[Path] = None
    actual_oid: Optional[str] = None
    if isinstance(db_path, str) and not isinstance(order_id, str):
        actual_oid = db_path
        actual_db = Path(order_id) if isinstance(order_id, (str, Path)) else None
    elif isinstance(order_id, str):
        actual_oid = order_id
        actual_db = Path(db_path) if isinstance(db_path, (str, Path)) else None

    if actual_oid is None:
        raise ValueError("order_id is required for complete_order")

    with get_db_connection(actual_db) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM orders WHERE order_id = ?", (actual_oid,))
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Order not found: {actual_oid}")
        order = dict(row)
        user_id = order["user_id"]
        product_id = order["product_id"]

        # 1. Idempotency & Replay Protection:
        # If the order is already completed, do NOT re-grant or recalculate expiration.
        if order.get("status") == "completed":
            cur.execute("SELECT * FROM subscriptions WHERE user_id = ?", (user_id,))
            sub_row = cur.fetchone()
            order["subscription"] = dict(sub_row) if sub_row else None
            return order

        # 2. Determine product tier and duration
        now_utc = datetime.now(timezone.utc)
        if product_id == "vip_care":
            tier = "vip_care"
            duration_days = 30
        elif product_id == "plateau_guide":
            tier = "plateau_guide"
            duration_days = 365
        else:  # "sub_month" or default
            tier = "sub_month"
            duration_days = 30

        # 3. Renewal Extension:
        # If user already has an active subscription where expires_at > now_utc,
        # add duration_days to the current expires_at rather than truncating remaining days.
        cur.execute("SELECT * FROM subscriptions WHERE user_id = ?", (user_id,))
        existing_sub_row = cur.fetchone()

        base_dt = now_utc
        if existing_sub_row:
            existing_sub = dict(existing_sub_row)
            if existing_sub.get("status") == "active" and existing_sub.get("expires_at"):
                try:
                    exp_raw = existing_sub["expires_at"]
                    if isinstance(exp_raw, (int, float)):
                        current_expiry = datetime.fromtimestamp(exp_raw, tz=timezone.utc)
                    else:
                        exp_str = str(exp_raw).replace("Z", "+00:00")
                        current_expiry = datetime.fromisoformat(exp_str)
                    if current_expiry.tzinfo is None:
                        current_expiry = current_expiry.replace(tzinfo=timezone.utc)
                    if current_expiry > now_utc:
                        base_dt = current_expiry
                except Exception:
                    base_dt = now_utc

        new_expires_dt = base_dt + timedelta(days=duration_days)
        expires_at_str = new_expires_dt.isoformat().replace("+00:00", "Z")

        # 4. Atomic Transaction:
        # Perform both the order update and subscription upsert within the same transaction.
        cur.execute(
            "UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?",
            (actual_oid,),
        )
        cur.execute(
            """
            INSERT INTO subscriptions (user_id, tier, status, expires_at, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                tier = excluded.tier,
                status = excluded.status,
                expires_at = excluded.expires_at,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, tier, "active", expires_at_str),
        )

        cur.execute("SELECT * FROM subscriptions WHERE user_id = ?", (user_id,))
        sub_row = cur.fetchone()

        order["status"] = "completed"
        order["subscription"] = dict(sub_row) if sub_row else None
        return order

def delete_all_user_data(user_id: int, db_path: Optional[Path] = None) -> bool:
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cur = conn.cursor()
        # Preserve financial audit trail by anonymizing orders
        cur.execute("INSERT OR IGNORE INTO users (user_id, username, first_name) VALUES (0, 'anonymous', 'Anonymized User')")
        cur.execute("UPDATE orders SET user_id = 0 WHERE user_id = ?", (user_id,))
        # Cascades to user_profiles, user_sessions, user_states, shopping_states, support_tickets, subscriptions, user_consents
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

# --- ADMIN RECIPES & CATALOG VERSIONING ---

def get_admin_catalog_version(db_path: Optional[Path | str] = None) -> int:
    actual_db = Path(db_path) if db_path is not None else None
    init_db(actual_db)
    with get_db_connection(actual_db) as conn:
        cur = conn.cursor()
        cur.execute("SELECT MAX(version) as max_v FROM admin_catalog_versions")
        row = cur.fetchone()
        if row and row["max_v"] is not None:
            return int(row["max_v"])
        return 1

def get_admin_recipes(db_path: Optional[Path | str] = None) -> List[Dict[str, Any]]:
    actual_db = Path(db_path) if db_path is not None else None
    init_db(actual_db)
    with get_db_connection(actual_db) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM admin_recipes ORDER BY recipe_id ASC")
        rows = cur.fetchall()
        result = []
        for r in rows:
            draft_raw = r["draft_payload_json"]
            pub_raw = r["published_payload_json"]
            app_raw = r["approval_marks_json"]
            has_draft = draft_raw is not None
            result.append({
                "recipe_id": r["recipe_id"],
                "title": r["title"],
                "version": r["version"],
                "status": "draft" if (r["status"] == "draft" or has_draft) else r["status"],
                "has_draft": has_draft,
                "draft": json.loads(draft_raw) if draft_raw else None,
                "published": json.loads(pub_raw) if pub_raw else None,
                "approval_marks": json.loads(app_raw) if app_raw else {},
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            })
        return result

def get_admin_recipe(recipe_id: str, db_path: Optional[Path | str] = None) -> Optional[Dict[str, Any]]:
    actual_db = Path(db_path) if db_path is not None else None
    init_db(actual_db)
    with get_db_connection(actual_db) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM admin_recipes WHERE recipe_id = ?", (recipe_id,))
        row = cur.fetchone()
        if not row:
            return None
        draft_raw = row["draft_payload_json"]
        pub_raw = row["published_payload_json"]
        app_raw = row["approval_marks_json"]
        has_draft = draft_raw is not None
        return {
            "recipe_id": row["recipe_id"],
            "title": row["title"],
            "version": row["version"],
            "status": "draft" if (row["status"] == "draft" or has_draft) else row["status"],
            "has_draft": has_draft,
            "draft": json.loads(draft_raw) if draft_raw else None,
            "published": json.loads(pub_raw) if pub_raw else None,
            "approval_marks": json.loads(app_raw) if app_raw else {},
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

def save_recipe_draft(
    recipe_id: str,
    draft_data: Dict[str, Any],
    approval_marks: Optional[Dict[str, Any]] = None,
    db_path: Optional[Path | str] = None,
) -> Dict[str, Any]:
    actual_db = Path(db_path) if db_path is not None else None
    init_db(actual_db)
    title = draft_data.get("title") or recipe_id
    draft_json = json.dumps(draft_data, ensure_ascii=False)
    with get_db_connection(actual_db) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM admin_recipes WHERE recipe_id = ?", (recipe_id,))
        row = cur.fetchone()
        if row:
            existing_approvals = json.loads(row["approval_marks_json"] or "{}")
            if approval_marks:
                existing_approvals.update(approval_marks)
            cur.execute(
                """
                UPDATE admin_recipes
                SET draft_payload_json = ?, approval_marks_json = ?, updated_at = CURRENT_TIMESTAMP
                WHERE recipe_id = ?
                """,
                (draft_json, json.dumps(existing_approvals, ensure_ascii=False), recipe_id),
            )
            cur.execute("SELECT * FROM admin_recipes WHERE recipe_id = ?", (recipe_id,))
            updated_row = cur.fetchone()
            return {
                "recipe_id": recipe_id,
                "title": updated_row["title"],
                "version": updated_row["version"],
                "has_draft": True,
                "draft": draft_data,
                "published": json.loads(updated_row["published_payload_json"]) if updated_row["published_payload_json"] else None,
                "approval_marks": json.loads(updated_row["approval_marks_json"] or "{}"),
                "status": "draft_pending" if updated_row["published_payload_json"] else "draft",
            }
        else:
            app_marks = approval_marks or {"approved": False, "notes": "New draft"}
            cur.execute(
                """
                INSERT INTO admin_recipes
                (recipe_id, title, version, status, published_payload_json, draft_payload_json, approval_marks_json)
                VALUES (?, ?, 1, 'draft', NULL, ?, ?)
                """,
                (recipe_id, title, draft_json, json.dumps(app_marks, ensure_ascii=False)),
            )
            return {
                "recipe_id": recipe_id,
                "title": title,
                "version": 1,
                "has_draft": True,
                "draft": draft_data,
                "published": None,
                "approval_marks": app_marks,
                "status": "draft",
            }

def publish_recipe_draft(
    recipe_id: str,
    admin_user_id: int = 1084557944,
    db_path: Optional[Path | str] = None,
) -> Dict[str, Any]:
    actual_db = Path(db_path) if db_path is not None else None
    init_db(actual_db)
    with get_db_connection(actual_db) as conn:
        conn.execute("BEGIN IMMEDIATE")
        cur = conn.cursor()
        cur.execute("SELECT * FROM admin_recipes WHERE recipe_id = ?", (recipe_id,))
        row = cur.fetchone()
        if not row:
            raise KeyError(f"Recipe '{recipe_id}' not found")
        if not row["draft_payload_json"]:
            raise ValueError(f"No draft to publish for recipe '{recipe_id}'")

        draft_content = json.loads(row["draft_payload_json"])
        published_content = json.loads(row["published_payload_json"]) if row["published_payload_json"] else {}
        approval_marks = json.loads(row["approval_marks_json"] or "{}")

        # 1. Verification of Approval Status
        if not approval_marks.get("approved"):
            raise RecipePublicationValidationError(
                f"Cannot publish recipe '{recipe_id}': recipe is not approved (approval_marks.approved must be True)"
            )
        if (
            approval_marks.get("status") == "unverified"
            or draft_content.get("status") == "unverified"
            or draft_content.get("nutrition_status") == "unverified"
        ):
            raise RecipePublicationValidationError(
                f"Cannot publish recipe '{recipe_id}': recipe status is unverified"
            )

        # 2. Ingredients validation
        ing = draft_content.get("ing")
        if ing is None and published_content.get("ing"):
            ing = published_content.get("ing")
            draft_content["ing"] = ing
        if not ing or not isinstance(ing, list) or len(ing) == 0:
            raise RecipePublicationValidationError(
                f"Cannot publish recipe '{recipe_id}': ingredients ('ing') are missing or empty"
            )

        # 3. Preparation steps validation
        steps = draft_content.get("steps")
        if steps is None and published_content.get("steps"):
            steps = published_content.get("steps")
            draft_content["steps"] = steps
        if not steps or not isinstance(steps, list) or len(steps) == 0:
            raise RecipePublicationValidationError(
                f"Cannot publish recipe '{recipe_id}': preparation steps ('steps') are missing or empty"
            )

        new_title = draft_content.get("title", row["title"])
        curr_ver = row["version"]
        new_recipe_version = (curr_ver + 1) if row["published_payload_json"] else curr_ver

        cur.execute(
            """
            UPDATE admin_recipes
            SET title = ?, version = ?, status = 'published',
                published_payload_json = ?,
                draft_payload_json = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE recipe_id = ?
            """,
            (new_title, new_recipe_version, json.dumps(draft_content, ensure_ascii=False), recipe_id),
        )

        cur.execute("SELECT MAX(version) as max_v FROM admin_catalog_versions")
        v_row = cur.fetchone()
        curr_cat_ver = int(v_row["max_v"]) if (v_row and v_row["max_v"] is not None) else 0
        new_cat_ver = curr_cat_ver + 1

        cur.execute("SELECT published_payload_json FROM admin_recipes WHERE status = 'published' AND published_payload_json IS NOT NULL")
        all_pub_rows = cur.fetchall()
        snapshot = [json.loads(pr["published_payload_json"]) for pr in all_pub_rows]

        cur.execute(
            """
            INSERT INTO admin_catalog_versions
            (version, published_by, recipes_count, snapshot_json)
            VALUES (?, ?, ?, ?)
            """,
            (new_cat_ver, admin_user_id, len(snapshot), json.dumps(snapshot, ensure_ascii=False)),
        )

        return {
            "status": "published",
            "recipe_id": recipe_id,
            "recipe_version": new_recipe_version,
            "catalog_version": new_cat_ver,
            "recipes_count": len(snapshot),
        }

def get_catalog_snapshot(version: int, db_path: Optional[Path | str] = None) -> Optional[List[Dict[str, Any]]]:
    actual_db = Path(db_path) if db_path is not None else None
    init_db(actual_db)
    with get_db_connection(actual_db) as conn:
        cur = conn.cursor()
        cur.execute("SELECT snapshot_json FROM admin_catalog_versions WHERE version = ?", (version,))
        row = cur.fetchone()
        if not row or not row["snapshot_json"]:
            return None
        return json.loads(row["snapshot_json"])

def get_admin_status(db_path: Optional[Path | str] = None) -> Dict[str, Any]:
    actual_db = Path(db_path) if db_path is not None else None
    init_db(actual_db)
    with get_db_connection(actual_db) as conn:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) as cnt FROM admin_recipes")
        total_recipes = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) as cnt FROM admin_recipes WHERE published_payload_json IS NOT NULL")
        published_recipes = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) as cnt FROM admin_recipes WHERE draft_payload_json IS NOT NULL")
        draft_recipes = cur.fetchone()["cnt"]

        cur.execute("SELECT MAX(version) as max_v FROM admin_catalog_versions")
        v_row = cur.fetchone()
        catalog_version = int(v_row["max_v"]) if (v_row and v_row["max_v"] is not None) else 1

        cur.execute("SELECT COUNT(*) as cnt FROM users")
        active_users = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) as cnt FROM subscriptions WHERE status = 'active'")
        active_subscriptions = cur.fetchone()["cnt"]

        return {
            "status": "ok",
            "catalog_version": catalog_version,
            "total_recipes": total_recipes,
            "published_recipes": published_recipes,
            "draft_recipes": draft_recipes,
            "active_users": active_users,
            "active_subscriptions": active_subscriptions,
        }
