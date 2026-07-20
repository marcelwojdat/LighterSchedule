from datetime import date, timedelta

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import EmployeeProfile, TaskType, WorkDay, SwapRequest


def set_profile(user, hourly_rate=0, is_manager=False):
    profile, _ = EmployeeProfile.objects.get_or_create(user=user)
    profile.hourly_rate = hourly_rate
    profile.is_manager = is_manager
    profile.save()
    return profile


class WorkDayWorkflowTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user('employee1', password='pass')
        self.manager = User.objects.create_user('manager1', password='pass')
        self.other = User.objects.create_user('employee2', password='pass')

        set_profile(self.employee, hourly_rate=20)
        set_profile(self.manager, hourly_rate=30, is_manager=True)
        set_profile(self.other, hourly_rate=22)

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

    def test_workday_note_is_saved_and_returned(self):
        self.authenticate(self.employee)
        response = self.client.post('/api/workdays/', {
            'date': self.future_date_str,
            'start_time': '09:00:00',
            'end_time': '17:00:00',
            'note': 'Muszę wyjść wcześniej',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['note'], 'Muszę wyjść wcześniej')

        workday = WorkDay.objects.get(id=response.data['id'])
        self.assertEqual(workday.note, 'Muszę wyjść wcześniej')

        self.authenticate(self.manager)
        approve = self.client.post(f'/api/workdays/{workday.id}/approve/', {
            'note': 'OK, wyjście o 15:00',
        }, format='json')
        self.assertEqual(approve.status_code, status.HTTP_200_OK)
        workday.refresh_from_db()
        self.assertEqual(workday.note, 'OK, wyjście o 15:00')
        self.assertEqual(workday.status, WorkDay.Status.APPROVED)

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

        set_profile(self.employee, hourly_rate=20)
        set_profile(self.other, hourly_rate=22)
        set_profile(self.manager, hourly_rate=30, is_manager=True)

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

    def test_two_way_swap_exchanges_employees(self):
        other_day = WorkDay.objects.create(
            employee=self.other,
            date=date.today() + timedelta(days=9),
            start_time='10:00:00',
            end_time='18:00:00',
            status=WorkDay.Status.APPROVED,
        )

        self.authenticate(self.employee)
        create_response = self.client.post('/api/swaps/', {
            'work_day': self.workday.id,
            'target_user': self.other.id,
            'target_work_day': other_day.id,
        }, format='json')
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        self.assertTrue(create_response.data['is_two_way'])
        swap_id = create_response.data['id']

        self.authenticate(self.other)
        self.assertEqual(self.client.post(f'/api/swaps/{swap_id}/accept/').status_code, status.HTTP_200_OK)

        self.authenticate(self.manager)
        approve_response = self.client.post(f'/api/swaps/{swap_id}/approve/')
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)

        self.workday.refresh_from_db()
        other_day.refresh_from_db()
        self.assertEqual(self.workday.employee_id, self.other.id)
        self.assertEqual(other_day.employee_id, self.employee.id)


class TeamStatsTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user('employee1', password='pass')
        self.manager = User.objects.create_user('manager1', password='pass')
        set_profile(self.employee, hourly_rate=20)
        set_profile(self.manager, hourly_rate=30, is_manager=True)

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
        set_profile(self.user, hourly_rate=20)

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


