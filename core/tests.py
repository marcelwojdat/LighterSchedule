from datetime import date, timedelta

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import EmployeeProfile, TaskType, WorkDay, SwapRequest


class WorkDayWorkflowTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user('employee1', password='pass')
        self.manager = User.objects.create_user('manager1', password='pass')
        self.other = User.objects.create_user('employee2', password='pass')

        EmployeeProfile.objects.create(user=self.employee, hourly_rate=20)
        EmployeeProfile.objects.create(user=self.manager, hourly_rate=30, is_manager=True)
        EmployeeProfile.objects.create(user=self.other, hourly_rate=22)

        self.future_date = date.today() + timedelta(days=5)
        self.future_date_str = self.future_date.isoformat()

    def authenticate(self, user):
        response = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        })
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_employee_creates_proposed_workday(self):
        self.authenticate(self.employee)
        response = self.client.post('/api/workdays/', {
            'date': self.future_date_str,
            'start_time': '09:00:00',
            'end_time': '17:00:00',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['status'], 'proposed')

    def test_manager_approves_workday(self):
        workday = WorkDay.objects.create(
            employee=self.employee,
            date=self.future_date,
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.PROPOSED,
        )

        self.authenticate(self.manager)
        response = self.client.post(f'/api/workdays/{workday.id}/approve/', {
            'start_time': '10:00:00',
            'end_time': '18:00:00',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        workday.refresh_from_db()
        self.assertEqual(workday.status, WorkDay.Status.APPROVED)
        self.assertEqual(str(workday.start_time), '10:00:00')

    def test_employee_cannot_edit_approved_workday(self):
        workday = WorkDay.objects.create(
            employee=self.employee,
            date=self.future_date,
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.APPROVED,
        )

        self.authenticate(self.employee)
        response = self.client.patch(f'/api/workdays/{workday.id}/', {
            'start_time': '08:00:00',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unique_workday_per_employee_and_date(self):
        WorkDay.objects.create(
            employee=self.employee,
            date=self.future_date,
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.PROPOSED,
        )

        self.authenticate(self.employee)
        response = self.client.post('/api/workdays/', {
            'date': self.future_date_str,
            'start_time': '12:00:00',
            'end_time': '20:00:00',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_employee_sees_only_own_workdays(self):
        WorkDay.objects.create(
            employee=self.employee,
            date=self.future_date,
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.APPROVED,
        )
        WorkDay.objects.create(
            employee=self.other,
            date=self.future_date + timedelta(days=1),
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.APPROVED,
        )

        self.authenticate(self.employee)
        response = self.client.get('/api/workdays/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['employee'], self.employee.id)


class SwapWorkflowTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user('employee1', password='pass')
        self.other = User.objects.create_user('employee2', password='pass')
        self.manager = User.objects.create_user('manager1', password='pass')

        EmployeeProfile.objects.create(user=self.employee, hourly_rate=20)
        EmployeeProfile.objects.create(user=self.other, hourly_rate=22)
        EmployeeProfile.objects.create(user=self.manager, hourly_rate=30, is_manager=True)

        self.future_date = date.today() + timedelta(days=7)
        self.workday = WorkDay.objects.create(
            employee=self.employee,
            date=self.future_date,
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.APPROVED,
        )

    def authenticate(self, user):
        response = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        })
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_swap_flow_transfers_shift(self):
        self.authenticate(self.employee)
        create_response = self.client.post('/api/swaps/', {
            'work_day': self.workday.id,
            'target_user': self.other.id,
        }, format='json')
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        swap_id = create_response.data['id']

        self.authenticate(self.other)
        accept_response = self.client.post(f'/api/swaps/{swap_id}/accept/')
        self.assertEqual(accept_response.status_code, status.HTTP_200_OK)

        self.authenticate(self.manager)
        approve_response = self.client.post(f'/api/swaps/{swap_id}/approve/')
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        self.workday.refresh_from_db()
        self.assertEqual(self.workday.employee_id, self.other.id)


class TeamStatsTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user('employee1', password='pass')
        self.manager = User.objects.create_user('manager1', password='pass')
        EmployeeProfile.objects.create(user=self.employee, hourly_rate=20)
        EmployeeProfile.objects.create(user=self.manager, hourly_rate=30, is_manager=True)

        WorkDay.objects.create(
            employee=self.employee,
            date=date.today(),
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.APPROVED,
            rate_at_time=20,
        )

    def authenticate(self, user):
        response = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        })
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_manager_can_access_team_stats(self):
        month = date.today().strftime('%Y-%m')
        self.authenticate(self.manager)
        response = self.client.get('/api/stats/', {'month': month})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['approved_days'], 1)
        self.assertEqual(response.data['total_hours'], 8.0)

    def test_employee_cannot_access_team_stats(self):
        month = date.today().strftime('%Y-%m')
        self.authenticate(self.employee)
        response = self.client.get('/api/stats/', {'month': month})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class TaskTypeSeedTests(APITestCase):
    def test_default_task_types_exist(self):
        names = set(TaskType.objects.values_list('name', flat=True))
        self.assertTrue({'Kasa', 'Magazyn', 'Obsługa'}.issubset(names))


class ProfileTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            'employee1',
            password='pass',
            email='old@example.com',
            first_name='Jan',
            last_name='Kowalski',
        )
        EmployeeProfile.objects.create(user=self.user, hourly_rate=20)

    def authenticate(self):
        response = self.client.post('/api/token/', {
            'username': self.user.username,
            'password': 'pass',
        })
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_user_can_update_profile(self):
        self.authenticate()
        response = self.client.patch('/api/me/', {
            'first_name': 'Adam',
            'last_name': 'Nowak',
            'email': 'adam@example.com',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['first_name'], 'Adam')
        self.assertEqual(response.data['email'], 'adam@example.com')

    def test_user_can_change_password(self):
        self.authenticate()
        response = self.client.post('/api/me/change-password/', {
            'current_password': 'pass',
            'new_password': 'newpassword123',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('newpassword123'))

    def test_change_password_rejects_wrong_current_password(self):
        self.authenticate()
        response = self.client.post('/api/me/change-password/', {
            'current_password': 'wrong',
            'new_password': 'newpassword123',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class RegistrationTests(APITestCase):
    def test_register_creates_user_with_profile_fields(self):
        response = self.client.post('/api/register/', {
            'username': 'nowy_pracownik',
            'password': 'haslo123',
            'first_name': 'Anna',
            'last_name': 'Kowalska',
            'email': 'anna@example.com',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        user = User.objects.get(username='nowy_pracownik')
        self.assertEqual(user.first_name, 'Anna')
        self.assertEqual(user.last_name, 'Kowalska')
        self.assertEqual(user.email, 'anna@example.com')
        self.assertTrue(hasattr(user, 'profile'))
        self.assertFalse(user.profile.is_manager)

    def test_register_requires_name_and_email(self):
        response = self.client.post('/api/register/', {
            'username': 'bez_danych',
            'password': 'haslo123',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='bez_danych').exists())
