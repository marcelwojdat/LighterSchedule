"""Small helpers that create valid objects with sensible defaults for tests."""

from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone

from core.models import EmployeeProfile, Organization, ShiftTemplate, ShiftTemplateHours, TaskType, WorkDay

PASSWORD = 'Bezpieczne#Haslo1'


def future_date(days=10):
    return timezone.localdate() + timedelta(days=days)


def make_organization(name='Firma testowa'):
    return Organization.objects.create(name=name)


def make_user(organization, username, *, manager=False, hourly_rate='0', **fields):
    fields.setdefault('email', f'{username}@example.com')
    user = User.objects.create_user(username=username, password=PASSWORD, **fields)
    EmployeeProfile.objects.create(
        user=user,
        organization=organization,
        is_manager=manager,
        hourly_rate=Decimal(hourly_rate),
    )
    return user


def make_task_type(organization, name='Kasa'):
    return TaskType.objects.create(organization=organization, name=name)


def make_shift_template(organization, name='Poranna', *, start=time(8), end=time(16), weekdays=range(7), max_slots=1):
    template = ShiftTemplate.objects.create(organization=organization, name=name, max_slots=max_slots)
    ShiftTemplateHours.objects.bulk_create(
        ShiftTemplateHours(template=template, weekday=weekday, start_time=start, end_time=end)
        for weekday in weekdays
    )
    return template


def make_workday(employee, work_date=None, *, start=time(8), end=time(16), status=WorkDay.Status.APPROVED, **fields):
    return WorkDay.objects.create(
        employee=employee,
        date=work_date or future_date(),
        start_time=start,
        end_time=end,
        status=status,
        **fields,
    )
