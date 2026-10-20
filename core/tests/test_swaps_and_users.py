"""Shift swaps between employees, and account management by managers."""

from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.core import mail
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import SwapRequest, WorkDay
from core.tests.factories import (
    PASSWORD,
    future_date,
    make_organization,
    make_shift_template,
    make_user,
    make_workday,
)


class SwapTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = make_organization()
        cls.manager = make_user(cls.org, 'manager', manager=True)
        cls.requester = make_user(cls.org, 'requester', hourly_rate='20')
        cls.colleague = make_user(cls.org, 'colleague', hourly_rate='25')

    def setUp(self):
        self.workday = make_workday(self.requester, future_date(7))

    def login(self, user):
        self.client.force_authenticate(user)

    def request_swap(self, **payload):
        self.login(self.requester)
        payload.setdefault('work_day', self.workday.id)
        payload.setdefault('target_user', self.colleague.id)
        return self.client.post('/api/swaps/', payload, format='json')

    def accept_and_approve(self, swap_id):
        self.login(self.colleague)
        self.client.post(f'/api/swaps/{swap_id}/accept/')
        self.login(self.manager)
        return self.client.post(f'/api/swaps/{swap_id}/approve/')


class SwapFlowTests(SwapTestCase):
    def test_one_way_swap_hands_over_shift_with_new_rate(self):
        swap = self.request_swap()
        self.assertEqual(swap.data['status'], 'pending_target')

        response = self.accept_and_approve(swap.data['id'])

        self.assertEqual(response.data['status'], 'approved')
        self.workday.refresh_from_db()
        self.assertEqual(self.workday.employee, self.colleague)
        self.assertEqual(self.workday.rate_at_time, Decimal('25'))

    def test_two_way_swap_exchanges_employees(self):
        colleague_day = make_workday(self.colleague, future_date(9), start=time(10), end=time(18))
        swap = self.request_swap(target_work_day=colleague_day.id)
        self.assertTrue(swap.data['is_two_way'])

        self.accept_and_approve(swap.data['id'])

        self.workday.refresh_from_db()
        colleague_day.refresh_from_db()
        self.assertEqual((self.workday.employee, colleague_day.employee), (self.colleague, self.requester))
        self.assertEqual((self.workday.rate_at_time, colleague_day.rate_at_time), (Decimal('25'), Decimal('20')))

    def test_same_day_swap_exchanges_shift_details_including_template(self):
        day = self.workday.date
        morning = make_shift_template(self.org, 'Poranna', start=time(6), end=time(14), max_slots=2)
        evening = make_shift_template(self.org, 'Wieczorna', start=time(14), end=time(22), max_slots=2)
        WorkDay.objects.filter(pk=self.workday.pk).update(shift_template=morning, start_time=time(6), end_time=time(14))
        colleague_day = make_workday(self.colleague, day, start=time(14), end=time(22), shift_template=evening)

        swap = self.request_swap(target_work_day=colleague_day.id)
        self.accept_and_approve(swap.data['id'])

        self.workday.refresh_from_db()
        self.assertEqual(self.workday.employee, self.requester)
        self.assertEqual((self.workday.shift_template, self.workday.start_time), (evening, time(14)))

    def test_managers_are_emailed_only_within_organization(self):
        make_user(make_organization('Inna firma'), 'foreign_manager', manager=True)
        swap = self.request_swap()
        mail.outbox.clear()

        self.login(self.colleague)
        self.client.post(f'/api/swaps/{swap.data["id"]}/accept/')

        recipients = {address for message in mail.outbox for address in message.to}
        self.assertEqual(recipients, {'requester@example.com', 'manager@example.com'})


