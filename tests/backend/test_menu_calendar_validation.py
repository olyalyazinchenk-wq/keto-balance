"""
tests/backend/test_menu_calendar_validation.py
Tests calendar consistency of GeneratedMenuModel and ShoppingRangeModel in PilotStateV1.
Addresses Codex Audit 2026-11-08: P1 Calendar and Shopping Range validation.
"""
import calendar
from datetime import date, timedelta
import unittest
from pydantic import ValidationError

from bot.pilot_models import (
    DayMenuModel,
    GeneratedMenuModel,
    PilotStateV1,
    ShoppingRangeModel,
)


class TestMenuCalendarValidation(unittest.TestCase):
    def _create_days(self, start_date_str: str, count: int):
        start = date.fromisoformat(start_date_str)
        return [
            DayMenuModel(
                date=(start + timedelta(days=i)).isoformat(),
                slots={"breakfast": "k1", "dinner": "k2"},
            )
            for i in range(count)
        ]

    def test_days_count_must_match_num_days(self):
        days = self._create_days("2026-11-01", 3)
        with self.assertRaises(ValidationError) as ctx:
            GeneratedMenuModel(
                mode="keto",
                numDays=7,  # Mismatch!
                meals=2,
                portion=1,
                saved=False,
                created=1794000000,
                days=days,
            )
        self.assertIn("Menu days count (3) does not match numDays (7)", str(ctx.exception))

    def test_days_must_be_consecutive(self):
        day1 = DayMenuModel(date="2026-11-01", slots={"m": "k1"})
        day2 = DayMenuModel(date="2026-11-03", slots={"m": "k2"})  # Skipped Nov 2!
        with self.assertRaises(ValidationError) as ctx:
            GeneratedMenuModel(
                mode="keto",
                numDays=2,
                meals=1,
                portion=1,
                saved=False,
                created=1794000000,
                days=[day1, day2],
            )
        self.assertIn("consecutive", str(ctx.exception))

    def test_codex_probe_rejection_single_day_with_month_and_28_days(self):
        """Codex probe: month='2026-11', numDays=28, but only 1 day (7 Nov) must be rejected."""
        single_day = [DayMenuModel(date="2026-11-07", slots={"m": "k1"})]
        with self.assertRaises(ValidationError):
            GeneratedMenuModel(
                mode="keto",
                month="2026-11",
                numDays=28,
                meals=1,
                portion=1,
                saved=False,
                created=1794000000,
                days=single_day,
            )

    def test_november_calendar_month_requires_exact_30_days_from_first_to_last(self):
        days30 = self._create_days("2026-11-01", 30)
        menu = GeneratedMenuModel(
            mode="keto",
            month="2026-11",
            numDays=30,
            meals=2,
            portion=1,
            saved=True,
            created=1794000000,
            days=days30,
        )
        self.assertEqual(menu.days[0].date, "2026-11-01")
        self.assertEqual(menu.days[-1].date, "2026-11-30")

        # Wrong day count for November (e.g. 28 days for full month)
        days28 = self._create_days("2026-11-01", 28)
        with self.assertRaises(ValidationError) as ctx:
            GeneratedMenuModel(
                mode="keto",
                month="2026-11",
                numDays=28,
                meals=2,
                portion=1,
                saved=True,
                created=1794000000,
                days=days28,
            )
        self.assertIn("must have exactly 30 days", str(ctx.exception))

    def test_december_calendar_month_requires_exact_31_days(self):
        days31 = self._create_days("2026-12-01", 31)
        menu = GeneratedMenuModel(
            mode="keto",
            month="2026-12",
            numDays=31,
            meals=2,
            portion=1,
            saved=True,
            created=1794000000,
            days=days31,
        )
        self.assertEqual(menu.days[0].date, "2026-12-01")
        self.assertEqual(menu.days[-1].date, "2026-12-31")

    def test_february_leap_and_non_leap_years(self):
        # 2028 is a leap year (29 days)
        feb2028 = self._create_days("2028-02-01", 29)
        menu2028 = GeneratedMenuModel(
            mode="keto",
            month="2028-02",
            numDays=29,
            meals=2,
            portion=1,
            saved=True,
            created=1794000000,
            days=feb2028,
        )
        self.assertEqual(menu2028.days[-1].date, "2028-02-29")

        # 2027 is non-leap (28 days)
        feb2027 = self._create_days("2027-02-01", 28)
        menu2027 = GeneratedMenuModel(
            mode="keto",
            month="2027-02",
            numDays=28,
            meals=2,
            portion=1,
            saved=True,
            created=1794000000,
            days=feb2027,
        )
        self.assertEqual(menu2027.days[-1].date, "2027-02-28")

    def test_shopping_range_model_validation(self):
        # All range
        range_all = ShoppingRangeModel(range_id="all", type="all")
        self.assertEqual(range_all.type, "all")

        # Week range valid
        range_w0 = ShoppingRangeModel(range_id="week-0", type="week", week_index=0)
        self.assertEqual(range_w0.week_index, 0)

        # Week range missing week_index
        with self.assertRaises(ValidationError):
            ShoppingRangeModel(range_id="week-0", type="week")

        # Custom range valid
        range_custom = ShoppingRangeModel(
            range_id="custom",
            type="custom",
            start_date="2026-11-01",
            end_date="2026-11-07",
        )
        self.assertEqual(range_custom.start_date, "2026-11-01")

        # Custom range inverted dates rejected
        with self.assertRaises(ValidationError):
            ShoppingRangeModel(
                range_id="custom",
                type="custom",
                start_date="2026-11-10",
                end_date="2026-11-05",
            )

    def test_short_menu_crossing_month_boundary_allowed(self):
        # 7 days from 2026-11-28 to 2026-12-04 with month="2026-11"
        days7 = self._create_days("2026-11-28", 7)
        menu = GeneratedMenuModel(
            mode="keto",
            month="2026-11",
            numDays=7,
            meals=2,
            portion=1,
            saved=False,
            created=1795813200000,
            catalog_id="released-catalog-202611-v1",
            days=days7,
        )
        self.assertEqual(menu.days[0].date, "2026-11-28")
        self.assertEqual(menu.days[-1].date, "2026-12-04")

    def test_short_menu_crossing_year_boundary_allowed(self):
        # 3 days from 2026-12-31 to 2027-01-02 with month="2026-12"
        days3 = self._create_days("2026-12-31", 3)
        menu = GeneratedMenuModel(
            mode="keto",
            month="2026-12",
            numDays=3,
            meals=2,
            portion=1,
            saved=False,
            created=1795813200000,
            catalog_id="released-catalog-202612-v1",
            days=days3,
        )
        self.assertEqual(menu.days[0].date, "2026-12-31")
        self.assertEqual(menu.days[-1].date, "2027-01-02")

    def test_short_menu_first_day_mismatch_rejected(self):
        # 3 days starting 2026-10-28 but month="2026-11" must be rejected
        days3 = self._create_days("2026-10-28", 3)
        with self.assertRaises(ValidationError) as ctx:
            GeneratedMenuModel(
                mode="keto",
                month="2026-11",
                numDays=3,
                meals=2,
                portion=1,
                saved=False,
                created=1795813200000,
                days=days3,
            )
        self.assertIn("First day date", str(ctx.exception))

    def test_pilot_state_accepts_shopping_range_and_range_checkmarks(self):
        state = PilotStateV1(
            schema_version=1,
            menu=None,
            selected_date=None,
            shopping_range=ShoppingRangeModel(range_id="week-1", type="week", week_index=1),
            shopping_range_checked={"week-1:shop-butter": True},
        )
        self.assertIsNotNone(state.shopping_range)
        self.assertEqual(state.shopping_range.week_index, 1)
        self.assertTrue(state.shopping_range_checked.get("week-1:shop-butter"))


if __name__ == "__main__":
    unittest.main()
