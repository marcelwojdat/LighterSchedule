"""Approve proposed WorkDay rows (single + bulk)."""

from django.utils import timezone

from .email_notify import notify_workday_approved
from .models import WorkDay
from .utils import assert_shift_slot_available


def approve_proposed_workday(workday, manager_user):
    """
    Approve a proposed workday as-is (no time/role edits).
    Raises ValueError with a Polish message when approval is not possible.
    """
    if workday is None:
        raise ValueError('Nie znaleziono wpisu.')
    if workday.status != WorkDay.Status.PROPOSED:
        raise ValueError('Można zatwierdzić tylko wpisy oczekujące na akceptację.')

    if workday.shift_template_id:
        assert_shift_slot_available(workday.shift_template, workday.date)

    workday.status = WorkDay.Status.APPROVED
    workday.approved_by = manager_user
    workday.approved_at = timezone.now()
    workday.rejection_reason = ''
    workday.save()
    workday.refresh_from_db()
    notify_workday_approved(workday)
    return workday
