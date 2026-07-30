from datetime import date, timedelta

from django.contrib.auth.models import User
from django.core import mail
from django.test import SimpleTestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import EmployeeProfile, TaskType, WorkDay, SwapRequest, ShiftTemplate, ShiftTemplateHours
from core.utils import format_shortage_message, shortage_day_label


def set_profile(user, hourly_rate=0, is_manager=False):
    profile, _ = EmployeeProfile.objects.get_or_create(user=user)
    profile.hourly_rate = hourly_rate
    profile.is_manager = is_manager
    profile.save()
    return profile


class ShortageMessageTests(SimpleTestCase):
    def test_format_single_and_plural(self):
        self.assertEqual(
            format_shortage_message({'shift_template_name': 'Wieczorna', 'needed': 1}),
            'Jutro brakuje osoby na zmianę: wieczorna.',
        )
        self.assertEqual(
            format_shortage_message({'shift_template_name': 'Poranna', 'needed': 3}),
            'Jutro brakuje 3 osób na zmianę: poranna.',
        )

    def test_day_labels_relative_and_weekday(self):
        today = date(2026, 7, 13)  # Monday
        self.assertEqual(shortage_day_label(today + timedelta(days=1), today=today), 'Jutro')
        self.assertEqual(shortage_day_label(today + timedelta(days=2), today=today), 'Pojutrze')
        self.assertEqual(shortage_day_label(today + timedelta(days=3), today=today), 'W czwartek')
        # Next Tuesday (not jutro/pojutrze) → We wtorek
        self.assertEqual(
            shortage_day_label(date(2026, 7, 21), today=today),
            'We wtorek',
        )
        # Wednesday further out
        self.assertEqual(
            shortage_day_label(date(2026, 7, 22), today=today),
            'W środę',
        )
        self.assertEqual(
            format_shortage_message(
                {
                    'shift_template_name': 'Wieczorna',
                    'needed': 1,
                    'date': date(2026, 7, 16),  # Thursday (+3)
                },
                today=today,
            ),
            'W czwartek brakuje osoby na zmianę: wieczorna.',
        )


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

    def authenticate(self, username):
        token = self.client.post('/api/token/', {
            'username': username,
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_manager_sees_pending_proposal_notification(self):
        self.authenticate('mgr_n')
        response = self.client.get('/api/notifications/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data['total'], 1)

    def test_manager_sees_tomorrow_shortage_alert(self):
        from core.models import ShiftTemplate, ShiftTemplateHours

        tomorrow = date.today() + timedelta(days=1)
        template = ShiftTemplate.objects.create(name='Wieczorna', is_active=True, max_slots=2)
        ShiftTemplateHours.objects.create(
            template=template,
            weekday=tomorrow.weekday(),
            start_time='16:00:00',
            end_time='22:00:00',
        )

        self.authenticate('mgr_n')
        response = self.client.get('/api/notifications/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        shortage_items = [item for item in response.data['items'] if item['type'] == 'shortage']
        self.assertEqual(len(shortage_items), 1)
        self.assertEqual(shortage_items[0]['count'], 2)
        self.assertEqual(
            shortage_items[0]['message'],
            'Jutro brakuje 2 osób na zmianę: wieczorna.',
        )
        self.assertGreaterEqual(response.data['total'], 3)  # 1 proposal + 2 missing seats

    def test_no_shortage_when_slots_full(self):
        from core.models import ShiftTemplate, ShiftTemplateHours

        tomorrow = date.today() + timedelta(days=1)
        template = ShiftTemplate.objects.create(name='Poranna', is_active=True, max_slots=1)
        ShiftTemplateHours.objects.create(
            template=template,
            weekday=tomorrow.weekday(),
            start_time='06:00:00',
            end_time='14:00:00',
        )
        WorkDay.objects.create(
            employee=self.employee,
            date=tomorrow,
            start_time='06:00:00',
            end_time='14:00:00',
            status=WorkDay.Status.APPROVED,
            shift_template=template,
        )

        self.authenticate('mgr_n')
        response = self.client.get('/api/notifications/')
        shortage_items = [item for item in response.data['items'] if item['type'] == 'shortage']
        self.assertEqual(shortage_items, [])

    def test_employee_does_not_see_shortage_alerts(self):
        from core.models import ShiftTemplate, ShiftTemplateHours

        tomorrow = date.today() + timedelta(days=1)
        template = ShiftTemplate.objects.create(name='Wieczorna', is_active=True, max_slots=1)
        ShiftTemplateHours.objects.create(
            template=template,
            weekday=tomorrow.weekday(),
            start_time='16:00:00',
            end_time='22:00:00',
        )

        self.authenticate('emp_n')
        response = self.client.get('/api/notifications/')
        shortage_items = [item for item in response.data['items'] if item['type'] == 'shortage']
        self.assertEqual(shortage_items, [])


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

    def test_soft_delete_deactivates_user(self):
        self.authenticate(self.manager)
        response = self.client.delete(f'/api/users/{self.employee.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_active)
        self.assertTrue(User.objects.filter(pk=self.employee.pk).exists())

    def test_cannot_delete_self(self):
        other = User.objects.create_user('mgr2', password='pass')
        set_profile(other, hourly_rate=30, is_manager=True)
        self.authenticate(self.manager)
        response = self.client.delete(f'/api/users/{self.manager.id}/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('własnego', response.data['error'])

    def test_cannot_deactivate_last_manager(self):
        self.authenticate(self.manager)
        response = self.client.delete(f'/api/users/{self.manager.id}/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('ostatniego', response.data['error'])
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.is_active)

    def test_hard_delete_without_history(self):
        self.authenticate(self.manager)
        response = self.client.delete(f'/api/users/{self.employee.id}/?permanent=true')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(User.objects.filter(pk=self.employee.pk).exists())

    def test_hard_delete_blocked_with_workday_history(self):
        from datetime import date, timedelta
        WorkDay.objects.create(
            employee=self.employee,
            date=date.today() + timedelta(days=3),
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.APPROVED,
        )
        self.authenticate(self.manager)
        response = self.client.delete(f'/api/users/{self.employee.id}/?permanent=true')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data.get('can_hard_delete', True))
        self.assertTrue(User.objects.filter(pk=self.employee.pk).exists())

    def test_employee_cannot_delete_users(self):
        self.authenticate(self.employee)
        response = self.client.delete(f'/api/users/{self.manager.id}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ShiftTemplateTests(APITestCase):
    def setUp(self):
        self.manager = User.objects.create_user('mgr_shift', password='pass')
        set_profile(self.manager, hourly_rate=30, is_manager=True)
        self.employee = User.objects.create_user('emp_shift', password='pass')
        set_profile(self.employee, hourly_rate=20, is_manager=False)
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


class ShiftSlotLimitTests(APITestCase):
    def setUp(self):
        self.manager = User.objects.create_user('mgr_slots', password='pass', first_name='Anna', last_name='Kierownik')
        set_profile(self.manager, hourly_rate=30, is_manager=True)
        self.employee1 = User.objects.create_user('emp_slot1', password='pass', first_name='Jan', last_name='Kowalski')
        self.employee2 = User.objects.create_user('emp_slot2', password='pass', first_name='Ewa', last_name='Nowak')
        set_profile(self.employee1, hourly_rate=20)
        set_profile(self.employee2, hourly_rate=22)

        self.work_date = date.today() + timedelta(days=(5 - date.today().weekday()) % 7 or 7)
        while self.work_date.weekday() != 5:
            self.work_date += timedelta(days=1)

    def authenticate(self, user):
        token = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def create_template(self, max_slots=1):
        self.authenticate(self.manager)
        response = self.client.post('/api/shift-templates/', {
            'name': 'Poranna',
            'is_active': True,
            'max_slots': max_slots,
            'hours': [
                {'weekday': self.work_date.weekday(), 'start_time': '06:00:00', 'end_time': '14:00:00'},
            ],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['max_slots'], max_slots)
        return response.data['id']

    def test_first_approve_ok_second_same_day_template_rejected(self):
        template_id = self.create_template(max_slots=1)

        self.authenticate(self.employee1)
        first = self.client.post('/api/workdays/', {
            'date': self.work_date.isoformat(),
            'shift_template': template_id,
        }, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)

        self.authenticate(self.employee2)
        second = self.client.post('/api/workdays/', {
            'date': self.work_date.isoformat(),
            'shift_template': template_id,
        }, format='json')
        self.assertEqual(second.status_code, status.HTTP_201_CREATED, second.data)

        self.authenticate(self.manager)
        approve1 = self.client.post(f'/api/workdays/{first.data["id"]}/approve/', {}, format='json')
        self.assertEqual(approve1.status_code, status.HTTP_200_OK, approve1.data)
        self.assertEqual(approve1.data['status'], 'approved')

        approve2 = self.client.post(f'/api/workdays/{second.data["id"]}/approve/', {}, format='json')
        self.assertEqual(approve2.status_code, status.HTTP_400_BAD_REQUEST, approve2.data)
        self.assertIn('Poranna', approve2.data.get('error', ''))

        pending = self.client.get('/api/workdays/', {'status': 'proposed'}, format='json')
        self.assertEqual(pending.status_code, status.HTTP_200_OK)
        item = next(row for row in pending.data if row['id'] == second.data['id'])
        self.assertTrue(item['shift_slots']['is_full'])
        self.assertEqual(item['shift_slots']['filled'], 1)
        self.assertEqual(item['shift_slots']['max_slots'], 1)
        holder_names = [h['name'] for h in item['shift_slots']['holders']]
        self.assertIn('Jan Kowalski', holder_names)

    def test_manager_create_approved_respects_max_slots(self):
        template_id = self.create_template(max_slots=1)

        self.authenticate(self.manager)
        first = self.client.post('/api/workdays/', {
            'date': self.work_date.isoformat(),
            'employee': self.employee1.id,
            'shift_template': template_id,
        }, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(first.data['status'], 'approved')

        second = self.client.post('/api/workdays/', {
            'date': self.work_date.isoformat(),
            'employee': self.employee2.id,
            'shift_template': template_id,
        }, format='json')
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST, second.data)
        self.assertIn('Poranna', str(second.data))

    def test_employee_cannot_propose_when_shift_already_full(self):
        template_id = self.create_template(max_slots=1)

        self.authenticate(self.manager)
        created = self.client.post('/api/workdays/', {
            'date': self.work_date.isoformat(),
            'employee': self.employee1.id,
            'shift_template': template_id,
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)

        self.authenticate(self.employee2)
        blocked = self.client.post('/api/workdays/', {
            'date': self.work_date.isoformat(),
            'shift_template': template_id,
        }, format='json')
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST, blocked.data)
        self.assertIn('Poranna', str(blocked.data))


class CalendarExportTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user('emp_cal', password='pass', first_name='Ola', last_name='Nowak')
        set_profile(self.employee, hourly_rate=20)
        self.future = date.today() + timedelta(days=3)
        from core.models import ShiftTemplate, ShiftTemplateHours

        self.template = ShiftTemplate.objects.create(name='Poranna', is_active=True, max_slots=1)
        ShiftTemplateHours.objects.create(
            template=self.template,
            weekday=self.future.weekday(),
            start_time='06:00:00',
            end_time='14:00:00',
        )
        self.workday = WorkDay.objects.create(
            employee=self.employee,
            date=self.future,
            start_time='06:00:00',
            end_time='14:00:00',
            status=WorkDay.Status.APPROVED,
            shift_template=self.template,
            note='Wyjdę o 13:00',
        )

    def authenticate(self, user):
        token = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_export_ics_requires_auth_or_token(self):
        response = self.client.get('/api/workdays/export.ics/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_export_contains_approved_event(self):
        self.authenticate(self.employee)
        response = self.client.get('/api/workdays/export.ics/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('text/calendar', response['Content-Type'])
        body = response.content.decode('utf-8')
        self.assertIn('BEGIN:VCALENDAR', body)
        self.assertIn('SUMMARY:Zmiana Poranna', body)
        self.assertIn('Notatka: Wyjdę o 13:00', body)
        self.assertIn(f'UID:workday-{self.workday.id}@lighterschedule', body)

    def test_export_excludes_proposed_and_past(self):
        past = date.today() - timedelta(days=2)
        WorkDay.objects.create(
            employee=self.employee,
            date=past,
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.APPROVED,
        )
        WorkDay.objects.create(
            employee=self.employee,
            date=self.future + timedelta(days=1),
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.PROPOSED,
        )
        self.authenticate(self.employee)
        body = self.client.get('/api/workdays/export.ics/').content.decode('utf-8')
        self.assertEqual(body.count('BEGIN:VEVENT'), 1)

    def test_calendar_feed_token_works_without_auth(self):
        self.authenticate(self.employee)
        feed = self.client.get('/api/workdays/calendar-feed/')
        self.assertEqual(feed.status_code, status.HTTP_200_OK)
        token = feed.data['token']
        self.assertTrue(feed.data['url'])
        self.assertTrue(feed.data['webcal_url'].startswith('webcal://'))

        self.client.credentials()
        response = self.client.get('/api/workdays/export.ics/', {'token': token})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('SUMMARY:Zmiana Poranna', response.content.decode('utf-8'))

    def test_month_filter(self):
        self.authenticate(self.employee)
        month = self.future.strftime('%Y-%m')
        response = self.client.get('/api/workdays/export.ics/', {'month': month})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('SUMMARY:Zmiana Poranna', response.content.decode('utf-8'))


class DeclarationDeadlineTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user('emp_deadline', password='pass')
        self.manager = User.objects.create_user('mgr_deadline', password='pass')
        set_profile(self.employee, hourly_rate=20)
        set_profile(self.manager, hourly_rate=30, is_manager=True)
        self.future = date.today() + timedelta(days=4)

    def authenticate(self, user):
        token = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_manager_sets_weekly_deadline(self):
        self.authenticate(self.manager)
        response = self.client.patch('/api/schedule-settings/', {
            'declaration_close_weekday': 5,
            'declaration_close_time': '23:59:00',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['declaration_close_weekday'], 5)
        self.assertEqual(response.data['declaration_close_time'], '23:59:00')
        self.assertEqual(response.data['declaration_close_label'], 'sobota 23:59')
        self.assertIn('declarations_closed', response.data)

    def test_employee_blocked_after_weekly_deadline(self):
        from datetime import datetime, time
        from unittest.mock import patch

        from django.utils import timezone

        from core.models import ScheduleSettings

        settings_obj = ScheduleSettings.load()
        settings_obj.declaration_close_weekday = 5  # Saturday
        settings_obj.declaration_close_time = time(23, 59)
        settings_obj.save()

        # Sunday 12:00 — after Saturday close
        fake_now = timezone.make_aware(datetime(2026, 7, 26, 12, 0, 0))
        with patch('core.utils.timezone.localtime', return_value=fake_now):
            self.authenticate(self.employee)
            settings = self.client.get('/api/schedule-settings/')
            self.assertTrue(settings.data['declarations_closed'])

            response = self.client.post('/api/workdays/', {
                'date': self.future.isoformat(),
                'start_time': '09:00:00',
                'end_time': '17:00:00',
            }, format='json')
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_window_open_before_weekly_deadline(self):
        from datetime import datetime, time
        from unittest.mock import patch

        from django.utils import timezone

        from core.models import ScheduleSettings
        from core.utils import declaration_deadline_passed

        settings_obj = ScheduleSettings.load()
        settings_obj.declaration_close_weekday = 5
        settings_obj.declaration_close_time = time(23, 59)
        settings_obj.save()

        # Friday 10:00 — before Saturday close
        fake_now = timezone.make_aware(datetime(2026, 7, 24, 10, 0, 0))
        with patch('core.utils.timezone.localtime', return_value=fake_now):
            self.assertFalse(declaration_deadline_passed())

        # Saturday 23:59 — still open (inclusive until that minute)
        fake_edge = timezone.make_aware(datetime(2026, 7, 25, 23, 59, 0))
        with patch('core.utils.timezone.localtime', return_value=fake_edge):
            self.assertFalse(declaration_deadline_passed())

        # Sunday 00:00 — closed
        fake_closed = timezone.make_aware(datetime(2026, 7, 26, 0, 0, 0))
        with patch('core.utils.timezone.localtime', return_value=fake_closed):
            self.assertTrue(declaration_deadline_passed())

    def test_manager_can_edit_when_window_closed(self):
        from datetime import time

        from core.models import ScheduleSettings

        settings_obj = ScheduleSettings.load()
        settings_obj.declaration_close_weekday = 0
        settings_obj.declaration_close_time = time(0, 0)
        settings_obj.save()

        self.authenticate(self.manager)
        response = self.client.post('/api/workdays/', {
            'date': self.future.isoformat(),
            'employee': self.employee.id,
            'start_time': '09:00:00',
            'end_time': '17:00:00',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['status'], 'approved')


class CopyScheduleTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user('emp_copy', password='pass')
        self.manager = User.objects.create_user('mgr_copy', password='pass')
        set_profile(self.employee, hourly_rate=20)
        set_profile(self.manager, hourly_rate=30, is_manager=True)

        # Source: Monday of next week
        today = date.today()
        self.source_monday = today + timedelta(days=(7 - today.weekday()) % 7 or 7)
        while self.source_monday.weekday() != 0:
            self.source_monday += timedelta(days=1)
        self.target_monday = self.source_monday + timedelta(days=7)

        WorkDay.objects.create(
            employee=self.employee,
            date=self.source_monday,
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.APPROVED,
            note='Z biura',
        )
        WorkDay.objects.create(
            employee=self.employee,
            date=self.source_monday + timedelta(days=2),
            start_time='12:00:00',
            end_time='20:00:00',
            status=WorkDay.Status.APPROVED,
        )

    def authenticate(self, user):
        token = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_employee_copies_week_as_proposed(self):
        self.authenticate(self.employee)
        response = self.client.post('/api/workdays/copy/', {
            'mode': 'week',
            'source_start': self.source_monday.isoformat(),
            'target_start': self.target_monday.isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['created_count'], 2)

        copied = WorkDay.objects.get(employee=self.employee, date=self.target_monday)
        self.assertEqual(copied.status, WorkDay.Status.PROPOSED)
        self.assertEqual(str(copied.start_time), '09:00:00')
        self.assertEqual(copied.note, 'Z biura')

    def test_copy_skips_existing_target(self):
        WorkDay.objects.create(
            employee=self.employee,
            date=self.target_monday,
            start_time='08:00:00',
            end_time='12:00:00',
            status=WorkDay.Status.PROPOSED,
        )
        self.authenticate(self.employee)
        response = self.client.post('/api/workdays/copy/', {
            'mode': 'week',
            'source_start': self.source_monday.isoformat(),
            'target_start': self.target_monday.isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['created_count'], 1)
        self.assertEqual(response.data['skipped_count'], 1)
        existing = WorkDay.objects.get(employee=self.employee, date=self.target_monday)
        self.assertEqual(str(existing.start_time), '08:00:00')

    def test_manager_copies_as_approved(self):
        self.authenticate(self.manager)
        response = self.client.post('/api/workdays/copy/', {
            'mode': 'week',
            'source_start': self.source_monday.isoformat(),
            'target_start': self.target_monday.isoformat(),
            'employee': self.employee.id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        copied = WorkDay.objects.get(employee=self.employee, date=self.target_monday)
        self.assertEqual(copied.status, WorkDay.Status.APPROVED)


class RejectionReasonTemplateTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user('emp_rr', password='pass')
        self.manager = User.objects.create_user('mgr_rr', password='pass')
        set_profile(self.employee, hourly_rate=20)
        set_profile(self.manager, hourly_rate=30, is_manager=True)
        self.workday = WorkDay.objects.create(
            employee=self.employee,
            date=date.today() + timedelta(days=3),
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.PROPOSED,
        )

    def authenticate(self, user):
        token = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_seeded_reasons_listed_for_manager(self):
        self.authenticate(self.manager)
        response = self.client.get('/api/rejection-reasons/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        texts = {item['text'] for item in response.data}
        self.assertIn('Za dużo osób', texts)
        self.assertIn('Inna zmiana', texts)

    def test_employee_cannot_list_reasons(self):
        self.authenticate(self.employee)
        response = self.client.get('/api/rejection-reasons/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_create_reason(self):
        self.authenticate(self.manager)
        response = self.client.post('/api/rejection-reasons/', {
            'text': '  Zmiana już obsadzona  ',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['text'], 'Zmiana już obsadzona')

    def test_reject_remembers_custom_reason(self):
        from core.models import RejectionReasonTemplate

        self.authenticate(self.manager)
        response = self.client.post(
            f'/api/workdays/{self.workday.id}/reject/',
            {'rejection_reason': 'Nie pasuje do grafiku'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(
            RejectionReasonTemplate.objects.filter(text='Nie pasuje do grafiku').exists()
        )
        saved = RejectionReasonTemplate.objects.get(text='Nie pasuje do grafiku')
        self.assertIsNotNone(saved.last_used_at)


class BulkApproveTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user('emp_bulk', password='pass')
        self.other = User.objects.create_user('other_bulk', password='pass')
        self.manager = User.objects.create_user('mgr_bulk', password='pass')
        set_profile(self.employee, hourly_rate=20)
        set_profile(self.other, hourly_rate=22)
        set_profile(self.manager, hourly_rate=30, is_manager=True)
        self.d1 = date.today() + timedelta(days=3)
        self.d2 = date.today() + timedelta(days=4)
        self.wd1 = WorkDay.objects.create(
            employee=self.employee,
            date=self.d1,
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.PROPOSED,
        )
        self.wd2 = WorkDay.objects.create(
            employee=self.other,
            date=self.d2,
            start_time='12:00:00',
            end_time='20:00:00',
            status=WorkDay.Status.PROPOSED,
        )

    def authenticate(self, user):
        token = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_bulk_approve_selected_ids(self):
        self.authenticate(self.manager)
        response = self.client.post('/api/workdays/bulk-approve/', {
            'ids': [self.wd1.id, self.wd2.id],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['approved_count'], 2)
        self.wd1.refresh_from_db()
        self.wd2.refresh_from_db()
        self.assertEqual(self.wd1.status, WorkDay.Status.APPROVED)
        self.assertEqual(self.wd2.status, WorkDay.Status.APPROVED)

    def test_bulk_approve_all(self):
        self.authenticate(self.manager)
        response = self.client.post('/api/workdays/bulk-approve/', {
            'all': True,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['approved_count'], 2)

    def test_bulk_approve_skips_full_slot(self):
        from core.models import ShiftTemplate, ShiftTemplateHours

        day = date.today() + timedelta(days=8)
        template = ShiftTemplate.objects.create(name='Poranna', is_active=True, max_slots=1)
        ShiftTemplateHours.objects.create(
            template=template,
            weekday=day.weekday(),
            start_time='06:00:00',
            end_time='14:00:00',
        )
        filler = User.objects.create_user('filler_bulk', password='pass')
        set_profile(filler, hourly_rate=20)
        WorkDay.objects.create(
            employee=filler,
            date=day,
            start_time='06:00:00',
            end_time='14:00:00',
            status=WorkDay.Status.APPROVED,
            shift_template=template,
        )
        blocked = WorkDay.objects.create(
            employee=self.employee,
            date=day,
            start_time='06:00:00',
            end_time='14:00:00',
            status=WorkDay.Status.PROPOSED,
            shift_template=template,
        )

        self.authenticate(self.manager)
        response = self.client.post('/api/workdays/bulk-approve/', {
            'ids': [blocked.id],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['approved_count'], 0)
        self.assertEqual(response.data['skipped_count'], 1)
        blocked.refresh_from_db()
        self.assertEqual(blocked.status, WorkDay.Status.PROPOSED)

    def test_employee_cannot_bulk_approve(self):
        self.authenticate(self.employee)
        response = self.client.post('/api/workdays/bulk-approve/', {
            'ids': [self.wd1.id],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ScheduleHolesTests(APITestCase):
    def setUp(self):
        from core.models import ShiftTemplate, ShiftTemplateHours

        self.employee = User.objects.create_user('emp_holes', password='pass')
        self.manager = User.objects.create_user('mgr_holes', password='pass')
        set_profile(self.employee, hourly_rate=20)
        set_profile(self.manager, hourly_rate=30, is_manager=True)

        self.today = date.today()
        self.template = ShiftTemplate.objects.create(name='Wieczorna', is_active=True, max_slots=2)
        # Cover every weekday so the next 7 days always include this template
        for weekday in range(7):
            ShiftTemplateHours.objects.create(
                template=self.template,
                weekday=weekday,
                start_time='16:00:00',
                end_time='22:00:00',
            )

    def authenticate(self, user):
        token = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_manager_lists_holes_for_7_days(self):
        self.authenticate(self.manager)
        response = self.client.get('/api/schedule-holes/', {'days': 7})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['days'], 7)
        self.assertEqual(response.data['count'], 7)
        self.assertEqual(len(response.data['items']), 7)
        first = response.data['items'][0]
        self.assertEqual(first['shift_template_name'], 'Wieczorna')
        self.assertEqual(first['needed'], 2)
        self.assertEqual(first['filled'], 0)
        dates = [item['date'] for item in response.data['items']]
        self.assertEqual(dates, sorted(dates))

    def test_filled_slot_reduces_needed(self):
        WorkDay.objects.create(
            employee=self.employee,
            date=self.today,
            start_time='16:00:00',
            end_time='22:00:00',
            status=WorkDay.Status.APPROVED,
            shift_template=self.template,
        )
        self.authenticate(self.manager)
        response = self.client.get('/api/schedule-holes/', {'days': 1})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['items'][0]['needed'], 1)
        self.assertEqual(response.data['items'][0]['filled'], 1)

    def test_employee_forbidden(self):
        self.authenticate(self.employee)
        response = self.client.get('/api/schedule-holes/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_days_clamped_to_14(self):
        self.authenticate(self.manager)
        response = self.client.get('/api/schedule-holes/', {'days': 99})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['days'], 14)


class PayrollPdfTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user(
            'emp_pdf',
            password='pass',
            first_name='Łukasz',
            last_name='Żółć',
        )
        self.manager = User.objects.create_user('mgr_pdf', password='pass')
        set_profile(self.employee, hourly_rate=25)
        set_profile(self.manager, hourly_rate=30, is_manager=True)

        self.month = date.today().replace(day=10)
        self.template = ShiftTemplate.objects.create(
            name='Wieczorna — późna',
            is_active=True,
            max_slots=2,
        )
        ShiftTemplateHours.objects.create(
            template=self.template,
            weekday=self.month.weekday(),
            start_time='16:00:00',
            end_time='22:00:00',
        )
        WorkDay.objects.create(
            employee=self.employee,
            date=self.month,
            start_time='16:00:00',
            end_time='22:00:00',
            status=WorkDay.Status.APPROVED,
            rate_at_time=25,
            shift_template=self.template,
        )

    def authenticate(self, user):
        token = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_polish_fonts_registered(self):
        from core.pdf_fonts import FONT_BOLD, FONT_REGULAR, register_polish_fonts
        from reportlab.pdfbase import pdfmetrics

        regular, bold = register_polish_fonts()
        self.assertEqual(regular, FONT_REGULAR)
        self.assertEqual(bold, FONT_BOLD)
        self.assertIn(FONT_REGULAR, pdfmetrics.getRegisteredFontNames())
        self.assertIn(FONT_BOLD, pdfmetrics.getRegisteredFontNames())

    def test_payroll_pdf_embeds_dejavu_and_polish_content(self):
        import tempfile
        from pathlib import Path

        self.authenticate(self.manager)
        month_value = f'{self.month.year}-{self.month.month:02d}'
        response = self.client.get('/api/stats/payroll.pdf', {'month': month_value})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content[:200])
        self.assertEqual(response['Content-Type'], 'application/pdf')
        pdf_bytes = response.content
        self.assertTrue(pdf_bytes.startswith(b'%PDF'))
        self.assertIn(b'DejaVu', pdf_bytes)

        # Smoke: write outside the browser and reopen as a file
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / f'wyplaty-{month_value}.pdf'
            path.write_bytes(pdf_bytes)
            self.assertGreater(path.stat().st_size, 1000)
            reopened = path.read_bytes()
            self.assertEqual(reopened[:4], b'%PDF')
            self.assertIn(b'DejaVu', reopened)


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class EmailNotificationTests(APITestCase):
    def setUp(self):
        self.employee = User.objects.create_user(
            'emp_mail', password='pass', email='emp@example.com', first_name='Ewa',
        )
        self.other = User.objects.create_user(
            'other_mail', password='pass', email='other@example.com', first_name='Ola',
        )
        self.manager = User.objects.create_user(
            'mgr_mail', password='pass', email='mgr@example.com', first_name='Jan',
        )
        set_profile(self.employee, hourly_rate=20)
        set_profile(self.other, hourly_rate=22)
        set_profile(self.manager, hourly_rate=30, is_manager=True)
        self.future = date.today() + timedelta(days=4)

    def authenticate(self, user):
        token = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_approve_sends_email_to_employee(self):
        workday = WorkDay.objects.create(
            employee=self.employee,
            date=self.future,
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.PROPOSED,
        )
        self.authenticate(self.manager)
        response = self.client.post(f'/api/workdays/{workday.id}/approve/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['emp@example.com'])
        self.assertIn('zatwierdzon', mail.outbox[0].subject.lower())

    def test_reject_sends_email_with_reason(self):
        workday = WorkDay.objects.create(
            employee=self.employee,
            date=self.future,
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.PROPOSED,
        )
        self.authenticate(self.manager)
        response = self.client.post(
            f'/api/workdays/{workday.id}/reject/',
            {'rejection_reason': 'Za dużo osób'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Za dużo osób', mail.outbox[0].body)

    def test_swap_create_emails_target(self):
        workday = WorkDay.objects.create(
            employee=self.employee,
            date=self.future,
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.APPROVED,
        )
        self.authenticate(self.employee)
        response = self.client.post('/api/swaps/', {
            'work_day': workday.id,
            'target_user': self.other.id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['other@example.com'])
        self.assertIn('zamian', mail.outbox[0].subject.lower())

    def test_skip_when_user_has_no_email(self):
        bare = User.objects.create_user('bare_mail', password='pass', email='')
        set_profile(bare, hourly_rate=20)
        workday = WorkDay.objects.create(
            employee=bare,
            date=self.future,
            start_time='09:00:00',
            end_time='17:00:00',
            status=WorkDay.Status.PROPOSED,
        )
        self.authenticate(self.manager)
        response = self.client.post(f'/api/workdays/{workday.id}/approve/', {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 0)


class SubscriptionLimitTests(APITestCase):
    def setUp(self):
        from core.subscription import get_or_create_default_organization

        self.manager = User.objects.create_user('mgr_sub', password='pass', email='mgr@ex.com')
        set_profile(self.manager, hourly_rate=30, is_manager=True)
        self.org = get_or_create_default_organization()
        sub = self.org.subscription
        sub.plan = 'basic'
        sub.status = 'active'
        sub.max_managers = 1
        sub.max_employees = 2
        sub.save()

    def authenticate(self, user):
        token = self.client.post('/api/token/', {
            'username': user.username,
            'password': 'pass',
        }).data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_subscription_endpoint(self):
        self.authenticate(self.manager)
        response = self.client.get('/api/subscription/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['plan'], 'basic')
        self.assertEqual(response.data['max_employees'], 2)
        self.assertGreaterEqual(response.data['used_managers'], 1)

    def test_blocks_employee_over_limit(self):
        for i in range(2):
            emp = User.objects.create_user(f'emp_sub_{i}', password='pass', email=f'e{i}@ex.com')
            set_profile(emp, hourly_rate=20)

        self.authenticate(self.manager)
        response = self.client.post('/api/users/', {
            'username': 'emp_overflow',
            'password': 'haslo12345',
            'first_name': 'Overflow',
            'last_name': 'Test',
            'email': 'overflow@ex.com',
            'is_manager': False,
            'hourly_rate': '20',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_blocks_second_manager_on_basic(self):
        self.authenticate(self.manager)
        response = self.client.post('/api/users/', {
            'username': 'mgr_two',
            'password': 'haslo12345',
            'first_name': 'Second',
            'last_name': 'Manager',
            'email': 'mgr2@ex.com',
            'is_manager': True,
            'hourly_rate': '30',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PaymentSessionTests(APITestCase):
    def test_mock_session_and_webhook_activates_plan(self):
        from core.models import Subscription
        from core.subscription import get_or_create_default_organization

        org = get_or_create_default_organization()
        self.assertEqual(org.subscription.plan, 'basic')

        session_resp = self.client.post('/api/payments/session/', {
            'plan': 'extended',
            'email': 'buyer@example.com',
            'company_or_name': 'Firma Test',
            'payment_method': 'blik',
        }, format='json')
        self.assertEqual(session_resp.status_code, status.HTTP_201_CREATED, session_resp.data)
        self.assertEqual(session_resp.data['provider'], 'mock')
        session_id = session_resp.data['session_id']

        webhook = self.client.post('/api/payments/webhook/', {
            'provider': 'mock',
            'session_id': session_id,
            'status': 'paid',
        }, format='json')
        self.assertEqual(webhook.status_code, status.HTTP_200_OK, webhook.data)

        org.subscription.refresh_from_db()
        self.assertEqual(org.subscription.plan, Subscription.Plan.EXTENDED)
        self.assertEqual(org.subscription.status, Subscription.Status.ACTIVE)
        self.assertEqual(org.subscription.max_employees, 100)

    @override_settings(
        PAYMENTS_PROVIDER='stripe',
        STRIPE_SECRET_KEY='sk_test_dummy',
        FRONTEND_URL='http://localhost:3000',
    )
    def test_stripe_session_returns_checkout_url(self):
        from unittest.mock import MagicMock, patch

        fake_checkout = MagicMock()
        fake_checkout.id = 'cs_test_abc123'
        fake_checkout.url = 'https://checkout.stripe.com/c/pay/cs_test_abc123'

        with patch('stripe.checkout.Session.create', return_value=fake_checkout) as create_mock:
            response = self.client.post('/api/payments/session/', {
                'plan': 'basic',
                'email': 'stripe@example.com',
                'company_or_name': 'Stripe Buyer',
            }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['provider'], 'stripe')
        self.assertEqual(response.data['session_id'], 'cs_test_abc123')
        self.assertEqual(
            response.data['checkout_url'],
            'https://checkout.stripe.com/c/pay/cs_test_abc123',
        )
        create_mock.assert_called_once()
        call_kwargs = create_mock.call_args.kwargs
        self.assertEqual(call_kwargs['mode'], 'payment')
        self.assertEqual(call_kwargs['customer_email'], 'stripe@example.com')

    @override_settings(
        PAYMENTS_PROVIDER='stripe',
        STRIPE_SECRET_KEY='sk_test_dummy',
        STRIPE_WEBHOOK_SECRET='whsec_test',
    )
    def test_stripe_webhook_activates_subscription(self):
        from unittest.mock import patch

        from core.models import PaymentSession, Subscription
        from core.subscription import get_or_create_default_organization

        org = get_or_create_default_organization()
        PaymentSession.objects.create(
            session_id='cs_test_paid_1',
            provider='stripe',
            plan='extended',
            status=PaymentSession.Status.PENDING,
            amount='149.00',
            currency='PLN',
            email='paid@example.com',
            company_or_name='Paid Co',
            organization=org,
        )

        event = {
            'type': 'checkout.session.completed',
            'data': {
                'object': {
                    'id': 'cs_test_paid_1',
                    'payment_status': 'paid',
                },
            },
        }

        with patch('stripe.Webhook.construct_event', return_value=event):
            response = self.client.post(
                '/api/payments/webhook/',
                data=b'{"id":"evt_test"}',
                content_type='application/json',
                HTTP_STRIPE_SIGNATURE='t=1,v1=fake',
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        org.subscription.refresh_from_db()
        self.assertEqual(org.subscription.plan, Subscription.Plan.EXTENDED)
        self.assertEqual(org.subscription.status, Subscription.Status.ACTIVE)
