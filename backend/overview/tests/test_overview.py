from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from rest_framework.test import APITestCase

from academics.models import Subject
from accounts.models import Role, TutorProfile, User
from billing.models import Invoice, Payment
from clients.models import Parent, Student
from enquiries.models import Enquiry, EnquiryStage
from enrollments.models import Enrollment, EnrollmentStatus, LearningMode
from overview import services

TODAY = date(2026, 10, 8)


def make_user(role, email=None, **kwargs):
    email = email or f'{role.lower()}@lhq.test'
    return User.objects.create_user(email=email, full_name=role.title(), role=role, **kwargs)


def at(year, month, day):
    return datetime(year, month, day, 12, tzinfo=dt_timezone.utc)


def make_enquiry(stage=EnquiryStage.INITIAL_CALL):
    parent = Parent.objects.create(full_name='Jane Doe', phone='0999')
    return Enquiry.objects.create(parent=parent, student_name='Jimmy', stage=stage)


def make_invoice(total, created, due=date(2026, 12, 31)):
    invoice = Invoice.objects.create(enquiry=make_enquiry(), total=Decimal(total), due_date=due)
    # created_at is auto_now_add, so it can only be backdated after the fact.
    Invoice.objects.filter(pk=invoice.pk).update(created_at=created)
    return invoice


def pay(invoice, amount, when):
    payment = Payment.objects.create(invoice=invoice, amount=Decimal(amount))
    Payment.objects.filter(pk=payment.pk).update(paid_at=when)


_student_seq = 0


def make_enrollment(created, status=EnrollmentStatus.ACTIVE, withdrawn_at=None, student=None):
    global _student_seq
    if student is None:
        _student_seq += 1
        student = Student.objects.create(student_number=f'STU-{_student_seq:06d}', full_name=f'Student {_student_seq}')
    enrollment = Enrollment.objects.create(
        student=student,
        start_date=date(2026, 1, 5),
        end_date=date(2026, 12, 5),
        learning_mode=LearningMode.IN_PERSON,
        status=status,
        withdrawn_at=withdrawn_at,
    )
    Enrollment.objects.filter(pk=enrollment.pk).update(created_at=created)
    return enrollment


class PeriodBoundsTests(TestCase):
    def test_this_month(self):
        self.assertEqual(services.period_bounds('this_month', TODAY), (date(2026, 10, 1), date(2026, 11, 1)))

    def test_last_month(self):
        self.assertEqual(services.period_bounds('last_month', TODAY), (date(2026, 9, 1), date(2026, 10, 1)))

    def test_this_year(self):
        self.assertEqual(services.period_bounds('this_year', TODAY), (date(2026, 1, 1), date(2027, 1, 1)))

    def test_year_boundaries(self):
        january = date(2026, 1, 15)
        self.assertEqual(services.period_bounds('last_month', january), (date(2025, 12, 1), date(2026, 1, 1)))
        december = date(2026, 12, 31)
        self.assertEqual(services.period_bounds('this_month', december), (date(2026, 12, 1), date(2027, 1, 1)))

    def test_unknown_period(self):
        with self.assertRaises(ValueError):
            services.period_bounds('forever', TODAY)


class CompanyCountsTests(TestCase):
    def test_counts(self):
        twice = Student.objects.create(student_number='STU-900001', full_name='Two Enrollments')
        make_enrollment(at(2026, 10, 1), student=twice)
        make_enrollment(at(2026, 10, 2), student=twice)
        make_enrollment(at(2026, 10, 3))
        make_enrollment(at(2026, 9, 1), status=EnrollmentStatus.WITHDRAWN, withdrawn_at=date(2026, 9, 20))
        make_enrollment(at(2026, 1, 1), status=EnrollmentStatus.COMPLETED)

        TutorProfile.objects.create(user=make_user(Role.TUTOR))
        TutorProfile.objects.create(user=make_user(Role.OWNER))  # an Owner who teaches counts
        TutorProfile.objects.create(user=make_user(Role.TUTOR, email='gone@lhq.test', is_active=False))

        Subject.objects.create(name='Maths')
        Subject.objects.create(name='Latin', is_active=False)

        make_enquiry(EnquiryStage.INITIAL_CALL)
        make_enquiry(EnquiryStage.INVOICED)
        make_enquiry(EnquiryStage.ENROLLED)

        self.assertEqual(
            services.company_counts(),
            # A student with two active enrollments is one student.
            {'active_students': 2, 'tutors': 2, 'active_subjects': 1, 'open_enquiries': 2},
        )

    def test_empty_company(self):
        self.assertEqual(
            services.company_counts(),
            {'active_students': 0, 'tutors': 0, 'active_subjects': 0, 'open_enquiries': 0},
        )


