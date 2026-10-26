import os
os.environ["KETO_LOAD_DOTENV"] = "0"

import unittest
from bot import payments

class TestPaymentsDisabled(unittest.TestCase):
    def test_init_purchase_raises_runtime_error(self):
        with self.assertRaises(RuntimeError) as ctx:
            payments.init_purchase(12345, "sub_month")
        self.assertIn("Payments are disabled", str(ctx.exception))

    def test_complete_demo_payment_raises_runtime_error(self):
        with self.assertRaises(RuntimeError) as ctx:
            payments.complete_demo_payment("order_123")
        self.assertIn("Payments are disabled", str(ctx.exception))

    def test_no_database_import_in_payments_module(self):
        """payments.py should not import create_order or mark_order_paid from database."""
        self.assertFalse(hasattr(payments, "create_order"))
        self.assertFalse(hasattr(payments, "mark_order_paid"))

if __name__ == '__main__':
    unittest.main()
