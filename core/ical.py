"""Minimal iCalendar (.ics) helpers for approved WorkDay export."""

from datetime import datetime, timezone as dt_timezone

from django.core.signing import BadSignature, Signer
from django.utils import timezone

CALENDAR_TOKEN_SALT = 'lighterschedule-calendar-feed'


def make_calendar_token(user_id):
    return Signer(salt=CALENDAR_TOKEN_SALT).sign(str(user_id))


def resolve_calendar_token(token):
    if not token:
        return None
    try:
        return int(Signer(salt=CALENDAR_TOKEN_SALT).unsign(str(token)))
    except (BadSignature, ValueError, TypeError):
        return None


def _ics_escape(value):
    text = str(value or '')
    return (
        text
        .replace('\\', '\\\\')
        .replace(';', '\\;')
        .replace(',', '\\,')
        .replace('\r\n', '\n')
        .replace('\r', '\n')
        .replace('\n', '\\n')
    )


def _format_local(dt_value):
    """Format as floating local datetime (YYYYMMDDTHHMMSS)."""
    return dt_value.strftime('%Y%m%dT%H%M%S')


def _format_utc(dt_value):
    if timezone.is_naive(dt_value):
        dt_value = timezone.make_aware(dt_value, dt_timezone.utc)
    return dt_value.astimezone(dt_timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def workday_summary(workday):
    if workday.shift_template_id and workday.shift_template:
        return f'Zmiana {workday.shift_template.name}'
    return 'Zmiana'


def workday_description(workday):
    parts = []
    if workday.role_id and workday.role:
        parts.append(f'Stanowisko: {workday.role.name}')
    if workday.note and workday.note.strip():
        parts.append(f'Notatka: {workday.note.strip()}')
    return _ics_escape('\n'.join(parts))


def build_workdays_ics(workdays, calendar_name='ProstyGrafik'):
    """Return iCalendar document as a string (CRLF line endings)."""
    now = timezone.now()
    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//ProstyGrafik//PL',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        f'X-WR-CALNAME:{_ics_escape(calendar_name)}',
        'X-WR-TIMEZONE:Europe/Warsaw',
    ]

    for workday in workdays:
        start_dt = datetime.combine(workday.date, workday.start_time)
        end_dt = datetime.combine(workday.date, workday.end_time)
        summary = _ics_escape(workday_summary(workday))
        description = workday_description(workday)
        uid = f'workday-{workday.id}@prostygrafik.pl'

        lines.extend([
            'BEGIN:VEVENT',
            f'UID:{uid}',
            f'DTSTAMP:{_format_utc(now)}',
            f'DTSTART:{_format_local(start_dt)}',
            f'DTEND:{_format_local(end_dt)}',
            f'SUMMARY:{summary}',
        ])
        if description:
            lines.append(f'DESCRIPTION:{description}')
        lines.append('END:VEVENT')

    lines.append('END:VCALENDAR')
    return '\r\n'.join(lines) + '\r\n'
