"""Hardening: private fields, brute-force limits, session revocation, calendar links, input validation."""

from django.core.cache import cache
from rest_framework.test import APITestCase

from core.models import WorkDay
from core.tests.factories import PASSWORD, future_date, make_organization, make_user, make_workday
from core.throttling import MAX_FAILED_LOGINS

NEW_PASSWORD = 'Inne#Haslo2025'


class SecurityTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = make_organization()
        cls.manager = make_user(cls.org, 'manager', manager=True, hourly_rate='40')
        cls.employee = make_user(cls.org, 'employee', hourly_rate='25')
        cls.colleague = make_user(cls.org, 'colleague', hourly_rate='31')

    def setUp(self):
        cache.clear()  # throttle and lockout counters must not leak between tests

    def obtain_tokens(self, username, password=PASSWORD):
        return self.client.post('/api/token/', {'username': username, 'password': password}, format='json')


class PrivateFieldsTests(SecurityTestCase):
    def test_employee_sees_colleagues_without_pay_and_email(self):
        self.client.force_authenticate(self.employee)

        rows = {row['username']: row for row in self.client.get('/api/users/').data}

        self.assertNotIn('hourly_rate', rows['colleague'])
        self.assertNotIn('email', rows['colleague'])
        self.assertEqual(rows['employee']['hourly_rate'], '25.00')

    def test_manager_sees_pay_of_everyone(self):
        self.client.force_authenticate(self.manager)

        rows = {row['username']: row for row in self.client.get('/api/users/').data}

        self.assertEqual(rows['colleague']['hourly_rate'], '31.00')

    def test_colleague_workdays_for_swaps_hide_pay_and_notes(self):
        make_workday(self.colleague, future_date(4), note='Prywatna notatka', rate_at_time='31')
        self.client.force_authenticate(self.employee)

        rows = self.client.get(f'/api/users/{self.colleague.id}/swappable-workdays/').data

        self.assertEqual(len(rows), 1)
        for field in ('rate_at_time', 'earnings', 'note', 'rejection_reason'):
            self.assertNotIn(field, rows[0])

    def test_email_already_used_by_another_account_is_rejected(self):
        self.client.force_authenticate(self.employee)

        response = self.client.patch('/api/me/', {'email': self.colleague.email.upper()}, format='json')

        self.assertEqual(response.status_code, 400)

    def test_registration_rejects_password_similar_to_login(self):
        response = self.client.post('/api/register/', {
            'username': 'kowalski.jan', 'password': 'kowalski.jan1', 'first_name': 'Jan',
            'last_name': 'Kowalski', 'email': 'jan@example.com', 'organization_name': 'Firma',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('password', response.data)


class BruteForceTests(SecurityTestCase):
    def test_account_locks_after_repeated_failed_logins(self):
        for _attempt in range(MAX_FAILED_LOGINS):
            self.assertEqual(self.obtain_tokens('employee', 'zle-haslo').status_code, 401)

        # Even the right password is refused while the account is locked.
        self.assertEqual(self.obtain_tokens('employee').status_code, 429)

    def test_successful_login_resets_failed_attempts(self):
        for _attempt in range(MAX_FAILED_LOGINS - 1):
            self.obtain_tokens('employee', 'zle-haslo')
        self.assertEqual(self.obtain_tokens('employee').status_code, 200)

        self.assertEqual(self.obtain_tokens('employee', 'zle-haslo').status_code, 401)
        self.assertEqual(self.obtain_tokens('employee').status_code, 200)

    def test_lockout_is_per_account(self):
        for _attempt in range(MAX_FAILED_LOGINS):
            self.obtain_tokens('employee', 'zle-haslo')

        self.assertEqual(self.obtain_tokens('colleague').status_code, 200)


class SessionRevocationTests(SecurityTestCase):
    def test_used_refresh_token_cannot_be_reused(self):
        refresh = self.obtain_tokens('employee').data['refresh']

        first = self.client.post('/api/token/refresh/', {'refresh': refresh}, format='json')
        replay = self.client.post('/api/token/refresh/', {'refresh': refresh}, format='json')

        self.assertEqual(first.status_code, 200)
        self.assertIn('refresh', first.data)
        self.assertEqual(replay.status_code, 401)

    def test_logout_revokes_refresh_token(self):
        refresh = self.obtain_tokens('employee').data['refresh']

        self.assertEqual(self.client.post('/api/token/blacklist/', {'refresh': refresh}, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/token/refresh/', {'refresh': refresh}, format='json').status_code, 401)

    def test_password_change_signs_out_other_sessions(self):
        other_device = self.obtain_tokens('employee').data
        this_device = self.obtain_tokens('employee').data
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {this_device["access"]}')

        response = self.client.post('/api/me/change-password/', {
            'current_password': PASSWORD, 'new_password': NEW_PASSWORD,
        }, format='json')
        self.assertEqual(response.status_code, 200)

        # The old tokens of every device stop working at once ...
        self.assertEqual(self.client.get('/api/me/').status_code, 401)
        self.client.credentials()
        self.assertEqual(
            self.client.post('/api/token/refresh/', {'refresh': other_device['refresh']}, format='json').status_code,
            401,
        )
        # ... and this device continues with the pair from the response.
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.data["access"]}')
        self.assertEqual(self.client.get('/api/me/').status_code, 200)

    def test_deactivated_account_cannot_refresh(self):
        user = make_user(self.org, 'leaving')
        refresh = self.obtain_tokens('leaving').data['refresh']
        user.is_active = False
        user.save(update_fields=['is_active'])

        self.assertEqual(self.client.post('/api/token/refresh/', {'refresh': refresh}, format='json').status_code, 401)


class CalendarFeedTests(SecurityTestCase):
    def feed_token(self, user):
        self.client.force_authenticate(user)
        token = self.client.get('/api/workdays/calendar-feed/').data['token']
        self.client.force_authenticate(None)
        return token

    def export(self, token):
        return self.client.get('/api/workdays/export.ics/', {'token': token})

    def test_feed_link_works_until_password_changes(self):
        user = make_user(self.org, 'calendar_user')
        token = self.feed_token(user)
        self.assertEqual(self.export(token).status_code, 200)

        user.set_password(NEW_PASSWORD)
        user.save()

        self.assertEqual(self.export(token).status_code, 401)

    def test_feed_link_stops_for_deactivated_account(self):
        user = make_user(self.org, 'calendar_leaver')
        token = self.feed_token(user)
        user.is_active = False
        user.save(update_fields=['is_active'])

        self.assertEqual(self.export(token).status_code, 401)

    def test_forged_token_is_rejected(self):
        token = self.feed_token(self.employee)
        forged = f'{self.manager.id}:{token.partition(":")[2]}'

        self.assertEqual(self.export(forged).status_code, 401)
        self.assertEqual(self.export('nie-token').status_code, 401)


class InputValidationTests(SecurityTestCase):
    def test_malformed_workday_filters_are_bad_requests(self):
        self.client.force_authenticate(self.manager)

        for params in ({'date_from': 'wczoraj'}, {'date_to': '2026-02-30'}, {'employee': 'x'}, {'status': 'hacked'}):
            with self.subTest(params=params):
                self.assertEqual(self.client.get('/api/workdays/', params).status_code, 400)

    def test_overlong_or_non_text_rejection_reason_is_handled(self):
        workday = make_workday(self.employee, future_date(6), status=WorkDay.Status.PROPOSED)
        other = make_workday(self.colleague, future_date(6), status=WorkDay.Status.PROPOSED)
        self.client.force_authenticate(self.manager)

        long_reason = self.client.post(f'/api/workdays/{workday.id}/reject/', {'rejection_reason': 'x' * 1000}, format='json')
        number_reason = self.client.post(f'/api/workdays/{other.id}/reject/', {'rejection_reason': 123}, format='json')

        self.assertEqual(long_reason.status_code, 200)
        self.assertEqual(len(long_reason.data['rejection_reason']), 255)
        self.assertEqual(number_reason.status_code, 200)

    def test_password_change_rejects_non_text_values(self):
        self.client.force_authenticate(self.employee)

        response = self.client.post('/api/me/change-password/', {
            'current_password': [PASSWORD], 'new_password': NEW_PASSWORD,
        }, format='json')

        self.assertEqual(response.status_code, 400)