class MissingProfileTests(APITestCase):
    def test_workday_create_recovers_deleted_profile(self):
        user = User.objects.create_user('bez_profilu', password='haslo12345')
        EmployeeProfile.objects.filter(user=user).delete()
        self.assertFalse(EmployeeProfile.objects.filter(user=user).exists())

        token = self.client.post('/api/token/', {
            'username': 'bez_profilu',
            'password': 'haslo12345',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        future = (date.today() + timedelta(days=4)).isoformat()
        response = self.client.post('/api/workdays/', {
            'date': future,
            'start_time': '09:00:00',
            'end_time': '17:00:00',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(EmployeeProfile.objects.filter(user=user).exists())


class NotificationTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user('emp_n', password='pass')
        self.manager = User.objects.create_user('mgr_n', password='pass')
        set_profile(self.employee, hourly_rate=20)
        set_profile(self.manager, hourly_rate=30, is_manager=True)
        WorkDay.objects.create(
            employee=self.employee,
            date=date.today() + timedelta(days=2),
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.PROPOSED,
        )

    def test_manager_sees_pending_proposal_notification(self):
        token = self.client.post('/api/token/', {
            'username': 'mgr_n',
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = self.client.get('/api/notifications/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data['total'], 1)


class RegistrationTests(APITestCase):
    def test_register_creates_user_with_profile_fields(self):
        from django.test import override_settings

        with override_settings(ALLOW_PUBLIC_REGISTRATION=True):
            response = self.client.post('/api/register/', {
                'username': 'nowy_pracownik',
                'password': 'haslo12345',
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
        from django.test import override_settings

        with override_settings(ALLOW_PUBLIC_REGISTRATION=True):
            response = self.client.post('/api/register/', {
                'username': 'bez_danych',
                'password': 'haslo12345',
            }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='bez_danych').exists())

    def test_register_rejects_short_password(self):
        from django.test import override_settings

        with override_settings(ALLOW_PUBLIC_REGISTRATION=True):
            response = self.client.post('/api/register/', {
                'username': 'krotkie',
                'password': 'short',
                'first_name': 'Anna',
                'last_name': 'Kowalska',
                'email': 'krotkie@example.com',
            }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='krotkie').exists())

    def test_registration_status_endpoint(self):
        response = self.client.get('/api/register/status/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('open', response.data)
        self.assertIn('invite_required', response.data)
        self.assertFalse(response.data['open'])

    def test_public_registration_closed_by_default(self):
        response = self.client.post('/api/register/', {
            'username': 'zamknieta',
            'password': 'haslo12345',
            'first_name': 'Ada',
            'last_name': 'Nowak',
            'email': 'ada@example.com',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_register_requires_invite_code_when_configured(self):
        from django.test import override_settings

        with override_settings(ALLOW_PUBLIC_REGISTRATION=False, REGISTRATION_INVITE_CODE='firma-2026'):
            denied = self.client.post('/api/register/', {
                'username': 'zaproszony',
                'password': 'haslo12345',
                'first_name': 'Ewa',
                'last_name': 'Nowak',
                'email': 'ewa@example.com',
                'invite_code': 'zly-kod',
            }, format='json')
            self.assertEqual(denied.status_code, status.HTTP_400_BAD_REQUEST)

            ok = self.client.post('/api/register/', {
                'username': 'zaproszony',
                'password': 'haslo12345',
                'first_name': 'Ewa',
                'last_name': 'Nowak',
                'email': 'ewa@example.com',
                'invite_code': 'firma-2026',
            }, format='json')
            self.assertEqual(ok.status_code, status.HTTP_201_CREATED, ok.data)


class UserManagementTests(APITestCase):
    def setUp(self):
        self.manager = User.objects.create_user('mgr_admin', password='pass')
        self.employee = User.objects.create_user('emp_admin', password='pass')
        set_profile(self.manager, hourly_rate=30, is_manager=True)
        set_profile(self.employee, hourly_rate=20)

    def authenticate(self, user):
        response = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        })
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_manager_can_create_employee(self):
        self.authenticate(self.manager)
        response = self.client.post('/api/users/', {
            'username': 'nowy_z_panelu',
            'password': 'haslo12345',
            'first_name': 'Jan',
            'last_name': 'Kowalski',
            'email': 'jan.panel@example.com',
            'is_manager': False,
            'hourly_rate': '25.50',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        user = User.objects.get(username='nowy_z_panelu')
        self.assertEqual(user.first_name, 'Jan')
        self.assertFalse(user.profile.is_manager)
        self.assertEqual(float(user.profile.hourly_rate), 25.5)

    def test_manager_can_create_manager(self):
        self.authenticate(self.manager)
        response = self.client.post('/api/users/', {
            'username': 'kierownik2',
            'password': 'haslo12345',
            'first_name': 'Ola',
            'last_name': 'Nowak',
            'email': 'ola@example.com',
            'is_manager': True,
            'hourly_rate': '40',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(User.objects.get(username='kierownik2').profile.is_manager)

    def test_employee_cannot_create_users(self):
        self.authenticate(self.employee)
        response = self.client.post('/api/users/', {
            'username': 'hacker',
            'password': 'haslo12345',
            'first_name': 'X',
            'last_name': 'Y',
            'email': 'x@example.com',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_toggle_role_and_active(self):
        self.authenticate(self.manager)
        response = self.client.patch(f'/api/users/{self.employee.id}/profile/', {
            'is_manager': True,
            'hourly_rate': '33',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.employee.profile.refresh_from_db()
        self.assertTrue(self.employee.profile.is_manager)

        response = self.client.patch(f'/api/users/{self.employee.id}/profile/', {
            'is_active': False,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_active)

    def test_manager_cannot_demote_self(self):
        self.authenticate(self.manager)
        response = self.client.patch(f'/api/users/{self.manager.id}/profile/', {
            'is_manager': False,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ShiftTemplateTests(APITestCase):
    def setUp(self):
        self.manager = User.objects.create_user('mgr_shift', password='pass')
        EmployeeProfile.objects.create(user=self.manager, is_manager=True, hourly_rate=30)
        self.employee = User.objects.create_user('emp_shift', password='pass')
        EmployeeProfile.objects.create(user=self.employee, is_manager=False, hourly_rate=20)
        self.future = date.today() + timedelta(days=(5 - date.today().weekday()) % 7 or 7)
        # ensure a Saturday for predictable weekday tests when possible
        while self.future.weekday() != 5:
            self.future += timedelta(days=1)

    def authenticate(self, user):
        token = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_manager_creates_shift_template(self):
        self.authenticate(self.manager)
        response = self.client.post('/api/shift-templates/', {
            'name': 'Poranna',
            'is_active': True,
            'hours': [
                {'weekday': 5, 'start_time': '06:00:00', 'end_time': '14:00:00'},
                {'weekday': 6, 'start_time': '09:00:00', 'end_time': '15:00:00'},
            ],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(len(response.data['hours']), 2)

    def test_employee_picks_template_and_gets_resolved_times(self):
        self.authenticate(self.manager)
        created = self.client.post('/api/shift-templates/', {
            'name': 'Poranna',
            'is_active': True,
            'hours': [
                {'weekday': self.future.weekday(), 'start_time': '06:00:00', 'end_time': '14:00:00'},
            ],
        }, format='json')
        template_id = created.data['id']

        self.authenticate(self.employee)
        response = self.client.post('/api/workdays/', {
            'date': self.future.isoformat(),
            'shift_template': template_id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['start_time'], '06:00:00')
        self.assertEqual(response.data['end_time'], '14:00:00')
        self.assertEqual(response.data['shift_template'], template_id)
        self.assertEqual(response.data['shift_template_name'], 'Poranna')

    def test_employee_cannot_use_template_without_hours_for_weekday(self):
        self.authenticate(self.manager)
        created = self.client.post('/api/shift-templates/', {
            'name': 'Tylko sobota',
            'is_active': True,
            'hours': [
                {'weekday': 5, 'start_time': '06:00:00', 'end_time': '14:00:00'},
            ],
        }, format='json')
        # pick a Monday
        monday = self.future
        while monday.weekday() != 0:
            monday += timedelta(days=1)

        self.authenticate(self.employee)
        response = self.client.post('/api/workdays/', {
            'date': monday.isoformat(),
            'shift_template': created.data['id'],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_templates_filtered_by_date(self):
        self.authenticate(self.manager)
        self.client.post('/api/shift-templates/', {
            'name': 'Poranna',
            'is_active': True,
            'hours': [
                {'weekday': self.future.weekday(), 'start_time': '06:00:00', 'end_time': '14:00:00'},
            ],
        }, format='json')
        self.client.post('/api/shift-templates/', {
            'name': 'Inny dzień',
            'is_active': True,
            'hours': [
                {'weekday': (self.future.weekday() + 1) % 7, 'start_time': '12:00:00', 'end_time': '20:00:00'},
            ],
        }, format='json')

        self.authenticate(self.employee)
        response = self.client.get('/api/shift-templates/', {'date': self.future.isoformat()})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [item['name'] for item in response.data]
        self.assertIn('Poranna', names)
        self.assertNotIn('Inny dzień', names)
        poranna = next(item for item in response.data if item['name'] == 'Poranna')
        self.assertEqual(poranna['resolved_start'], '06:00:00')
        self.assertEqual(poranna['resolved_end'], '14:00:00')
