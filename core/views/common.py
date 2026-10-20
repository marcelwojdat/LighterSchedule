"""Helpers shared by the view modules."""
import calendar
from datetime import date, datetime
from decimal import Decimal

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..permissions import IsManager

MANAGER_WRITE_ACTIONS = ('create', 'update', 'partial_update', 'destroy')
INVALID_MONTH_MESSAGE = 'Nieprawidłowy format miesiąca. Użyj YYYY-MM.'


def error_response(message, status_code=status.HTTP_400_BAD_REQUEST):
    return Response({'error': message}, status=status_code)


def parse_month(value):
    """Parse 'YYYY-MM' into (year, month, first_day, last_day). Raises ValueError."""
    year_str, month_str = (value or '').split('-')
    year, month = int(year_str), int(month_str)
    last_day = calendar.monthrange(year, month)[1]
    return year, month, date(year, month, 1), date(year, month, last_day)


def workday_hours(workday):
    duration = datetime.combine(workday.date, workday.end_time) - datetime.combine(workday.date, workday.start_time)
    return Decimal(duration.total_seconds()) / Decimal(3600)


class ManagerWritesMixin:
    """Everyone in the organization may read; only managers create, edit and delete."""

    def get_permissions(self):
        if self.action in MANAGER_WRITE_ACTIONS:
            return [IsAuthenticated(), IsManager()]
        return super().get_permissions()
