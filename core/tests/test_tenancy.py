"""
Organization isolation: a user must never see or modify data of another organization.

Objects of other organizations behave as if they did not exist (404 / "not found").
"""

from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import EmployeeProfile, Organization, ScheduleSettings, TaskType, WorkDay
from core.tests.factories import (
    PASSWORD,
    future_date,
    make_organization,
    make_shift_template,
    make_task_type,
    make_user,
    make_workday,
)


class RegistrationTests(APITestCase):
    payload = {
        'username': 'nowy_kierownik',
        'password': PASSWORD,
        'first_name': 'Jan',
        'last_name': 'Kowalski',
        'email': 'jan@example.com',
        'organization_name': 'Piekarnia',
    }

    def test_register_creates_organization_with_manager_and_defaults(self):
        response = self.client.post('/api/register/', self.payload, format='json')

        self.assertEqual(response.status_code, 201)
        profile = EmployeeProfile.objects.get(user__username='nowy_kierownik')
        self.assertTrue(profile.is_manager)
        self.assertEqual(profile.organization.name, 'Piekarnia')
        self.assertTrue(ScheduleSettings.objects.filter(organization=profile.organization).exists())
        self.assertEqual(
            set(TaskType.objects.filter(organization=profile.organization).values_list('name', flat=True)),
            {'Kasa', 'Magazyn', 'Obsługa'},
        )

    def test_each_registration_creates_separate_organization(self):
        self.client.post('/api/register/', self.payload, format='json')
        second = {**self.payload, 'username': 'drugi', 'email': 'drugi@example.com', 'organization_name': 'Kwiaciarnia'}
        self.client.post('/api/register/', second, format='json')

        self.assertEqual(Organization.objects.count(), 2)

    def test_invalid_registration_creates_nothing(self):
        response = self.client.post('/api/register/', {**self.payload, 'organization_name': ''}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('organization_name', response.data)
        self.assertFalse(User.objects.exists())
        self.assertFalse(Organization.objects.exists())

    def test_register_rejects_duplicate_username(self):
        self.client.post('/api/register/', self.payload, format='json')
        response = self.client.post('/api/register/', {**self.payload, 'email': 'inny@example.com'}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('username', response.data)


class OrganizationIsolationTests(APITestCase):
    """Two companies, X and Y. Everything is checked from Y's perspective against X's data."""

    @classmethod
    def setUpTestData(cls):
        cls.org_x = make_organization('Firma X')
        cls.org_y = make_organization('Firma Y')
        cls.manager_x = make_user(cls.org_x, 'manager_x', manager=True)
        cls.employee_x = make_user(cls.org_x, 'employee_x')
        cls.manager_y = make_user(cls.org_y, 'manager_y', manager=True)
        cls.employee_y = make_user(cls.org_y, 'employee_y')

        cls.task_type_x = make_task_type(cls.org_x, 'Kasa')
        cls.template_x = make_shift_template(cls.org_x, 'Poranna')
        cls.workday_x = make_workday(cls.employee_x, future_date(10), shift_template=cls.template_x)

    def login(self, user):
        self.client.force_authenticate(user)

    # --- Reading ---------------------------------------------------------

    def test_user_list_contains_only_own_organization(self):
        self.login(self.manager_y)
        usernames = {user['username'] for user in self.client.get('/api/users/').data}
        self.assertEqual(usernames, {'manager_y', 'employee_y'})

    def test_cannot_retrieve_user_from_other_organization(self):
        self.login(self.manager_y)
        response = self.client.get(f'/api/users/{self.employee_x.id}/')
        self.assertEqual(response.status_code, 404)

    def test_workdays_of_other_organization_are_invisible(self):
        self.login(self.manager_y)
        self.assertEqual(self.client.get('/api/workdays/').data, [])
        self.assertEqual(self.client.get(f'/api/workdays/{self.workday_x.id}/').status_code, 404)

    def test_configuration_lists_are_scoped(self):
        self.login(self.manager_y)
        self.assertEqual(self.client.get('/api/task-types/').data, [])
        self.assertEqual(self.client.get('/api/shift-templates/').data, [])
        self.assertEqual(self.client.get('/api/rejection-reasons/').data, [])

    # --- Writing ---------------------------------------------------------

    def test_cannot_modify_or_delete_objects_of_other_organization(self):
        self.login(self.manager_y)
        self.assertEqual(self.client.patch(f'/api/task-types/{self.task_type_x.id}/', {'name': 'X'}).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/shift-templates/{self.template_x.id}/').status_code, 404)
        self.assertEqual(self.client.post(f'/api/workdays/{self.workday_x.id}/reject/').status_code, 404)
        self.assertEqual(self.client.delete(f'/api/users/{self.employee_x.id}/').status_code, 404)

    def test_cannot_schedule_employee_from_other_organization(self):
        self.login(self.manager_y)
        response = self.client.post('/api/workdays/', {
            'employee': self.employee_x.id,
            'date': future_date(20),
            'start_time': '08:00',
            'end_time': '16:00',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('employee', response.data)

    def test_cannot_use_role_or_template_from_other_organization(self):
        self.login(self.manager_y)
        response = self.client.post('/api/workdays/', {
            'employee': self.employee_y.id,
            'date': future_date(20),
            'role': self.task_type_x.id,
            'shift_template': self.template_x.id,
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('role', response.data)
        self.assertIn('shift_template', response.data)

    def test_organization_in_payload_is_ignored_on_create(self):
        self.login(self.manager_y)
        response = self.client.post('/api/task-types/', {'name': 'Nowy', 'organization': self.org_x.id}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(TaskType.objects.get(pk=response.data['id']).organization, self.org_y)

    def test_new_employee_joins_manager_organization(self):
        self.login(self.manager_y)
        response = self.client.post('/api/users/', {
            'username': 'nowy',
            'password': PASSWORD,
            'first_name': 'Ewa',
            'last_name': 'Nowak',
            'email': 'ewa@example.com',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(EmployeeProfile.objects.get(user__username='nowy').organization, self.org_y)

    def test_bulk_approve_all_does_not_touch_other_organization(self):
        proposal_x = make_workday(self.employee_x, future_date(11), status=WorkDay.Status.PROPOSED)
        self.login(self.manager_y)

        response = self.client.post('/api/workdays/bulk-approve/', {'all': True}, format='json')

        self.assertEqual(response.data['approved_count'], 0)
        proposal_x.refresh_from_db()
        self.assertEqual(proposal_x.status, WorkDay.Status.PROPOSED)

    def test_cannot_request_swap_with_employee_from_other_organization(self):
        own_workday = make_workday(self.employee_y, future_date(12))
        self.login(self.employee_y)

        response = self.client.post('/api/swaps/', {
            'work_day': own_workday.id,
            'target_user': self.employee_x.id,
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('target_user', response.data)

    def test_copy_rejects_employee_from_other_organization(self):
        self.login(self.manager_y)
        response = self.client.post('/api/workdays/copy/', {
            'mode': 'week',
            'employee': self.employee_x.id,
            'source_start': future_date(10),
            'target_start': future_date(17),
        }, format='json')

        self.assertEqual(response.status_code, 400)

    # --- Uniqueness and settings -----------------------------------------

    def test_same_name_allowed_in_different_organizations(self):
        self.login(self.manager_y)
        response = self.client.post('/api/task-types/', {'name': 'Kasa'}, format='json')
        self.assertEqual(response.status_code, 201)

    def test_duplicate_name_in_same_organization_is_validation_error(self):
        self.login(self.manager_x)
        response = self.client.post('/api/task-types/', {'name': 'Kasa'}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('name', response.data)

    def test_schedule_settings_are_per_organization(self):
        self.login(self.manager_y)
        self.client.patch('/api/schedule-settings/', {'declaration_close_weekday': 5}, format='json')

        self.login(self.manager_x)
        self.assertIsNone(self.client.get('/api/schedule-settings/').data['declaration_close_weekday'])

    # --- Reports ---------------------------------------------------------

    def test_team_stats_count_only_own_organization(self):
        self.login(self.manager_y)
        response = self.client.get('/api/stats/', {'month': self.workday_x.date.strftime('%Y-%m')})

        self.assertEqual(response.data['employee_count'], 1)
        self.assertEqual(response.data['approved_days'], 0)

    def test_notifications_show_only_own_shortages_and_proposals(self):
        make_workday(self.employee_x, future_date(13), status=WorkDay.Status.PROPOSED)
        tomorrow = timezone.localdate() + timedelta(days=1)

        self.login(self.manager_x)
        types_x = {item['type'] for item in self.client.get('/api/notifications/').data['items']}
        self.login(self.manager_y)
        response_y = self.client.get('/api/notifications/').data

        self.assertIn('proposals', types_x)
        self.assertIn('shortage', types_x, f'template_x has no holder on {tomorrow}')
        self.assertEqual(response_y, {'total': 0, 'items': []})

    # --- Authentication --------------------------------------------------

    def test_anonymous_request_is_rejected(self):
        self.assertEqual(self.client.get('/api/users/').status_code, 401)

    def test_account_without_organization_is_forbidden(self):
        admin = User.objects.create_superuser('admin', 'admin@example.com', PASSWORD)
        self.login(admin)
        self.assertEqual(self.client.get('/api/workdays/').status_code, 403)
