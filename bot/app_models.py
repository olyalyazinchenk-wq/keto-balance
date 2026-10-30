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
