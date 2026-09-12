from decimal import Decimal

from django.test import TestCase

from billing.services import calculate_fee, invoice_line_items


class CalculateFeeTests(TestCase):
    """Pure function - no request or database access - so every cell of the
    subject-count tier x duration-discount matrix is asserted directly
    against a hand-computed expectation, not against calculate_fee's own
    logic re-derived in the test."""

    def test_full_tier_and_discount_matrix(self):
        # rate/session by subject-count tier: 1 -> 25000, 2-3 -> 20000, 4+ -> 15000
        # discount by duration_weeks: <=3 -> 0%, ==4 -> 10%, >=5 -> 20%
        # total = rate * 5 sessions/week * duration_weeks * (1 - discount)
        cases = [
            # (num_subjects, duration_weeks): expected total
            ((1, 1), Decimal('125000.00')),
            ((1, 3), Decimal('375000.00')),
            ((1, 4), Decimal('450000.00')),
            ((1, 5), Decimal('500000.00')),
            ((2, 1), Decimal('100000.00')),
            ((2, 3), Decimal('300000.00')),
            ((2, 4), Decimal('360000.00')),
            ((2, 5), Decimal('400000.00')),
            ((3, 1), Decimal('100000.00')),
            ((3, 3), Decimal('300000.00')),
            ((3, 4), Decimal('360000.00')),
            ((3, 5), Decimal('400000.00')),
            ((4, 1), Decimal('75000.00')),
            ((4, 3), Decimal('225000.00')),
            ((4, 4), Decimal('270000.00')),
            ((4, 5), Decimal('300000.00')),
            ((10, 5), Decimal('300000.00')),  # 10 subjects still hits the 4+ tier
        ]
        for (num_subjects, duration_weeks), expected in cases:
            with self.subTest(num_subjects=num_subjects, duration_weeks=duration_weeks):
                self.assertEqual(calculate_fee(num_subjects, duration_weeks), expected)

    def test_subject_tier_boundary_at_one_vs_two(self):
        self.assertEqual(calculate_fee(1, 1), Decimal('125000.00'))
        self.assertEqual(calculate_fee(2, 1), Decimal('100000.00'))

    def test_subject_tier_boundary_at_three_vs_four(self):
        self.assertEqual(calculate_fee(3, 1), calculate_fee(2, 1))
        self.assertEqual(calculate_fee(4, 1), Decimal('75000.00'))

    def test_duration_discount_boundary_at_three_vs_four(self):
        self.assertEqual(calculate_fee(1, 3), Decimal('375000.00'))  # no discount
        self.assertEqual(calculate_fee(1, 4), Decimal('450000.00'))  # 10% off

    def test_duration_discount_boundary_at_four_vs_five(self):
        self.assertEqual(calculate_fee(1, 4), Decimal('450000.00'))  # 10% off
        self.assertEqual(calculate_fee(1, 5), Decimal('500000.00'))  # 20% off

    def test_discount_does_not_increase_past_the_top_tier(self):
        # No higher discount tier exists past 20% - a much longer duration
        # should not exceed it.
        self.assertEqual(calculate_fee(1, 52), Decimal('5200000.00'))  # 125000 * 52 * 0.80

    def test_returns_decimal_quantized_to_cents(self):
        result = calculate_fee(1, 4)
        self.assertIsInstance(result, Decimal)
        self.assertEqual(result.as_tuple().exponent, -2)


class InvoiceLineItemsTests(TestCase):
    def test_no_discount_is_a_single_line_item_matching_the_total(self):
        items = invoice_line_items(1, 3)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['amount'], calculate_fee(1, 3))
        self.assertIn('Tuition', items[0]['description'])

    def test_discount_appears_as_a_separate_negative_line_item(self):
        items = invoice_line_items(1, 4)
        self.assertEqual(len(items), 2)
        self.assertLess(items[1]['amount'], 0)
        self.assertIn('10%', items[1]['description'])

    def test_twenty_percent_discount_is_labelled_correctly(self):
        items = invoice_line_items(1, 5)
        self.assertIn('20%', items[1]['description'])

    def test_line_items_always_sum_to_the_invoice_total(self):
        for num_subjects, duration_weeks in [(1, 1), (1, 4), (1, 5), (2, 5), (4, 12), (10, 52)]:
            with self.subTest(num_subjects=num_subjects, duration_weeks=duration_weeks):
                items = invoice_line_items(num_subjects, duration_weeks)
                self.assertEqual(
                    sum(item['amount'] for item in items), calculate_fee(num_subjects, duration_weeks)
                )