class SwapValidationTests(SwapTestCase):
    def assert_rejected(self, response, field):
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn(field, response.data)

    def test_cannot_give_away_someone_elses_shift(self):
        foreign_day = make_workday(self.colleague, future_date(8))
        self.assert_rejected(self.request_swap(work_day=foreign_day.id, target_user=self.manager.id), 'work_day')

    def test_only_future_approved_shifts_can_be_swapped(self):
        proposal = make_workday(self.requester, future_date(8), status=WorkDay.Status.PROPOSED)
        past = make_workday(self.requester, timezone.localdate() - timedelta(days=1))

        self.assert_rejected(self.request_swap(work_day=proposal.id), 'work_day')
        self.assert_rejected(self.request_swap(work_day=past.id), 'work_day')

    def test_invalid_targets(self):
        self.assert_rejected(self.request_swap(target_user=self.requester.id), 'target_user')
        self.assert_rejected(self.request_swap(target_user=self.manager.id), 'target_user')

    def test_one_way_swap_rejected_when_colleague_already_works_that_day(self):
        make_workday(self.colleague, self.workday.date)
        self.assert_rejected(self.request_swap(), 'target_user')

    def test_only_one_active_request_per_shift(self):
        self.request_swap()
        self.assert_rejected(self.request_swap(), 'work_day')

    def test_target_work_day_must_belong_to_target_user(self):
        other_day = make_workday(make_user(self.org, 'third'), future_date(9))
        self.assert_rejected(self.request_swap(target_work_day=other_day.id), 'target_work_day')

    def test_manager_cannot_request_swap(self):
        self.login(self.manager)
        response = self.client.post('/api/swaps/', {
            'work_day': self.workday.id, 'target_user': self.colleague.id,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        
    def test_rejected_request_does_not_block_new_one(self):
        first = self.request_swap()
        self.login(self.requester)
        self.client.post(f'/api/swaps/{first.data["id"]}/reject/')

        second = self.request_swap()
        self.assertEqual(second.status_code, 201)


class SwapPermissionTests(SwapTestCase):
    def setUp(self):
        super().setUp()
        self.swap_id = self.request_swap().data['id']

    def test_only_target_can_accept(self):
        self.login(self.requester)
        self.assertEqual(self.client.post(f'/api/swaps/{self.swap_id}/accept/').status_code, 403)

    def test_requester_can_withdraw_before_acceptance(self):
        self.login(self.requester)
        response = self.client.post(f'/api/swaps/{self.swap_id}/reject/')
        self.assertEqual(response.data['status'], 'rejected')

    def test_after_acceptance_only_manager_can_reject(self):
        self.login(self.colleague)
        self.client.post(f'/api/swaps/{self.swap_id}/accept/')

        self.login(self.requester)
        self.assertEqual(self.client.post(f'/api/swaps/{self.swap_id}/reject/').status_code, 403)

        self.login(self.manager)
        response = self.client.post(f'/api/swaps/{self.swap_id}/reject/', {'rejection_reason': 'Brak zgody'})
        self.assertEqual(response.data['status'], 'rejected')
        self.assertEqual(self.org.rejection_reasons.get().text, 'Brak zgody')

    def test_manager_cannot_approve_before_acceptance(self):
        self.login(self.manager)
        self.assertEqual(self.client.post(f'/api/swaps/{self.swap_id}/approve/').status_code, 400)

    def test_approval_rechecks_schedule_conflicts(self):
        self.login(self.colleague)
        self.client.post(f'/api/swaps/{self.swap_id}/accept/')
        make_workday(self.colleague, self.workday.date)  # colleague got a shift that day meanwhile

        self.login(self.manager)
        response = self.client.post(f'/api/swaps/{self.swap_id}/approve/')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(SwapRequest.objects.get(pk=self.swap_id).approved_by_manager)

    def test_uninvolved_employee_does_not_see_swap(self):
        self.login(make_user(self.org, 'outsider'))
        self.assertEqual(self.client.get('/api/swaps/').data, [])

    def test_swappable_workdays_lists_colleague_future_approved_days(self):
        colleague_day = make_workday(self.colleague, future_date(12))
        make_workday(self.colleague, future_date(13), status=WorkDay.Status.PROPOSED)
        self.login(self.requester)

        response = self.client.get(f'/api/users/{self.colleague.id}/swappable-workdays/')

        self.assertEqual([row['id'] for row in response.data], [colleague_day.id])


class AccountTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = make_user(make_organization(), 'jan', hourly_rate='20', first_name='Jan', last_name='Kowalski')

    def setUp(self):
        self.client.force_authenticate(self.user)

    def test_me_returns_profile_fields(self):
        data = self.client.get('/api/me/').data
        self.assertEqual((data['username'], data['is_manager'], data['hourly_rate']), ('jan', False, '20.00'))

    def test_user_updates_own_profile(self):
        response = self.client.patch('/api/me/', {'first_name': 'Adam', 'email': 'adam@example.com'}, format='json')
        self.assertEqual((response.data['first_name'], response.data['email']), ('Adam', 'adam@example.com'))

    def test_change_password(self):
        response = self.client.post('/api/me/change-password/', {
            'current_password': PASSWORD, 'new_password': 'Nowe#Haslo2026',
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Nowe#Haslo2026'))

    def test_change_password_rejects_wrong_current_or_weak_new(self):
        wrong = self.client.post('/api/me/change-password/', {
            'current_password': 'zle', 'new_password': 'Nowe#Haslo2026',
        }, format='json')
        weak = self.client.post('/api/me/change-password/', {
            'current_password': PASSWORD, 'new_password': '12345678',
        }, format='json')

        self.assertEqual((wrong.status_code, weak.status_code), (400, 400))


class UserManagementTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = make_organization()
        cls.manager = make_user(cls.org, 'manager', manager=True)
        cls.employee = make_user(cls.org, 'employee', hourly_rate='20')

    def setUp(self):
        self.client.force_authenticate(self.manager)

    def new_user_payload(self, **extra):
        return {
            'username': 'nowy', 'password': PASSWORD, 'first_name': 'Ola',
            'last_name': 'Nowak', 'email': 'ola@example.com', **extra,
        }

    def test_manager_creates_employee_and_manager(self):
        employee = self.client.post('/api/users/', self.new_user_payload(hourly_rate='25.50'), format='json')
        manager = self.client.post('/api/users/', self.new_user_payload(
            username='kierownik2', email='k2@example.com', is_manager=True,
        ), format='json')

        self.assertEqual((employee.status_code, manager.status_code), (201, 201))
        self.assertEqual(User.objects.get(username='nowy').profile.hourly_rate, Decimal('25.50'))
        self.assertTrue(User.objects.get(username='kierownik2').profile.is_manager)

    def test_new_user_validation(self):
        duplicate_email = self.client.post('/api/users/', self.new_user_payload(email='employee@example.com'))
        weak_password = self.client.post('/api/users/', self.new_user_payload(password='12345678'))

        self.assertIn('email', duplicate_email.data)
        self.assertIn('password', weak_password.data)

    def test_employee_cannot_manage_users(self):
        self.client.force_authenticate(self.employee)
        self.assertEqual(self.client.post('/api/users/', self.new_user_payload()).status_code, 403)
        self.assertEqual(self.client.delete(f'/api/users/{self.manager.id}/').status_code, 403)
        self.assertEqual(
            self.client.patch(f'/api/users/{self.employee.id}/profile/', {'hourly_rate': '99'}).status_code, 403,
        )

    def test_manager_updates_profile(self):
        response = self.client.patch(f'/api/users/{self.employee.id}/profile/', {
            'is_manager': True, 'hourly_rate': '33',
        }, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        self.employee.profile.refresh_from_db()
        self.assertEqual((self.employee.profile.is_manager, self.employee.profile.hourly_rate), (True, Decimal('33')))

    def test_profile_update_validates_input(self):
        url = f'/api/users/{self.employee.id}/profile/'
        self.assertEqual(self.client.patch(url, {}, format='json').status_code, 400)
        self.assertIn('hourly_rate', self.client.patch(url, {'hourly_rate': 'abc'}, format='json').data)
        self.assertIn('hourly_rate', self.client.patch(url, {'hourly_rate': '-5'}, format='json').data)

    def test_manager_cannot_demote_or_deactivate_self(self):
        url = f'/api/users/{self.manager.id}/profile/'
        self.assertEqual(self.client.patch(url, {'is_manager': False}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'is_active': False}, format='json').status_code, 400)
        self.assertEqual(self.client.delete(f'/api/users/{self.manager.id}/').status_code, 400)

    def test_delete_deactivates_by_default(self):
        response = self.client.delete(f'/api/users/{self.employee.id}/')

        self.assertEqual(response.status_code, 200)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_active)

    def test_permanent_delete_only_without_history(self):
        make_workday(self.employee)
        blocked = self.client.delete(f'/api/users/{self.employee.id}/?permanent=true')
        self.assertEqual(blocked.status_code, 400)
        self.assertFalse(blocked.data['can_hard_delete'])

        fresh = make_user(self.org, 'fresh')
        self.assertEqual(self.client.delete(f'/api/users/{fresh.id}/?permanent=true').status_code, 200)
        self.assertFalse(User.objects.filter(pk=fresh.pk).exists())

    def test_deactivated_user_cannot_log_in(self):
        self.client.delete(f'/api/users/{self.employee.id}/')
        response = self.client.post('/api/token/', {'username': 'employee', 'password': PASSWORD})
        self.assertEqual(response.status_code, 401)
