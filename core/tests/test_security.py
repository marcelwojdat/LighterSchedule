"""Hardening: private fields, brute-force limits, session revocation, calendar links, input validation."""

from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APITestCase

from core.invites import make_set_password_link
from core.models import WorkDay
from core.tests.factories import PASSWORD, future_date, make_organization, make_user, make_workday
from core.throttling import MAX_FAILED_LOGINS
from core.views.accounts import INVALID_LINK_MESSAGE

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

    def test_changing_letter_case_does_not_bypass_lockout(self):
        for attempt in range(MAX_FAILED_LOGINS):
            self.obtain_tokens('EMPLOYEE' if attempt % 2 else 'employee', 'zle-haslo')

        self.assertEqual(self.obtain_tokens('Employee').status_code, 429)


class UsernameCaseTests(SecurityTestCase):
    """Logins are stored lowercase, so one person can't end up with two accounts."""

    REGISTRATION = {
        'password': 'Bardzo-Trudne-77', 'first_name': 'Jan', 'last_name': 'Kowalski',
        'organization_name': 'Firma',
    }

    def register(self, username, email):
        payload = {**self.REGISTRATION, 'username': username, 'email': email}
        return self.client.post('/api/register/', payload, format='json')

    def test_registration_stores_trimmed_lowercase_login(self):
        self.assertEqual(self.register('  JanK ', 'jan@example.com').status_code, 201)

        self.assertTrue(User.objects.filter(username='jank').exists())

    def test_login_differing_only_by_case_is_taken(self):
        self.register('jank', 'jan@example.com')

        response = self.register('JANK', 'inny@example.com')

        self.assertEqual(response.status_code, 400)
        self.assertIn('username', response.data)

    def test_manager_created_account_gets_lowercase_login(self):
        self.client.force_authenticate(self.manager)

        response = self.client.post('/api/users/', {
            'username': 'Nowa.Osoba', 'password': 'Bardzo-Trudne-77', 'first_name': 'Nowa',
            'last_name': 'Osoba', 'email': 'nowa@example.com',
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['username'], 'nowa.osoba')

    def test_login_ignores_letter_case(self):
        self.assertEqual(self.obtain_tokens('EMPLOYEE').status_code, 200)

    def test_older_mixed_case_account_still_signs_in(self):
        make_user(self.org, 'Legacy')

        for typed in ('Legacy', 'legacy', 'LEGACY'):
            self.assertEqual(self.obtain_tokens(typed).status_code, 200, typed)

    def test_wrong_password_fails_whatever_the_case(self):
        self.assertEqual(self.obtain_tokens('EMPLOYEE', 'zle-haslo').status_code, 401)


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


class SetPasswordLinkTests(SecurityTestCase):
    """One-time set-password links (invites for accounts created by a manager)."""

    def setUp(self):
        super().setUp()
        self.invited = make_user(self.org, 'invited')
        self.invited.set_unusable_password()
        self.invited.save(update_fields=['password'])

    def link_parts(self, user):
        uid, token = make_set_password_link(user).rsplit('/', 2)[-2:]
        return uid, token

    def set_password(self, uid, token, password=NEW_PASSWORD):
        return self.client.post('/api/set-password/', {'uid': uid, 'token': token, 'password': password}, format='json')

    def test_link_points_to_the_frontend(self):
        with self.settings(FRONTEND_URL='https://prostygrafik.com'):
            link = make_set_password_link(self.invited)

        self.assertTrue(link.startswith('https://prostygrafik.com/set-password/'))

    def test_account_without_password_cannot_sign_in(self):
        self.assertEqual(self.obtain_tokens('invited').status_code, 401)

    def test_link_sets_the_password_once(self):
        uid, token = self.link_parts(self.invited)

        response = self.set_password(uid, token)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'invited')
        self.assertEqual(self.obtain_tokens('invited', NEW_PASSWORD).status_code, 200)
        # The new password hash invalidates the same link.
        reuse = self.set_password(uid, token, 'Jeszcze#Inne3')
        self.assertEqual(reuse.status_code, 400)
        self.assertEqual(reuse.data['error'], INVALID_LINK_MESSAGE)

    def test_expired_link_is_rejected(self):
        uid, token = self.link_parts(self.invited)

        with self.settings(PASSWORD_RESET_TIMEOUT=-1):
            response = self.set_password(uid, token)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error'], INVALID_LINK_MESSAGE)

    def test_forged_or_malformed_link_is_rejected(self):
        uid, token = self.link_parts(self.invited)
        other_uid, _ = self.link_parts(self.colleague)

        for bad_uid, bad_token in [(uid, 'abc-123'), (other_uid, token), ('!!!', token), (['x'], token), (uid, None)]:
            with self.subTest(uid=bad_uid, token=bad_token):
                self.assertEqual(self.set_password(bad_uid, bad_token).status_code, 400)
        self.assertFalse(User.objects.get(pk=self.invited.pk).has_usable_password())

    def test_deactivated_account_link_is_rejected(self):
        uid, token = self.link_parts(self.invited)
        self.invited.is_active = False
        self.invited.save(update_fields=['is_active'])

        self.assertEqual(self.set_password(uid, token).status_code, 400)

    def test_weak_password_is_rejected_and_link_still_works(self):
        uid, token = self.link_parts(self.invited)

        weak = self.set_password(uid, token, 'invited')

        self.assertEqual(weak.status_code, 400)
        self.assertNotEqual(weak.data['error'], INVALID_LINK_MESSAGE)
        self.assertEqual(self.set_password(uid, token).status_code, 200)

    def test_setting_password_signs_out_existing_sessions(self):
        refresh = self.obtain_tokens('employee').data['refresh']
        uid, token = self.link_parts(self.employee)

        self.assertEqual(self.set_password(uid, token).status_code, 200)

        self.assertEqual(self.client.post('/api/token/refresh/', {'refresh': refresh}, format='json').status_code, 401)

    def test_guessing_links_is_rate_limited(self):
        uid, _ = self.link_parts(self.invited)

        statuses = [self.set_password(uid, f'guess-{n}').status_code for n in range(11)]

        self.assertEqual(statuses[:10], [400] * 10)
        self.assertEqual(statuses[10], 429)
