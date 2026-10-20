"""Manager reports (stats, shortages, payroll PDF), notifications and e-mails."""

from datetime import date, time, timedelta
from decimal import Decimal

from django.core import mail
from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import SwapRequest, WorkDay
from core.tests.factories import future_date, make_organization, make_shift_template, make_user, make_workday
from core.utils import format_shortage_message, shortage_day_label


class ShortageMessageTests(SimpleTestCase):
    MONDAY = date(2026, 7, 13)

    def test_singular_and_plural(self):
        self.assertEqual(
            format_shortage_message({'shift_template_name': 'Wieczorna', 'needed': 1}),
            'Jutro brakuje osoby na zmianę: wieczorna.',
        )
        self.assertEqual(
            format_shortage_message({'shift_template_name': 'Poranna', 'needed': 3}),
            'Jutro brakuje 3 osób na zmianę: poranna.',
        )

    def test_relative_day_labels(self):
        cases = {
            1: 'Jutro',
            2: 'Pojutrze',
            3: 'W czwartek',
            8: 'We wtorek',
            9: 'W środę',
        }
        for days_ahead, expected in cases.items():
            with self.subTest(days_ahead=days_ahead):
                day = self.MONDAY + timedelta(days=days_ahead)
                self.assertEqual(shortage_day_label(day, today=self.MONDAY), expected)

    def test_message_uses_date_of_shortage(self):
        shortage = {'shift_template_name': 'Wieczorna', 'needed': 1, 'date': date(2026, 7, 16)}
        self.assertEqual(
            format_shortage_message(shortage, today=self.MONDAY),
            'W czwartek brakuje osoby na zmianę: wieczorna.',
        )


class ReportTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = make_organization()
        cls.manager = make_user(cls.org, 'manager', manager=True, hourly_rate='30')
        cls.employee = make_user(cls.org, 'employee', hourly_rate='20', first_name='Łukasz', last_name='Żółć')

    def login(self, user):
        self.client.force_authenticate(user)


class TeamStatsTests(ReportTestCase):
    MONTH = '2030-01'

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        make_workday(cls.employee, date(2030, 1, 15), start=time(9), end=time(17))
        make_workday(cls.employee, date(2030, 1, 16), start=time(9), end=time(13), status=WorkDay.Status.PROPOSED)
        make_workday(cls.employee, date(2030, 2, 1))  # other month

    def test_monthly_totals(self):
        self.login(self.manager)
        data = self.client.get('/api/stats/', {'month': self.MONTH}).data

        self.assertEqual(data['employee_count'], 1)
        self.assertEqual(data['approved_days'], 1)
        self.assertEqual(data['total_hours'], Decimal('8.00'))
        self.assertEqual(data['total_earnings'], Decimal('160.00'))
        self.assertEqual(data['pending_proposals'], 1)

    def test_month_parameter_is_validated(self):
        self.login(self.manager)
        self.assertEqual(self.client.get('/api/stats/').status_code, 400)
        self.assertEqual(self.client.get('/api/stats/', {'month': '2030-13'}).status_code, 400)

    def test_employee_forbidden(self):
        self.login(self.employee)
        self.assertEqual(self.client.get('/api/stats/', {'month': self.MONTH}).status_code, 403)


