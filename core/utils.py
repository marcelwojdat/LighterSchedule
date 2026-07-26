from django.utils import timezone

from .models import EmployeeProfile, ScheduleSettings, WorkDay


def ensure_user_profile(user):
    """Return EmployeeProfile for user, creating a default one if missing."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return None

    profile, _created = EmployeeProfile.objects.get_or_create(user=user)
    return profile


def get_schedule_settings():
    return ScheduleSettings.load()


def declaration_deadline_passed(today=None):
    """True when a deadline is set and local today is after that date."""
    settings_obj = get_schedule_settings()
    deadline = settings_obj.declaration_deadline
    if deadline is None:
        return False
    current = today or timezone.localdate()
    return current > deadline


DECLARATION_DEADLINE_MESSAGE = (
    'Termin składania deklaracji minął. Od teraz grafik może zmieniać tylko kierownik.'
)


def employee_display_name(user):
    if user is None:
        return ''
    full = f'{user.first_name} {user.last_name}'.strip()
    return full or user.username


def approved_slot_queryset(template, work_date, exclude_workday_id=None):
    """Approved WorkDays occupying a template slot on a given date."""
    if template is None or work_date is None:
        return WorkDay.objects.none()

    qs = WorkDay.objects.filter(
        shift_template=template,
        date=work_date,
        status=WorkDay.Status.APPROVED,
    ).select_related('employee')
    if exclude_workday_id:
        qs = qs.exclude(pk=exclude_workday_id)
    return qs


def shift_slot_full_message(template):
    return f'Zmiana {template.name} jest już obsadzona'


def get_shift_slots_info(template, work_date, exclude_workday_id=None):
    """Return capacity info for a template on a date, or None if no template."""
    if template is None or work_date is None:
        return None

    holders_qs = approved_slot_queryset(template, work_date, exclude_workday_id)
    holders = [
        {'id': wd.employee_id, 'name': employee_display_name(wd.employee)}
        for wd in holders_qs
    ]
    filled = len(holders)
    max_slots = template.max_slots
    return {
        'max_slots': max_slots,
        'filled': filled,
        'is_full': filled >= max_slots,
        'holders': holders,
    }


def assert_shift_slot_available(template, work_date, exclude_workday_id=None):
    """
    Raise ValueError with a Polish message if the approved slot limit is reached.
    """
    info = get_shift_slots_info(template, work_date, exclude_workday_id)
    if info and info['is_full']:
        raise ValueError(shift_slot_full_message(template))


def find_shift_shortages(work_date):
    """
    Active templates scheduled that weekday with unfilled approved slots.
    Returns list of dicts: shift_template_id/name, date, needed, filled, max_slots,
    start_time, end_time, holders.
    """
    from .models import ShiftTemplate

    if work_date is None:
        return []

    shortages = []
    templates = ShiftTemplate.objects.filter(is_active=True).prefetch_related('hours')
    for template in templates:
        hours = template.hours_for_date(work_date)
        if hours is None:
            continue
        info = get_shift_slots_info(template, work_date)
        if not info or info['is_full']:
            continue
        needed = info['max_slots'] - info['filled']
        if needed <= 0:
            continue
        shortages.append({
            'shift_template_id': template.id,
            'shift_template_name': template.name,
            'date': work_date,
            'needed': needed,
            'filled': info['filled'],
            'max_slots': info['max_slots'],
            'start_time': hours.start_time,
            'end_time': hours.end_time,
            'holders': info['holders'],
        })
    return shortages


def find_shortages_in_range(start_date, days):
    """Shortages from start_date inclusive for `days` calendar days (1–14)."""
    from datetime import timedelta

    if start_date is None:
        return []
    span = max(1, min(int(days), 14))
    items = []
    for offset in range(span):
        work_date = start_date + timedelta(days=offset)
        items.extend(find_shift_shortages(work_date))
    return items


def serialize_shortage(shortage):
    """API-friendly dict for a shortage row."""
    start = shortage.get('start_time')
    end = shortage.get('end_time')
    work_date = shortage['date']
    return {
        'date': work_date.isoformat() if hasattr(work_date, 'isoformat') else str(work_date),
        'shift_template_id': shortage['shift_template_id'],
        'shift_template_name': shortage['shift_template_name'],
        'needed': shortage['needed'],
        'filled': shortage['filled'],
        'max_slots': shortage['max_slots'],
        'start_time': start.strftime('%H:%M:%S') if hasattr(start, 'strftime') else start,
        'end_time': end.strftime('%H:%M:%S') if hasattr(end, 'strftime') else end,
        'holders': shortage.get('holders') or [],
    }


def format_shortage_message(shortage, *, day_label='Jutro'):
    """Polish alert line, e.g. 'Jutro brakuje osoby na Wieczorną.'"""
    name = shortage['shift_template_name']
    needed = shortage['needed']
    if needed == 1:
        return f'{day_label} brakuje osoby na {name}.'
    return f'{day_label} brakuje {needed} osób na {name}.'


def remember_rejection_reason(text):
    """
    Persist a non-empty rejection note as a quick-pick template and bump last_used_at.
    """
    from .models import RejectionReasonTemplate

    cleaned = (text or '').strip()
    if not cleaned:
        return None
    if len(cleaned) > 255:
        cleaned = cleaned[:255]

    template, _created = RejectionReasonTemplate.objects.get_or_create(
        text=cleaned,
        defaults={'sort_order': 100, 'is_active': True},
    )
    if not template.is_active:
        template.is_active = True
    template.last_used_at = timezone.now()
    template.save(update_fields=['is_active', 'last_used_at'])
    return template
