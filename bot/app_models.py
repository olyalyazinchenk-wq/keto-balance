"""
bot/app_models.py — Pydantic-схемы валидации API запросов и ответов (K2-Pilot).
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator

class InitSessionPayload(BaseModel):
    init_data: str = Field(..., description="Telegram WebApp initData query string")

class SessionResponse(BaseModel):
    session_token: str
    user_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None

class UserProfileModel(BaseModel):
    weight: Optional[float] = Field(None, ge=20.0, le=400.0)
    height: Optional[float] = Field(None, ge=50.0, le=260.0)
    age: Optional[int] = Field(None, ge=12, le=120)
    gender: Optional[str] = Field(None, pattern=r"^(male|female|other)$")
    goal: Optional[str] = None
    contraindications: List[str] = Field(default_factory=list)

class UserStateModel(BaseModel):
    onboarding_completed: bool = False
    selected_day: int = Field(default=1, ge=1, le=30)
    cooked_recipe_ids: List[str] = Field(default_factory=list)
    shopping_checked: Dict[str, bool] = Field(default_factory=dict)

class ShoppingItem(BaseModel):
    id: str
    name: str
    amount: float = Field(..., ge=0.0)
    unit: str
    checked: bool = False
    category: Optional[str] = None

class ShoppingUpdatePayload(BaseModel):
    items: List[ShoppingItem] = Field(default_factory=list)
    checked_map: Dict[str, bool] = Field(default_factory=dict)

class SupportTicketPayload(BaseModel):
    message: str = Field(..., min_length=3, max_length=2000)
    topic: str = Field(default="general", max_length=50)
    contact: Optional[str] = Field(None, max_length=100)

    @field_validator("message")
    @classmethod
    def clean_message(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Message cannot be whitespace only")
        return s

class SupportTicketResponse(BaseModel):
    ticket_id: int
    status: str = "open"
    message: str = "Ticket submitted successfully"

class DataExportModel(BaseModel):
    user_id: int
    profile: Optional[Dict[str, Any]] = None
    state: Optional[Dict[str, Any]] = None
    shopping: Optional[Dict[str, Any]] = None
    tickets: List[Dict[str, Any]] = Field(default_factory=list)
    exported_at: str

class SafetyCheckPayload(BaseModel):
    contraindications: List[str] = Field(default_factory=list)

class SafetyCheckResponse(BaseModel):
    safe: bool
    blocked: bool
    reason: Optional[str] = None
    contraindications_detected: List[str] = Field(default_factory=list)

# --- MONETIZATION & SUBSCRIPTION WIRE MODELS ---

class SubscriptionReadV1(BaseModel):
    is_premium: bool
    tier: Optional[str] = None
    status: str = "none"
    expires_at: Optional[str] = None
    available_products: List[Dict[str, Any]] = Field(default_factory=list)
    user_id: Optional[int] = None

class PurchaseInitPayloadV1(BaseModel):
    product_id: str = Field(..., min_length=1, max_length=50)
    provider: Optional[str] = Field(default="demo", max_length=50)

class PurchaseInitResponseV1(BaseModel):
    order_id: str
    status: str = "pending"
    payment_url: Optional[str] = None
    demo_mode: bool = True

class PurchaseConfirmPayloadV1(BaseModel):
    order_id: str = Field(..., min_length=1, max_length=100)

class PurchaseConfirmResponseV1(BaseModel):
    success: bool = True
    subscription: SubscriptionReadV1
    is_premium: Optional[bool] = None
    tier: Optional[str] = None
    status: Optional[str] = None
    expires_at: Optional[str] = None

class ConsentItemModel(BaseModel):
    consent_type: str = Field(..., min_length=1, max_length=64)
    version: str = Field(default="v1.0.0-release", max_length=32)
    granted: bool = True
    source: Optional[str] = "tma"

class UserConsentsPayload(BaseModel):
    consents: List[ConsentItemModel]

from bot.pilot_models import (
    PilotPreferencesV1,
    PilotProfileV1,
    PilotStateV1,
    PilotShoppingItemV1,
    PilotUserReadV1,
    PilotUserWriteV1,
    PilotShoppingReadV1,
    PilotShoppingWriteV1,
    PilotSaveResultV1,
    PilotCatalogV1,
)