class MoneyTests(TestCase):
    def _money(self, period='this_month'):
        start, end = services.period_bounds(period, TODAY)
        return services.money(start, end, TODAY)

    def test_empty(self):
        self.assertEqual(
            self._money(),
            {
                'invoiced': Decimal('0.00'),
                'collected': Decimal('0.00'),
                'outstanding': Decimal('0.00'),
                'overdue_amount': Decimal('0.00'),
                'overdue_count': 0,
            },
        )

    def test_invoiced_and_collected_follow_the_period(self):
        october = make_invoice('500.00', at(2026, 10, 2))
        september = make_invoice('300.00', at(2026, 9, 10))
        pay(october, '200.00', at(2026, 10, 3))
        pay(september, '100.00', at(2026, 9, 12))
        pay(september, '50.00', at(2026, 10, 5))  # paid in October against a September invoice

        this_month = self._money('this_month')
        self.assertEqual(this_month['invoiced'], Decimal('500.00'))
        self.assertEqual(this_month['collected'], Decimal('250.00'))

        last_month = self._money('last_month')
        self.assertEqual(last_month['invoiced'], Decimal('300.00'))
        self.assertEqual(last_month['collected'], Decimal('100.00'))

        this_year = self._money('this_year')
        self.assertEqual(this_year['invoiced'], Decimal('800.00'))
        self.assertEqual(this_year['collected'], Decimal('350.00'))

    def test_period_edges_are_start_inclusive_end_exclusive(self):
        make_invoice('10.00', datetime(2026, 10, 1, 0, 0, tzinfo=dt_timezone.utc))
        make_invoice('20.00', datetime(2026, 11, 1, 0, 0, tzinfo=dt_timezone.utc))
        make_invoice('40.00', datetime(2026, 9, 30, 23, 59, 59, tzinfo=dt_timezone.utc))
        self.assertEqual(self._money('this_month')['invoiced'], Decimal('10.00'))

    def test_outstanding_and_overdue_are_as_of_today_whatever_the_period(self):
        old = make_invoice('1000.00', at(2025, 3, 1), due=date(2025, 4, 1))  # overdue, part paid
        pay(old, '400.00', at(2025, 3, 5))
        make_invoice('250.00', at(2026, 10, 1), due=date(2026, 10, 7))  # overdue since yesterday
        make_invoice('80.00', at(2026, 10, 1), due=TODAY)  # due today: not overdue yet
        settled = make_invoice('500.00', at(2026, 9, 1), due=date(2026, 9, 15))  # late but paid in full
        pay(settled, '300.00', at(2026, 9, 2))
        pay(settled, '200.00', at(2026, 9, 3))

        for period in services.PERIODS:
            with self.subTest(period=period):
                result = self._money(period)
                self.assertEqual(result['outstanding'], Decimal('930.00'))  # 600 + 250 + 80
                self.assertEqual(result['overdue_amount'], Decimal('850.00'))  # 600 + 250
                self.assertEqual(result['overdue_count'], 2)

    def test_several_payments_do_not_multiply_the_invoice_total(self):
        invoice = make_invoice('900.00', at(2026, 10, 1))
        for amount in ('100.00', '100.00', '100.00'):
            pay(invoice, amount, at(2026, 10, 2))
        result = self._money()
        self.assertEqual(result['invoiced'], Decimal('900.00'))
        self.assertEqual(result['outstanding'], Decimal('600.00'))


