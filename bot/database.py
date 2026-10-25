"""
Keto Balance — База данных пользователей, заказов и расчетов (SQLite).
"""
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

DB_PATH = Path(__file__).resolve().parent / "keto_balance.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Таблица пользователей
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                mode TEXT DEFAULT 'keto',
                stage TEXT DEFAULT 'start',
                weight REAL,
                height REAL,
                goal TEXT,
                has_tripwire INTEGER DEFAULT 0,
                has_subscription INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Таблица расчетов нутриентов и воды
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS calculations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                weight REAL,
                mode TEXT,
                water_liters REAL,
                kcal REAL,
                protein REAL,
                fat REAL,
                carbs REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Таблица заказов и оплат
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                order_id TEXT PRIMARY KEY,
                user_id INTEGER,
                product_id TEXT,
                amount REAL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Таблица трекера воды
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS water_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                amount_ml INTEGER,
                date TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()

def get_or_create_user(user_id: int, username: Optional[str], first_name: Optional[str]) -> Dict[str, Any]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        if row:
            return dict(row)
        
        cursor.execute("""
            INSERT INTO users (user_id, username, first_name)
            VALUES (?, ?, ?)
        """, (user_id, username or "", first_name or ""))
        conn.commit()
        cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        return dict(cursor.fetchone())

def update_user_mode(user_id: int, mode: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET mode = ? WHERE user_id = ?", (mode, user_id))
        conn.commit()

def save_calculation(user_id: int, weight: float, mode: str, water: float, kcal: float, p: float, f: float, c: float):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO calculations (user_id, weight, mode, water_liters, kcal, protein, fat, carbs)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, weight, mode, water, kcal, p, f, c))
        cursor.execute("UPDATE users SET weight = ?, mode = ? WHERE user_id = ?", (weight, mode, user_id))
        conn.commit()

def create_order(order_id: str, user_id: int, product_id: str, amount: float):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO orders (order_id, user_id, product_id, amount, status)
            VALUES (?, ?, ?, ?, 'pending')
        """, (order_id, user_id, product_id, amount))
        conn.commit()

def mark_order_paid(order_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,))
        order = cursor.fetchone()
        if not order:
            return None
        
        cursor.execute("UPDATE orders SET status = 'paid' WHERE order_id = ?", (order_id,))
        user_id = order["user_id"]
        product_id = order["product_id"]
        
        if product_id == "plateau_guide":
            cursor.execute("UPDATE users SET has_tripwire = 1 WHERE user_id = ?", (user_id,))
        elif product_id in ("sub_month", "vip_care"):
            cursor.execute("UPDATE users SET has_subscription = 1 WHERE user_id = ?", (user_id,))
        
        conn.commit()
        order_dict = dict(order)
        order_dict["status"] = "paid"
        return order_dict

def log_water(user_id: int, ml: int) -> int:
    today = datetime.now().strftime("%Y-%m-%d")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO water_logs (user_id, amount_ml, date)
            VALUES (?, ?, ?)
        """, (user_id, ml, today))
        conn.commit()
        cursor.execute("SELECT SUM(amount_ml) FROM water_logs WHERE user_id = ? AND date = ?", (user_id, today))
        total = cursor.fetchone()[0] or 0
        return total

def get_today_water(user_id: int) -> int:
    today = datetime.now().strftime("%Y-%m-%d")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT SUM(amount_ml) FROM water_logs WHERE user_id = ? AND date = ?", (user_id, today))
        res = cursor.fetchone()
        return (res[0] if res and res[0] is not None else 0) or 0

def reset_today_water(user_id: int):
    today = datetime.now().strftime("%Y-%m-%d")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM water_logs WHERE user_id = ? AND date = ?", (user_id, today))
        conn.commit()

# Инициализация таблиц при импорте
init_db()
