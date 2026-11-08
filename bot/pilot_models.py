"""
bot/pilot_models.py — Wire v1 Pydantic-модели валидации данных пилота (Section 5.3).
Строгая типизация, валидация revisions, ISO-дат, целостности selected_date и запрет лишних полей (extra='forbid').
"""
import calendar
from datetime import date, timedelta
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
    planDays: Optional[int] = Field(default=3, ge=1, le=31)
    month: Optional[str] = Field(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
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
    numDays: int = Field(..., ge=1, le=31, strict=True)
    meals: int = Field(..., ge=1, le=10, strict=True)
    portion: int = Field(default=1, ge=1, le=10, strict=True)
    saved: bool = Field(default=False, strict=True)
    created: int = Field(..., strict=True)
    catalog_id: Optional[str] = Field(default=None, max_length=100)
    month: Optional[str] = Field(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    days: List[DayMenuModel] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_menu_calendar_consistency(self) -> "GeneratedMenuModel":
        if len(self.days) != self.numDays:
            raise ValueError(
                f"Menu days count ({len(self.days)}) does not match numDays ({self.numDays})"
            )
        if self.days:
            parsed_dates = [date.fromisoformat(d.date) for d in self.days]
            for i in range(len(parsed_dates) - 1):
                if parsed_dates[i + 1] != parsed_dates[i] + timedelta(days=1):
                    raise ValueError(
                        f"Menu days must be consecutive calendar dates: {parsed_dates[i]} followed by {parsed_dates[i+1]}"
                    )
            if self.month:
                year, month_num = map(int, self.month.split("-"))
                _, days_in_month = calendar.monthrange(year, month_num)
                if self.numDays >= 28 or self.numDays == days_in_month:
                    if self.numDays != days_in_month:
                        raise ValueError(
                            f"Calendar month {self.month} must have exactly {days_in_month} days, got {self.numDays}"
                        )
                    first_expected = f"{self.month}-01"
                    last_expected = f"{self.month}-{days_in_month:02d}"
                    if self.days[0].date != first_expected:
                        raise ValueError(
                            f"Calendar month {self.month} must start on {first_expected}, got {self.days[0].date}"
                        )
                    if self.days[-1].date != last_expected:
                        raise ValueError(
                            f"Calendar month {self.month} must end on {last_expected}, got {self.days[-1].date}"
                        )
                else:
                    for d in self.days:
                        if not d.date.startswith(self.month):
                            raise ValueError(
                                f"Day date {d.date} does not belong to specified menu month {self.month}"
                            )
        return self

class ShoppingRangeModel(StrictBaseModel):
    range_id: str = Field(default="all", max_length=100)
    type: Literal["all", "week", "custom"] = "all"
    week_index: Optional[int] = Field(default=None, ge=0, le=5)
    start_date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")

    @model_validator(mode="after")
    def validate_range_dates(self) -> "ShoppingRangeModel":
        if self.type == "week":
            if self.week_index is None:
                raise ValueError("week_index is required when type is 'week'")
        elif self.type == "custom":
            if not self.start_date or not self.end_date:
                raise ValueError("start_date and end_date are required when type is 'custom'")
            if self.start_date > self.end_date:
                raise ValueError(f"start_date ({self.start_date}) cannot be after end_date ({self.end_date})")
        return self

class PilotStateV1(StrictBaseModel):
    schema_version: Literal[1] = 1
    menu: Optional[GeneratedMenuModel] = None
    selected_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    month: Optional[str] = Field(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    checked_ingredients: Dict[str, bool] = Field(default_factory=dict)
    checked_steps: Dict[str, bool] = Field(default_factory=dict)
    shopping_batches: Literal[1, 2, 4] = 1
    shopping_stale: bool = Field(default=False, strict=True)
    shopping_range: Optional[ShoppingRangeModel] = None
    shopping_range_checked: Dict[str, bool] = Field(default_factory=dict)

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
