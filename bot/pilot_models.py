"""
bot/pilot_models.py — Wire v1 Pydantic-модели валидации данных пилота (Section 5.3).
Строгая типизация, валидация revisions, ISO-дат, целостности selected_date и запрет лишних полей (extra='forbid').
"""
from datetime import date
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PilotRestrictionToken = Literal[
    'exclude_eggs',
    'exclude_dairy',
    'exclude_fish',
    'exclude_nuts',
    'exclude_offal',
    'exclude_mushrooms',
    'exclude_pork',
    'no_eggs',
    'no_dairy',
    'no_fish',
    'no_nuts',
    'no_offal',
    'no_mushrooms',
    'no_pork'
]

class StrictBaseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class PilotPreferencesV1(StrictBaseModel):
    confirmed18Plus: bool = Field(..., strict=True)
    approach: Literal['keto', 'carnivore', 'explore']
    restrictions: List[PilotRestrictionToken] = Field(default_factory=list)
    prepTimeMax: int = Field(..., ge=0, le=240, strict=True)
    mealsPerDay: Literal[2, 3, 4]
    planDays: Optional[Literal[1, 3, 7]] = 3
    preferenceNote: Literal['', 'simple_daily'] = ''

class PilotProfileV1(StrictBaseModel):
    settings: Optional[PilotPreferencesV1] = None
    weight: Optional[float] = Field(None, ge=20.0, le=400.0)
    height: Optional[float] = Field(None, ge=50.0, le=260.0)
    age: Optional[int] = Field(None, ge=12, le=120)
    gender: Optional[Literal['male', 'female', 'other']] = None
    goal: Optional[str] = Field(None, max_length=200)
    contraindications: Optional[List[str]] = Field(default=None)

class DayMenuModel(StrictBaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    slots: Dict[str, str] = Field(default_factory=dict)

    @field_validator("date")
    @classmethod
    def validate_calendar_date(cls, v: str) -> str:
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError(f"Invalid calendar date: {v}")
        return v

class GeneratedMenuModel(StrictBaseModel):
    mode: str
    numDays: int = Field(..., ge=1, le=30, strict=True)
    meals: int = Field(..., ge=1, le=10, strict=True)
    portion: int = Field(default=1, ge=1, le=10, strict=True)
    saved: bool = Field(default=False, strict=True)
    created: int = Field(..., strict=True)
    catalog_id: Optional[str] = Field(default=None, max_length=100)
    days: List[DayMenuModel] = Field(default_factory=list)

class PilotStateV1(StrictBaseModel):
    schema_version: Literal[1] = 1
    menu: Optional[GeneratedMenuModel] = None
    selected_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    checked_ingredients: Dict[str, bool] = Field(default_factory=dict)
    checked_steps: Dict[str, bool] = Field(default_factory=dict)
    shopping_batches: Literal[1, 2, 4] = 1
    shopping_stale: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def validate_menu_and_selected_date(self) -> "PilotStateV1":
        if self.menu is None:
            if self.selected_date is not None:
                raise ValueError("selected_date must be null when menu is null")
        else:
            if self.selected_date is not None:
                allowed_dates = {d.date for d in self.menu.days}
                if self.selected_date not in allowed_dates:
                    raise ValueError(f"selected_date '{self.selected_date}' not found in menu days")
        return self

class PilotShoppingItemV1(StrictBaseModel):
    id: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    amountLabel: str = Field(..., max_length=100)
    department: str = Field(..., max_length=100)
    linkedRecipeTitles: List[str] = Field(default_factory=list)
    alreadyHave: bool = Field(default=False, strict=True)
    checkedInStore: bool = Field(default=False, strict=True)

class PilotUserReadV1(StrictBaseModel):
    schema_version: Literal[1] = 1
    user_id: int = Field(..., gt=0, strict=True)
    revision: int = Field(..., ge=0, strict=True)
    profile: Optional[PilotProfileV1] = None
    state: Optional[PilotStateV1] = None

class PilotUserWriteV1(StrictBaseModel):
    schema_version: Literal[1] = 1
    expected_revision: int = Field(..., ge=0, strict=True)
    profile: Optional[PilotProfileV1] = Field(...)
    state: Optional[PilotStateV1] = Field(...)

class PilotShoppingReadV1(StrictBaseModel):
    schema_version: Literal[1] = 1
    user_id: int = Field(..., gt=0, strict=True)
    revision: int = Field(..., ge=0, strict=True)
    items: List[PilotShoppingItemV1] = Field(default_factory=list)

class PilotShoppingWriteV1(StrictBaseModel):
    schema_version: Literal[1] = 1
    expected_revision: int = Field(..., ge=0, strict=True)
    items: List[PilotShoppingItemV1] = Field(...)

class PilotSaveResultV1(StrictBaseModel):
    status: Literal['ok'] = 'ok'
    user_id: int = Field(..., gt=0, strict=True)
    revision: int = Field(..., ge=0, strict=True)

class PilotCatalogV1(StrictBaseModel):
    schema_version: Literal[1] = 1
    catalog_id: str
    test_only: bool = Field(..., strict=True)
    released_ids: List[str] = Field(default_factory=list)
    recipes: List[Dict[str, Any]] = Field(default_factory=list)
    nutrition_status: Literal['unverified'] = 'unverified'
