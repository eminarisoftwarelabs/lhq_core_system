from decimal import Decimal

from django.test import TestCase

from billing.services import calculate_fee


class CalculateFeeTests(TestCase):
    def test_zero_subjects_or_duration_is_free(self):
        self.assertEqual(calculate_fee(0, 12), Decimal('0.00'))
        self.assertEqual(calculate_fee(2, 0), Decimal('0.00'))

    def test_single_subject_no_discount(self):
        # rate 25.00 * 1 subject * 1 session/week * 4 weeks, no discount tier hit
        self.assertEqual(calculate_fee(1, 4), Decimal('100.00'))

    def test_higher_subject_count_uses_lower_per_subject_rate(self):
        fee_one = calculate_fee(1, 4) / 1
        fee_three = calculate_fee(3, 4) / 3
        self.assertLess(fee_three, fee_one)

    def test_duration_discount_applies_at_threshold(self):
        # 8 weeks hits the 5% tier; 7 weeks doesn't.
        undiscounted = Decimal('25.00') * 1 * 7
        discounted = Decimal('25.00') * 1 * 8 * Decimal('0.95')
        self.assertEqual(calculate_fee(1, 7), undiscounted.quantize(Decimal('0.01')))
        self.assertEqual(calculate_fee(1, 8), discounted.quantize(Decimal('0.01')))

    def test_longest_duration_discount_wins(self):
        # 12 weeks should hit the 10% tier, not the 5% one.
        expected = (Decimal('25.00') * 1 * 12 * Decimal('0.90')).quantize(Decimal('0.01'))
        self.assertEqual(calculate_fee(1, 12), expected)