class ScheduleHolesTests(ReportTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.template = make_shift_template(cls.org, 'Wieczorna', start=time(16), end=time(22), max_slots=2)

    def test_lists_one_hole_per_day_sorted(self):
        self.login(self.manager)
        data = self.client.get('/api/schedule-holes/', {'days': 7}).data

        self.assertEqual((data['days'], data['count']), (7, 7))
        dates = [item['date'] for item in data['items']]
        self.assertEqual(dates, sorted(dates))
        self.assertEqual((data['items'][0]['needed'], data['items'][0]['filled']), (2, 0))

    def test_approved_shift_reduces_needed(self):
        make_workday(self.employee, timezone.localdate(), start=time(16), end=time(22), shift_template=self.template)
        self.login(self.manager)

        item = self.client.get('/api/schedule-holes/', {'days': 1}).data['items'][0]

        self.assertEqual((item['needed'], item['filled']), (1, 1))

    def test_days_parameter_is_clamped(self):
        self.login(self.manager)
        self.assertEqual(self.client.get('/api/schedule-holes/', {'days': 99}).data['days'], 14)
        self.assertEqual(self.client.get('/api/schedule-holes/', {'days': 'abc'}).data['days'], 7)

    def test_employee_forbidden(self):
        self.login(self.employee)
        self.assertEqual(self.client.get('/api/schedule-holes/').status_code, 403)


class NotificationTests(ReportTestCase):
    def setUp(self):
        self.tomorrow = timezone.localdate() + timedelta(days=1)
        self.template = make_shift_template(self.org, 'Wieczorna', weekdays=[self.tomorrow.weekday()], max_slots=2)

    def shortage_items(self, user):
        self.login(user)
        data = self.client.get('/api/notifications/').data
        return data, [item for item in data['items'] if item['type'] == 'shortage']

    def test_manager_sees_proposals_and_tomorrow_shortage(self):
        make_workday(self.employee, future_date(3), status=WorkDay.Status.PROPOSED)

        data, shortages = self.shortage_items(self.manager)

        self.assertEqual(shortages[0]['message'], 'Jutro brakuje 2 osób na zmianę: wieczorna.')
        self.assertEqual(data['total'], 3)  # 1 proposal + 2 missing people

    def test_no_shortage_when_shift_is_full(self):
        self.template.max_slots = 1
        self.template.save()
        make_workday(self.employee, self.tomorrow, shift_template=self.template)

        _data, shortages = self.shortage_items(self.manager)

        self.assertEqual(shortages, [])

    def test_employee_sees_own_matters_but_not_shortages(self):
        colleague = make_user(self.org, 'colleague')
        SwapRequest.objects.create(
            work_day=make_workday(colleague, future_date(4)), requested_by=colleague, target_user=self.employee,
        )
        make_workday(self.employee, future_date(5), status=WorkDay.Status.REJECTED)

        data, shortages = self.shortage_items(self.employee)

        self.assertEqual(shortages, [])
        self.assertEqual({item['type'] for item in data['items']}, {'swaps_received', 'rejected_workdays'})
        self.assertEqual(data['total'], 2)


class PayrollPdfTests(ReportTestCase):
    MONTH = '2030-01'

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        template = make_shift_template(cls.org, 'Wieczorna — późna', start=time(16), end=time(22))
        make_workday(cls.employee, date(2030, 1, 10), start=time(16), end=time(22), shift_template=template)

    def test_returns_pdf_with_polish_font(self):
        self.login(self.manager)
        response = self.client.get('/api/stats/payroll.pdf', {'month': self.MONTH})

        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn('wyplaty-2030-01.pdf', response['Content-Disposition'])
        self.assertTrue(response.content.startswith(b'%PDF'))
        self.assertIn(b'DejaVu', response.content)

    def test_month_parameter_is_validated(self):
        self.login(self.manager)
        self.assertEqual(self.client.get('/api/stats/payroll.pdf', {'month': 'styczeń'}).status_code, 400)

    def test_employee_forbidden(self):
        self.login(self.employee)
        self.assertEqual(self.client.get('/api/stats/payroll.pdf', {'month': self.MONTH}).status_code, 403)


class EmailNotificationTests(ReportTestCase):
    """Django's test runner swaps in an in-memory mail backend; sent mail lands in mail.outbox."""

    def setUp(self):
        self.proposal = make_workday(self.employee, future_date(4), status=WorkDay.Status.PROPOSED)
        self.login(self.manager)

    def test_approval_emails_employee(self):
        self.client.post(f'/api/workdays/{self.proposal.id}/approve/', {}, format='json')

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['employee@example.com'])
        self.assertIn('zatwierdzon', mail.outbox[0].subject.lower())

    def test_rejection_email_contains_reason(self):
        self.client.post(f'/api/workdays/{self.proposal.id}/reject/', {'rejection_reason': 'Za dużo osób'})

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Za dużo osób', mail.outbox[0].body)

    def test_swap_request_emails_target(self):
        colleague = make_user(self.org, 'colleague')
        self.login(self.employee)

        self.client.post('/api/swaps/', {
            'work_day': make_workday(self.employee, future_date(6)).id, 'target_user': colleague.id,
        }, format='json')

        self.assertEqual(mail.outbox[0].to, ['colleague@example.com'])
        self.assertIn('zamian', mail.outbox[0].subject.lower())

    def test_no_email_when_user_has_no_address(self):
        self.employee.email = ''
        self.employee.save()

        self.client.post(f'/api/workdays/{self.proposal.id}/approve/', {}, format='json')

        self.assertEqual(mail.outbox, [])
