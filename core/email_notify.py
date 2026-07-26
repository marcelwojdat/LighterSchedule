"""Fail-soft email notifications for schedule and swap events."""

import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import send_mail

from .utils import employee_display_name

logger = logging.getLogger(__name__)


def _fmt_time(value):
    if value is None:
        return ''
    if hasattr(value, 'strftime'):
        return value.strftime('%H:%M')
    return str(value)[:5]


def _fmt_hours(workday):
    return f'{_fmt_time(workday.start_time)}-{_fmt_time(workday.end_time)}'


def send_notification_email(to_user, subject, body):
    """
    Send a plain-text email. Skips blank addresses; never raises to callers.
    Returns True when send_mail was attempted successfully.
    """
    if to_user is None:
        return False
    email = (getattr(to_user, 'email', None) or '').strip()
    if not email:
        return False

    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None) or 'noreply@lighterschedule.local'
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=from_email,
            recipient_list=[email],
            fail_silently=False,
        )
        return True
    except Exception:
        logger.exception('Failed to send email to %s (%s)', email, subject)
        return False


def active_managers():
    return User.objects.filter(
        is_active=True,
        profile__is_manager=True,
    ).exclude(email='').distinct()


def notify_workday_approved(workday):
    name = employee_display_name(workday.employee)
    subject = f'Grafik zatwierdzony — {workday.date}'
    body = (
        f'Cześć {name},\n\n'
        f'Twoja deklaracja na {workday.date} ({_fmt_hours(workday)}) została zatwierdzona.\n\n'
        f'— LighterSchedule\n'
    )
    return send_notification_email(workday.employee, subject, body)


def notify_workday_rejected(workday):
    name = employee_display_name(workday.employee)
    reason = (workday.rejection_reason or '').strip()
    reason_line = f'\nPowód: {reason}\n' if reason else '\n'
    subject = f'Deklaracja odrzucona — {workday.date}'
    body = (
        f'Cześć {name},\n\n'
        f'Twoja deklaracja na {workday.date} ({_fmt_hours(workday)}) została odrzucona.'
        f'{reason_line}\n'
        f'Możesz złożyć nową deklarację w aplikacji.\n\n'
        f'— LighterSchedule\n'
    )
    return send_notification_email(workday.employee, subject, body)


def notify_swap_created(swap):
    """Tell the target colleague about a new swap request."""
    target = swap.target_user
    requester = employee_display_name(swap.requested_by)
    day = swap.work_day
    kind = 'dwustronną zamianę' if swap.target_work_day_id else 'przejęcie zmiany'
    subject = f'Prośba o zamianę — {day.date}'
    body = (
        f'Cześć {employee_display_name(target)},\n\n'
        f'{requester} prosi Cię o {kind} na {day.date} ({_fmt_hours(day)}).\n'
        f'Zaakceptuj lub odrzuć prośbę w aplikacji.\n\n'
        f'— LighterSchedule\n'
    )
    return send_notification_email(target, subject, body)


def notify_swap_accepted_by_target(swap):
    """Requester + managers: colleague accepted; awaiting manager approval."""
    day = swap.work_day
    target_name = employee_display_name(swap.target_user)
    requester_name = employee_display_name(swap.requested_by)
    sent = 0

    subject_req = f'Zamiana zaakceptowana przez współpracownika — {day.date}'
    body_req = (
        f'Cześć {requester_name},\n\n'
        f'{target_name} zaakceptował(a) prośbę o zamianę na {day.date} ({_fmt_hours(day)}).\n'
        f'Czeka teraz na zatwierdzenie przez kierownika.\n\n'
        f'— LighterSchedule\n'
    )
    if send_notification_email(swap.requested_by, subject_req, body_req):
        sent += 1

    subject_mgr = f'Zamiana do zatwierdzenia — {day.date}'
    body_mgr = (
        f'Zamiana między {requester_name} a {target_name} na {day.date} '
        f'({_fmt_hours(day)}) czeka na zatwierdzenie.\n\n'
        f'— LighterSchedule\n'
    )
    for manager in active_managers():
        if send_notification_email(manager, subject_mgr, body_mgr):
            sent += 1
    return sent


def notify_swap_manager_decision(swap, *, approved):
    """Notify both parties after manager approve/reject."""
    day = swap.work_day
    reason = (swap.rejection_reason or '').strip()
    reason_line = f'\nPowód: {reason}\n' if reason and not approved else '\n'
    status_pl = 'zatwierdzona' if approved else 'odrzucona'
    subject = f'Zamiana {status_pl} — {day.date}'
    sent = 0
    for user in (swap.requested_by, swap.target_user):
        body = (
            f'Cześć {employee_display_name(user)},\n\n'
            f'Zamiana na {day.date} ({_fmt_hours(day)}) została {status_pl} przez kierownika.'
            f'{reason_line}\n'
            f'— LighterSchedule\n'
        )
        if send_notification_email(user, subject, body):
            sent += 1
    return sent
