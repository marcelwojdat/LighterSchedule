"""Schedule entries: declaring, approving, shift slot limits, deadlines, copying and calendar export."""

from datetime import datetime, time, timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import RejectionReasonTemplate, ScheduleSettings, WorkDay
from core.tests.factories import (
    PASSWORD,
    future_date,
    make_organization,
    make_shift_template,
    make_user,
    make_workday,
)
from core.utils import declaration_deadline_passed


def next_weekday(weekday, min_days_ahead=3):
    """First date with the given weekday (0 = Monday) at least min_days_ahead from today."""
    day = timezone.localdate() + timedelta(days=min_days_ahead)
    return day + timedelta(days=(weekday - day.weekday()) % 7)


class ScheduleTestCase(APITestCase):
    """One organization with a manager and two employees."""

    @classmethod
    def setUpTestData(cls):
        cls.org = make_organization()
        cls.manager = make_user(cls.org, 'manager', manager=True, hourly_rate='30')
        cls.employee = make_user(cls.org, 'employee', hourly_rate='20', first_name='Jan', last_name='Kowalski')
        cls.other = make_user(cls.org, 'other', hourly_rate='22')

    def login(self, user):
        self.client.force_authenticate(user)


class EmployeeDeclarationTests(ScheduleTestCase):
    def test_employee_declaration_is_proposed(self):
        self.login(self.employee)
        response = self.client.post('/api/workdays/', {
            'date': future_date(),
            'start_time': '09:00',
            'end_time': '17:00',
            'note': 'Muszę wyjść wcześniej',
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['status'], 'proposed')
        self.assertEqual(response.data['note'], 'Muszę wyjść wcześniej')
        self.assertEqual(response.data['employee'], self.employee.id)

    def test_rate_is_frozen_at_creation(self):
        workday = make_workday(self.employee)
        self.employee.profile.hourly_rate = 99
        self.employee.profile.save()
        workday.save()

        workday.refresh_from_db()
        self.assertEqual(workday.rate_at_time, 20)

    def test_end_before_start_is_rejected(self):
        self.login(self.employee)
        response = self.client.post('/api/workdays/', {
            'date': future_date(), 'start_time': '17:00', 'end_time': '09:00',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('end_time', response.data)

    def test_one_entry_per_employee_per_day(self):
        make_workday(self.employee, future_date(), status=WorkDay.Status.PROPOSED)
        self.login(self.employee)
        response = self.client.post('/api/workdays/', {
            'date': future_date(), 'start_time': '12:00', 'end_time': '20:00',
        }, format='json')

        self.assertEqual(response.status_code, 400)

    def test_employee_sees_only_own_workdays(self):
        make_workday(self.employee, future_date(5))
        make_workday(self.other, future_date(6))
        self.login(self.employee)

        response = self.client.get('/api/workdays/')

        self.assertEqual([row['employee'] for row in response.data], [self.employee.id])

    def test_employee_cannot_edit_or_delete_approved_workday(self):
        workday = make_workday(self.employee)
        self.login(self.employee)

        self.assertEqual(self.client.patch(f'/api/workdays/{workday.id}/', {'note': 'x'}).status_code, 403)
        self.assertEqual(self.client.delete(f'/api/workdays/{workday.id}/').status_code, 403)

    def test_editing_rejected_workday_resubmits_it(self):
        workday = make_workday(self.employee, status=WorkDay.Status.REJECTED, rejection_reason='Za dużo osób')
        self.login(self.employee)

        response = self.client.patch(f'/api/workdays/{workday.id}/', {'note': 'Proszę jeszcze raz'}, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        workday.refresh_from_db()
        self.assertEqual(workday.status, WorkDay.Status.PROPOSED)
        self.assertEqual(workday.rejection_reason, '')


class ShiftTemplateTests(ScheduleTestCase):
    def test_manager_creates_template_with_hours(self):
        self.login(self.manager)
        response = self.client.post('/api/shift-templates/', {
            'name': 'Poranna',
            'hours': [
                {'weekday': 5, 'start_time': '06:00', 'end_time': '14:00'},
                {'weekday': 6, 'start_time': '09:00', 'end_time': '15:00'},
            ],
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual([hours['weekday_label'] for hours in response.data['hours']], ['Sobota', 'Niedziela'])

    def test_template_hours_must_be_valid(self):
        self.login(self.manager)
        duplicate_day = self.client.post('/api/shift-templates/', {
            'name': 'Zła',
            'hours': [
                {'weekday': 1, 'start_time': '06:00', 'end_time': '14:00'},
                {'weekday': 1, 'start_time': '15:00', 'end_time': '20:00'},
            ],
        }, format='json')
        reversed_hours = self.client.post('/api/shift-templates/', {
            'name': 'Zła 2',
            'hours': [{'weekday': 1, 'start_time': '14:00', 'end_time': '06:00'}],
        }, format='json')

        self.assertEqual(duplicate_day.status_code, 400)
        self.assertEqual(reversed_hours.status_code, 400)

    def test_employee_gets_template_hours_even_if_sending_own(self):
        saturday = next_weekday(5)
        template = make_shift_template(self.org, start=time(6), end=time(14), weekdays=[5])
        self.login(self.employee)

        response = self.client.post('/api/workdays/', {
            'date': saturday, 'shift_template': template.id, 'start_time': '05:00', 'end_time': '23:00',
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual((response.data['start_time'], response.data['end_time']), ('06:00:00', '14:00:00'))
        self.assertEqual(response.data['shift_template_name'], 'Poranna')

    def test_employee_must_choose_template_when_organization_has_them(self):
        make_shift_template(self.org)
        self.login(self.employee)

        response = self.client.post('/api/workdays/', {
            'date': future_date(), 'start_time': '09:00', 'end_time': '17:00',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('shift_template', response.data)

    def test_template_unavailable_on_weekday_is_rejected(self):
        template = make_shift_template(self.org, weekdays=[5])
        self.login(self.employee)

        response = self.client.post('/api/workdays/', {
            'date': next_weekday(0), 'shift_template': template.id,
        }, format='json')

        self.assertEqual(response.status_code, 400)

    def test_list_filtered_by_date_resolves_hours(self):
        saturday = next_weekday(5)
        make_shift_template(self.org, 'Poranna', start=time(6), end=time(14), weekdays=[5])
        make_shift_template(self.org, 'Niedzielna', weekdays=[6])
        self.login(self.employee)

        response = self.client.get('/api/shift-templates/', {'date': saturday.isoformat()})

        self.assertEqual([item['name'] for item in response.data], ['Poranna'])
        self.assertEqual(response.data[0]['resolved_start'], '06:00:00')
        self.assertEqual(response.data[0]['slots_remaining'], 1)

    def test_employee_does_not_see_inactive_templates(self):
        template = make_shift_template(self.org, 'Stara')
        template.is_active = False
        template.save()
        self.login(self.employee)

        self.assertEqual(self.client.get('/api/shift-templates/').data, [])


class ShiftSlotLimitTests(ScheduleTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.saturday = next_weekday(5)
        cls.template = make_shift_template(cls.org, 'Poranna', start=time(6), end=time(14), weekdays=[5], max_slots=1)

    def test_manager_cannot_overfill_shift(self):
        self.login(self.manager)
        first = self.client.post('/api/workdays/', {
            'date': self.saturday, 'employee': self.employee.id, 'shift_template': self.template.id,
        }, format='json')
        second = self.client.post('/api/workdays/', {
            'date': self.saturday, 'employee': self.other.id, 'shift_template': self.template.id,
        }, format='json')

        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data['status'], 'approved')
        self.assertEqual(second.status_code, 400)
        self.assertIn('Poranna', str(second.data))

    def test_employee_cannot_propose_for_full_shift(self):
        make_workday(self.other, self.saturday, start=time(6), end=time(14), shift_template=self.template)
        self.login(self.employee)

        response = self.client.post('/api/workdays/', {
            'date': self.saturday, 'shift_template': self.template.id,
        }, format='json')

        self.assertEqual(response.status_code, 400)

    def test_slot_info_lists_holders(self):
        make_workday(self.employee, self.saturday, start=time(6), end=time(14), shift_template=self.template)
        self.login(self.manager)

        slots = self.client.get('/api/workdays/').data[0]['shift_slots']

        self.assertEqual((slots['filled'], slots['max_slots'], slots['is_full']), (1, 1, True))
        self.assertEqual([holder['name'] for holder in slots['holders']], ['Jan Kowalski'])


class ApprovalTests(ScheduleTestCase):
    def test_manager_approves_with_adjusted_hours(self):
        workday = make_workday(self.employee, status=WorkDay.Status.PROPOSED)
        self.login(self.manager)

        response = self.client.post(f'/api/workdays/{workday.id}/approve/', {
            'start_time': '10:00', 'end_time': '18:00', 'note': 'OK',
        }, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        workday.refresh_from_db()
        self.assertEqual(workday.status, WorkDay.Status.APPROVED)
        self.assertEqual(workday.approved_by, self.manager)
        self.assertEqual((workday.start_time, workday.note), (time(10), 'OK'))

    def test_approving_with_note_keeps_custom_hours_of_template_shift(self):
        template = make_shift_template(self.org, start=time(8), end=time(16))
        workday = make_workday(
            self.employee, status=WorkDay.Status.PROPOSED,
            start=time(10), end=time(18), shift_template=template,
        )
        self.login(self.manager)

        self.client.post(f'/api/workdays/{workday.id}/approve/', {'note': 'OK'}, format='json')

        workday.refresh_from_db()
        self.assertEqual((workday.start_time, workday.end_time), (time(10), time(18)))

    def test_failed_approval_rolls_back_manager_edits(self):
        template = make_shift_template(self.org, max_slots=1)
        day = future_date()
        make_workday(self.other, day, shift_template=template)
        proposal = make_workday(self.employee, day, status=WorkDay.Status.PROPOSED, shift_template=template)
        self.login(self.manager)

        response = self.client.post(f'/api/workdays/{proposal.id}/approve/', {
            'start_time': '07:00', 'end_time': '15:00',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        proposal.refresh_from_db()
        self.assertEqual((proposal.status, proposal.start_time), (WorkDay.Status.PROPOSED, time(8)))

    def test_only_proposals_can_be_approved_or_rejected(self):
        workday = make_workday(self.employee)
        self.login(self.manager)

        self.assertEqual(self.client.post(f'/api/workdays/{workday.id}/approve/').status_code, 400)
        self.assertEqual(self.client.post(f'/api/workdays/{workday.id}/reject/').status_code, 400)

    def test_reject_stores_reason_as_quick_pick(self):
        workday = make_workday(self.employee, status=WorkDay.Status.PROPOSED)
        self.login(self.manager)

        response = self.client.post(
            f'/api/workdays/{workday.id}/reject/', {'rejection_reason': 'Nie pasuje do grafiku'}, format='json',
        )

        self.assertEqual(response.data['status'], 'rejected')
        reason = RejectionReasonTemplate.objects.get(text='Nie pasuje do grafiku')
        self.assertEqual(reason.organization, self.org)
        self.assertIsNotNone(reason.last_used_at)

    def test_employee_cannot_approve(self):
        workday = make_workday(self.employee, status=WorkDay.Status.PROPOSED)
        self.login(self.employee)

        self.assertEqual(self.client.post(f'/api/workdays/{workday.id}/approve/').status_code, 403)


class BulkApproveTests(ScheduleTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.first = make_workday(cls.employee, future_date(3), status=WorkDay.Status.PROPOSED)
        cls.second = make_workday(cls.other, future_date(4), status=WorkDay.Status.PROPOSED)

    def test_bulk_approve_selected_ids(self):
        self.login(self.manager)
        response = self.client.post('/api/workdays/bulk-approve/', {'ids': [self.first.id]}, format='json')

        self.assertEqual(response.data['approved'], [self.first.id])
        self.second.refresh_from_db()
        self.assertEqual(self.second.status, WorkDay.Status.PROPOSED)

    def test_bulk_approve_all(self):
        self.login(self.manager)
        response = self.client.post('/api/workdays/bulk-approve/', {'all': True}, format='json')

        self.assertEqual(response.data['approved_count'], 2)

    def test_full_shift_is_skipped_not_failed(self):
        template = make_shift_template(self.org, max_slots=1)
        day = future_date(8)
        make_workday(self.other, day, shift_template=template)
        blocked = make_workday(self.employee, day, status=WorkDay.Status.PROPOSED, shift_template=template)
        self.login(self.manager)

        response = self.client.post('/api/workdays/bulk-approve/', {'ids': [blocked.id]}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['approved_count'], response.data['skipped_count']), (0, 1))

    def test_invalid_payload(self):
        self.login(self.manager)
        self.assertEqual(self.client.post('/api/workdays/bulk-approve/', {}, format='json').status_code, 400)
        self.assertEqual(
            self.client.post('/api/workdays/bulk-approve/', {'ids': ['abc']}, format='json').status_code, 400,
        )

    def test_employee_cannot_bulk_approve(self):
        self.login(self.employee)
        response = self.client.post('/api/workdays/bulk-approve/', {'all': True}, format='json')
        self.assertEqual(response.status_code, 403)


class DeclarationDeadlineRuleTests(SimpleTestCase):
    """The weekly window: open until Saturday 23:59, closed until Monday 00:00."""

    settings_obj = ScheduleSettings(declaration_close_weekday=5, declaration_close_time=time(23, 59))

    def passed_at(self, *args):
        return declaration_deadline_passed(self.settings_obj, now=timezone.make_aware(datetime(*args)))

    def test_open_before_close_day(self):
        self.assertFalse(self.passed_at(2026, 7, 24, 10, 0))   # Friday

    def test_open_until_close_minute_inclusive(self):
        self.assertFalse(self.passed_at(2026, 7, 25, 23, 59))  # Saturday 23:59

    def test_closed_after_close_moment(self):
        self.assertTrue(self.passed_at(2026, 7, 26, 0, 0))     # Sunday 00:00

    def test_opens_again_on_monday(self):
        self.assertFalse(self.passed_at(2026, 7, 27, 0, 0))    # Monday

    def test_no_deadline_never_closes(self):
        self.assertFalse(declaration_deadline_passed(ScheduleSettings()))


class DeclarationDeadlineApiTests(ScheduleTestCase):
    SUNDAY_NOON = timezone.make_aware(datetime(2026, 7, 26, 12, 0))

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        ScheduleSettings.objects.create(organization=cls.org, declaration_close_weekday=5)

    def test_settings_show_label_and_default_time(self):
        self.login(self.manager)
        response = self.client.get('/api/schedule-settings/')

        self.assertEqual(response.data['declaration_close_time'], '23:59:00')
        self.assertEqual(response.data['declaration_close_label'], 'sobota 23:59')

    def test_employee_cannot_change_settings(self):
        self.login(self.employee)
        response = self.client.patch('/api/schedule-settings/', {'declaration_close_weekday': 1}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_employee_blocked_when_window_closed(self):
        self.login(self.employee)
        with patch('core.utils.timezone.localtime', return_value=self.SUNDAY_NOON):
            self.assertTrue(self.client.get('/api/schedule-settings/').data['declarations_closed'])
            response = self.client.post('/api/workdays/', {
                'date': future_date(), 'start_time': '09:00', 'end_time': '17:00',
            }, format='json')

        self.assertEqual(response.status_code, 403)

    def test_manager_can_schedule_when_window_closed(self):
        self.login(self.manager)
        with patch('core.utils.timezone.localtime', return_value=self.SUNDAY_NOON):
            response = self.client.post('/api/workdays/', {
                'date': future_date(), 'employee': self.employee.id, 'start_time': '09:00', 'end_time': '17:00',
            }, format='json')

        self.assertEqual(response.status_code, 201, response.data)


class CopyScheduleTests(ScheduleTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.source_monday = next_weekday(0)
        cls.target_monday = cls.source_monday + timedelta(days=7)
        make_workday(cls.employee, cls.source_monday, start=time(9), end=time(17), note='Z biura')
        make_workday(cls.employee, cls.source_monday + timedelta(days=2), start=time(12), end=time(20))

    def copy_week(self, **extra):
        return self.client.post('/api/workdays/copy/', {
            'mode': 'week',
            'source_start': self.source_monday,
            'target_start': self.target_monday,
            **extra,
        }, format='json')

    def test_employee_copies_week_as_proposals(self):
        self.login(self.employee)
        response = self.copy_week()

        self.assertEqual(response.data['created_count'], 2, response.data)
        copied = WorkDay.objects.get(employee=self.employee, date=self.target_monday)
        self.assertEqual((copied.status, copied.start_time, copied.note), (WorkDay.Status.PROPOSED, time(9), 'Z biura'))

    def test_existing_target_day_is_skipped(self):
        make_workday(self.employee, self.target_monday, start=time(8), end=time(12), status=WorkDay.Status.PROPOSED)
        self.login(self.employee)

        response = self.copy_week()

        self.assertEqual((response.data['created_count'], response.data['skipped_count']), (1, 1))
        self.assertEqual(WorkDay.objects.get(employee=self.employee, date=self.target_monday).start_time, time(8))

    def test_manager_copies_employee_week_as_approved(self):
        self.login(self.manager)
        response = self.copy_week(employee=self.employee.id)

        self.assertEqual(response.status_code, 200, response.data)
        copied = WorkDay.objects.get(employee=self.employee, date=self.target_monday)
        self.assertEqual(copied.status, WorkDay.Status.APPROVED)

    def test_invalid_mode(self):
        self.login(self.employee)
        self.assertEqual(self.copy_week(mode='year').status_code, 400)


class CalendarExportTests(ScheduleTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.template = make_shift_template(cls.org, 'Poranna', start=time(6), end=time(14))
        cls.workday = make_workday(
            cls.employee, future_date(3), start=time(6), end=time(14),
            shift_template=cls.template, note='Wyjdę o 13:00',
        )

    def test_requires_login_or_token(self):
        self.assertEqual(self.client.get('/api/workdays/export.ics/').status_code, 401)

    def test_export_contains_approved_shift(self):
        self.login(self.employee)
        response = self.client.get('/api/workdays/export.ics/')

        self.assertIn('text/calendar', response['Content-Type'])
        body = response.content.decode()
        self.assertIn('SUMMARY:Zmiana Poranna', body)
        self.assertIn('Notatka: Wyjdę o 13:00', body)
        self.assertIn(f'UID:workday-{self.workday.id}@prostygrafik.pl', body)

    def test_export_skips_proposals_and_past_days(self):
        make_workday(self.employee, timezone.localdate() - timedelta(days=2))
        make_workday(self.employee, future_date(4), status=WorkDay.Status.PROPOSED)
        self.login(self.employee)

        body = self.client.get('/api/workdays/export.ics/').content.decode()

        self.assertEqual(body.count('BEGIN:VEVENT'), 1)

    def test_signed_token_works_without_login(self):
        self.login(self.employee)
        feed = self.client.get('/api/workdays/calendar-feed/').data
        self.assertTrue(feed['webcal_url'].startswith('webcal://'))

        self.client.force_authenticate(None)
        response = self.client.get('/api/workdays/export.ics/', {'token': feed['token']})

        self.assertEqual(response.status_code, 200)
        self.assertIn('SUMMARY:Zmiana Poranna', response.content.decode())

    def test_month_filter(self):
        self.login(self.employee)
        response = self.client.get('/api/workdays/export.ics/', {'month': self.workday.date.strftime('%Y-%m')})
        self.assertIn('SUMMARY:Zmiana Poranna', response.content.decode())
        self.assertEqual(self.client.get('/api/workdays/export.ics/', {'month': 'zly'}).status_code, 400)


class RejectionReasonTests(APITestCase):
    def setUp(self):
        self.client.post('/api/register/', {
            'username': 'kierownik', 'password': PASSWORD, 'first_name': 'Jan', 'last_name': 'Nowak',
            'email': 'k@example.com', 'organization_name': 'Firma',
        }, format='json')
        self.manager = User.objects.get(username='kierownik')

    def test_new_organization_gets_default_reasons(self):
        self.client.force_authenticate(self.manager)
        texts = [item['text'] for item in self.client.get('/api/rejection-reasons/').data]
        self.assertEqual(texts[:2], ['Za dużo osób', 'Inna zmiana'])

    def test_manager_creates_reason_with_trimmed_text(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/rejection-reasons/', {'text': '  Zmiana obsadzona  '}, format='json')
        self.assertEqual(response.data['text'], 'Zmiana obsadzona')

    def test_employee_cannot_list_reasons(self):
        employee = make_user(self.manager.profile.organization, 'pracownik')
        self.client.force_authenticate(employee)
        self.assertEqual(self.client.get('/api/rejection-reasons/').status_code, 403)
