"""
bot/app_settings.py — Конфигурация и безопасные параметры окружения приложения (K2-Pilot).
"""
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import FrozenSet, Optional

BASE_DIR = Path(__file__).resolve().parent.parent

# 15 канонических пилотных рецептов (K2)
PILOT_RECIPE_IDS: FrozenSet[str] = frozenset({
    "k1", "k2", "k3", "k4", "k5",
    "k6", "k7", "k8", "k9", "k10",
    "k11", "k12", "k13", "k14", "k15",
})

@dataclass
class AppSettings:
    app_stage: str = field(default_factory=lambda: os.getenv("APP_STAGE", "pilot"))
    telegram_bot_token: str = field(default_factory=lambda: os.getenv("TELEGRAM_BOT_TOKEN", ""))
    auth_max_age_seconds: int = 86400
    db_path: Path = field(default_factory=lambda: Path(os.getenv("KETO_DB_PATH", str(BASE_DIR / "bot" / "keto_balance.db"))))
    dist_dir: Path = field(default_factory=lambda: Path(os.getenv("KETO_DIST_DIR", str(BASE_DIR / "dist"))))
    released_recipe_ids: FrozenSet[str] = PILOT_RECIPE_IDS
    max_support_message_length: int = 2000
    support_rate_limit_per_minute: int = 5
    allow_anonymous_preview: bool = True
    access_mode: str = field(default_factory=lambda: os.getenv("KETO_ACCESS_MODE", "owner" if os.getenv("APP_STAGE") in ("staging", "home-pilot") else "public"))
    owner_allowlist: Optional[FrozenSet[int]] = None
    allow_demo_auth: bool = False
    allow_demo_payments: bool = False
    session_max_lifetime_seconds: Optional[int] = None
    telegram_webhook_secret_token: Optional[str] = field(default_factory=lambda: os.getenv("TELEGRAM_WEBHOOK_SECRET_TOKEN"))

    @property
    def is_owner_mode(self) -> bool:
        return self.access_mode == "owner" or self.app_stage in {"staging", "home-pilot"}

    @property
    def is_staging(self) -> bool:
        return self.app_stage in {"staging", "home-pilot"}

    @property
    def is_pilot(self) -> bool:
        return self.app_stage in {"pilot", "k2-pilot", "test"}

    @property
    def is_production(self) -> bool:
        return self.app_stage in {"production", "prod"}

_settings: Optional[AppSettings] = None

def get_settings() -> AppSettings:
    global _settings
    if _settings is None:
        _settings = AppSettings()
    return _settings

def set_settings(custom_settings: Optional[AppSettings]) -> None:
    global _settings
    _settings = custom_settings
