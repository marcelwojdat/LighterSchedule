"""API views, one module per area. Everything urls.py needs is re-exported here."""
from .accounts import change_password, current_user, register_user
from .configuration import RejectionReasonTemplateViewSet, ShiftTemplateViewSet, TaskTypeViewSet, schedule_settings
from .notifications import notifications
from .reports import payroll_report, schedule_holes, team_stats
from .swaps import SwapRequestViewSet
from .users import UserViewSet
from .workdays import WorkDayViewSet

__all__ = [
    'RejectionReasonTemplateViewSet',
    'ShiftTemplateViewSet',
    'SwapRequestViewSet',
    'TaskTypeViewSet',
    'UserViewSet',
    'WorkDayViewSet',
    'change_password',
    'current_user',
    'notifications',
    'payroll_report',
    'register_user',
    'schedule_holes',
    'schedule_settings',
    'team_stats',
]
