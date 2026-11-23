"""Private, dated body measurements. No diagnoses or nutrition calculations."""
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Literal, Optional

from fastapi import FastAPI, Header, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from bot.app_db import get_db_connection, init_db, StaleRevisionError


class ProgressEntry(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    date: date
    weight: Optional[float] = Field(None, ge=20, le=400)
    chest: Optional[float] = Field(None, ge=20, le=300)
    waist: Optional[float] = Field(None, ge=20, le=300)
    hips: Optional[float] = Field(None, ge=20, le=300)

    @field_validator('date')
    @classmethod
    def past_or_today(cls, value):
        today = datetime.now(timezone(timedelta(hours=3))).date()
        if value < date(1900, 1, 1) or value > today:
            raise ValueError('Дата должна быть не раньше 1900 года и не позже сегодняшнего дня.')
        return value

    @field_validator('weight', 'chest', 'waist', 'hips', mode='before')
    @classmethod
    def no_boolean(cls, value):
        if isinstance(value, bool):
            raise ValueError('Укажите число.')
        return value

    @model_validator(mode='after')
    def has_measurement(self):
        if all(getattr(self, field) is None for field in ('weight', 'chest', 'waist', 'hips')):
            raise ValueError('Добавьте хотя бы один замер.')
        return self


class ProgressWrite(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    age: int = Field(..., ge=18, le=120, strict=True)
    height_cm: Optional[float] = Field(None, ge=80, le=250, strict=True)
    entry: ProgressEntry
    expected_revision: int = Field(..., ge=0, strict=True)
    consent: Literal[True]

    @field_validator('consent', mode='before')
    @classmethod
    def explicit_consent(cls, value):
        if value is not True:
            raise ValueError('Для сохранения необходимо согласие.')
        return value


def init_progress_schema(conn):
    """Additive and idempotent; no existing profile or history is rewritten."""
    conn.execute('''CREATE TABLE IF NOT EXISTS progress_profiles (
        user_id INTEGER PRIMARY KEY,
        age INTEGER CHECK(age BETWEEN 18 AND 120),
        height_cm REAL CHECK(height_cm BETWEEN 80 AND 250),
        revision INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )''')
    if not any(row['name'] == 'height_cm' for row in conn.execute('PRAGMA table_info(progress_profiles)')):
        conn.execute('ALTER TABLE progress_profiles ADD COLUMN height_cm REAL CHECK(height_cm BETWEEN 80 AND 250)')
    conn.execute('''CREATE TABLE IF NOT EXISTS progress_entries (
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        weight REAL CHECK(weight IS NULL OR weight BETWEEN 20 AND 400),
        chest REAL CHECK(chest IS NULL OR chest BETWEEN 20 AND 300),
        waist REAL CHECK(waist IS NULL OR waist BETWEEN 20 AND 300),
        hips REAL CHECK(hips IS NULL OR hips BETWEEN 20 AND 300),
        PRIMARY KEY(user_id,date),
        FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )''')


def _snapshot(conn, user_id):
    profile = conn.execute('SELECT age,height_cm,revision FROM progress_profiles WHERE user_id=?', (user_id,)).fetchone()
    entries = conn.execute('SELECT date,weight,chest,waist,hips FROM progress_entries WHERE user_id=? ORDER BY date ASC', (user_id,)).fetchall()
    return {
        'age': profile['age'] if profile else None,
        'height_cm': profile['height_cm'] if profile else None,
        'entries': [dict(row) for row in entries],
        'revision': profile['revision'] if profile else 0,
    }


def get_progress(user_id: int, db_path: Optional[Path] = None):
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        return _snapshot(conn, user_id)


def save_progress(user_id: int, payload: ProgressWrite, db_path: Path):
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        conn.execute('BEGIN IMMEDIATE')
        current = _snapshot(conn, user_id)
        if current['revision'] != payload.expected_revision:
            raise StaleRevisionError('Замеры изменились в другой сессии. Обновите историю перед сохранением.')
        next_revision = current['revision'] + 1
        height_cm = payload.height_cm if 'height_cm' in payload.model_fields_set else current['height_cm']
        conn.execute('''INSERT INTO progress_profiles(user_id,age,height_cm,revision) VALUES (?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET age=excluded.age,height_cm=excluded.height_cm,revision=excluded.revision''',
            (user_id, payload.age, height_cm, next_revision))
        entry = payload.entry
        conn.execute('''INSERT INTO progress_entries(user_id,date,weight,chest,waist,hips) VALUES (?,?,?,?,?,?)
            ON CONFLICT(user_id,date) DO UPDATE SET weight=excluded.weight,chest=excluded.chest,waist=excluded.waist,hips=excluded.hips''',
            (user_id, entry.date.isoformat(), entry.weight, entry.chest, entry.waist, entry.hips))
        # Consent and measurements commit atomically in the existing consent journal.
        conn.execute('''INSERT INTO user_consents(user_id,consent_type,version,granted,source,granted_at)
            VALUES (?,'body_progress','v1',1,'tma',CURRENT_TIMESTAMP)''', (user_id,))
        return _snapshot(conn, user_id)


def delete_progress_entry(user_id: int, entry_date: date, expected_revision: int, db_path: Path):
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        conn.execute('BEGIN IMMEDIATE')
        current = _snapshot(conn, user_id)
        if current['revision'] != expected_revision:
            raise StaleRevisionError('Замеры изменились в другой сессии. Обновите историю перед удалением.')
        removed = conn.execute('DELETE FROM progress_entries WHERE user_id=? AND date=?', (user_id, entry_date.isoformat()))
        if removed.rowcount == 0:
            raise HTTPException(status_code=404, detail='Запись не найдена.')
        conn.execute('UPDATE progress_profiles SET revision=revision+1 WHERE user_id=?', (user_id,))
        return _snapshot(conn, user_id)


def register_progress_routes(app: FastAPI, db_path: Path, authenticate: Callable):
    @app.get('/api/progress')
    def read_progress(response: Response, authorization: Optional[str] = Header(None), x_user_id: Optional[int] = Header(None), user_id: Optional[int] = Query(None)):
        uid = authenticate(authorization, x_user_id, user_id)
        response.headers['Cache-Control'] = 'no-store'
        return get_progress(uid, db_path)

    @app.put('/api/progress')
    def write_progress(payload: ProgressWrite, response: Response, authorization: Optional[str] = Header(None), x_user_id: Optional[int] = Header(None), user_id: Optional[int] = Query(None)):
        uid = authenticate(authorization, x_user_id, user_id)
        response.headers['Cache-Control'] = 'no-store'
        try:
            return save_progress(uid, payload, db_path)
        except StaleRevisionError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.delete('/api/progress/{entry_date}')
    def remove_progress(entry_date: date, response: Response, expected_revision: int = Query(..., ge=0), authorization: Optional[str] = Header(None), x_user_id: Optional[int] = Header(None), user_id: Optional[int] = Query(None)):
        uid = authenticate(authorization, x_user_id, user_id)
        response.headers['Cache-Control'] = 'no-store'
        try:
            return delete_progress_entry(uid, entry_date, expected_revision, db_path)
        except StaleRevisionError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