class EnrollmentTrendTests(TestCase):
    def test_six_months_oldest_first_with_empty_months_as_zero(self):
        make_enrollment(at(2026, 10, 1))
        make_enrollment(at(2026, 10, 7))
        make_enrollment(at(2026, 8, 15), status=EnrollmentStatus.WITHDRAWN, withdrawn_at=date(2026, 10, 2))
        make_enrollment(at(2026, 5, 1))
        make_enrollment(at(2026, 4, 30))  # just before the window
        make_enrollment(at(2026, 5, 20), status=EnrollmentStatus.WITHDRAWN, withdrawn_at=date(2026, 4, 30))

        self.assertEqual(
            services.enrollment_trend(TODAY),
            [
                {'month': '2026-05', 'enrolled': 2, 'withdrawn': 0},
                {'month': '2026-06', 'enrolled': 0, 'withdrawn': 0},
                {'month': '2026-07', 'enrolled': 0, 'withdrawn': 0},
                {'month': '2026-08', 'enrolled': 1, 'withdrawn': 0},
                {'month': '2026-09', 'enrolled': 0, 'withdrawn': 0},
                {'month': '2026-10', 'enrolled': 2, 'withdrawn': 1},
            ],
        )

    def test_window_crosses_a_year_boundary(self):
        months = [row['month'] for row in services.enrollment_trend(date(2026, 2, 10))]
        self.assertEqual(months, ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02'])


class FunnelTests(TestCase):
    def test_stages_in_pipeline_order_with_conversion(self):
        for stage in (
            EnquiryStage.INITIAL_CALL,
            EnquiryStage.INITIAL_CALL,
            EnquiryStage.INVOICED,
            EnquiryStage.ENROLLED,
        ):
            make_enquiry(stage)

        funnel = services.onboarding_funnel()
        self.assertEqual(
            [(row['stage'], row['label'], row['count']) for row in funnel['stages']],
            [
                ('INITIAL_CALL', 'Initial call', 2),
                ('MEETING_SET', 'Meeting set', 0),
                ('INVOICED', 'Invoiced', 1),
                ('ENROLLED', 'Enrolled', 1),
            ],
        )
        self.assertEqual(funnel['total'], 4)
        self.assertEqual(funnel['enrolled'], 1)
        self.assertEqual(funnel['conversion_rate'], 0.25)

    def test_no_enquiries_has_no_conversion_rate(self):
        funnel = services.onboarding_funnel()
        self.assertEqual(funnel['total'], 0)
        self.assertIsNone(funnel['conversion_rate'])


class OverviewApiTests(APITestCase):
    def test_owner_and_sys_admin_get_the_overview(self):
        for role in (Role.OWNER, Role.SYS_ADMIN):
            with self.subTest(role=role):
                self.client.force_authenticate(make_user(role))
                resp = self.client.get('/api/overview/')
                self.assertEqual(resp.status_code, 200, resp.data)
                self.assertEqual(
                    set(resp.data), {'period', 'counts', 'money', 'enrollment_trend', 'funnel'}
                )
                self.assertEqual(resp.data['period']['key'], 'this_month')
                self.assertEqual(len(resp.data['enrollment_trend']), 6)

    def test_admin_and_tutor_are_refused(self):
        # An Admin can read invoices one by one, but not company revenue.
        for role in (Role.ADMIN, Role.TUTOR):
            with self.subTest(role=role):
                self.client.force_authenticate(make_user(role))
                self.assertEqual(self.client.get('/api/overview/').status_code, 403)

    def test_anonymous_unauthorized(self):
        self.assertEqual(self.client.get('/api/overview/').status_code, 401)

    def test_period_param(self):
        self.client.force_authenticate(make_user(Role.OWNER))
        with mock.patch('overview.services.timezone.localdate', return_value=TODAY):
            resp = self.client.get('/api/overview/?period=last_month')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['period'], {'key': 'last_month', 'start': '2026-09-01', 'end': '2026-10-01'})

        bad = self.client.get('/api/overview/?period=forever')
        self.assertEqual(bad.status_code, 400)
        self.assertIn('period', bad.data)

    def test_money_serialises_as_two_decimal_strings(self):
        invoice = make_invoice('1234.50', at(2026, 10, 2))
        pay(invoice, '234.50', at(2026, 10, 3))
        self.client.force_authenticate(make_user(Role.OWNER))
        with mock.patch('overview.services.timezone.localdate', return_value=TODAY):
            resp = self.client.get('/api/overview/', format='json')
        body = resp.json()
        self.assertEqual(body['money']['invoiced'], '1234.50')
        self.assertEqual(body['money']['collected'], '234.50')
        self.assertEqual(body['money']['outstanding'], '1000.00')
        self.assertEqual(body['money']['overdue_count'], 0)

    def test_query_count_does_not_grow_with_data(self):
        self.client.force_authenticate(make_user(Role.OWNER))
        for day in range(1, 6):
            invoice = make_invoice('100.00', at(2026, 10, day))
            pay(invoice, '10.00', at(2026, 10, day))
            make_enrollment(at(2026, 10, day))
        with self.assertNumQueries(10):
            self.client.get('/api/overview/')
