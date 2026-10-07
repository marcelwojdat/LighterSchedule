from datetime import time, timedelta

from django.utils import timezone

from .models import RejectionReasonTemplate, ShiftTemplate, Weekday, WorkDay

DEFAULT_CLOSE_TIME = time(23, 59)

DECLARATION_DEADLINE_MESSAGE = (
    'Okno składania deklaracji jest zamknięte. Od teraz grafik może zmieniać tylko kierownik.'
)

MONTHS_PL = (
    'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
)

# Accusative weekday forms for "W/We …" shortage alerts.
_SHORTAGE_WEEKDAY_LABELS = {
    0: ('W', 'poniedziałek'),
    1: ('We', 'wtorek'),
    2: ('W', 'środę'),
    3: ('W', 'czwartek'),
    4: ('W', 'piątek'),
    5: ('W', 'sobotę'),
    6: ('W', 'niedzielę'),
}


# --- Declaration deadline ----------------------------------------------------

def declaration_close_label(settings_obj):
    """Human-readable weekly close rule, e.g. 'sobota 23:59', or None without a deadline."""
    weekday = settings_obj.declaration_close_weekday
    if weekday is None:
        return None
    day_label = Weekday(weekday).label.lower()
    close_time = settings_obj.declaration_close_time or DEFAULT_CLOSE_TIME
    return f'{day_label} {close_time.strftime("%H:%M")}'


def declaration_deadline_passed(settings_obj, now=None):
    """
    True when the weekly declaration window is closed.

    Each week employees may declare until declaration_close_weekday at
    declaration_close_time (e.g. Saturday 23:59). From then until Monday 00:00
    the window is closed, after which it opens again.
    """
    weekday = settings_obj.declaration_close_weekday
    if weekday is None:
        return False

    current = timezone.localtime(now)
    if current.weekday() != weekday:
        return current.weekday() > weekday

    close_time = settings_obj.declaration_close_time or DEFAULT_CLOSE_TIME
    current_hm = current.time().replace(second=0, microsecond=0)
    return current_hm > close_time.replace(second=0, microsecond=0)


# --- Formatting ----------------------------------------------------------------

def format_month_year_pl(year, month):
    """Return e.g. 'sierpień 2026' for PDF titles."""
    if not 1 <= month <= 12:
        return f'{year}-{month:02d}'
    return f'{MONTHS_PL[month - 1]} {year}'


def employee_display_name(user):
    if user is None:
        return ''
    full = f'{user.first_name} {user.last_name}'.strip()
    return full or user.username


# --- Shift slots -------------------------------------------------------------

def approved_slot_queryset(template, work_date, exclude_workday_id=None):
    """Approved WorkDays occupying a template slot on a given date."""
    if template is None or work_date is None:
        return WorkDay.objects.none()

    queryset = WorkDay.objects.filter(
        shift_template=template,
        date=work_date,
        status=WorkDay.Status.APPROVED,
    ).select_related('employee')
    if exclude_workday_id:
        queryset = queryset.exclude(pk=exclude_workday_id)
    return queryset


def get_shift_slots_info(template, work_date, exclude_workday_id=None):
    """Capacity info for a template on a date, or None without a template."""
    if template is None or work_date is None:
        return None

    holders = [
        {'id': workday.employee_id, 'name': employee_display_name(workday.employee)}
        for workday in approved_slot_queryset(template, work_date, exclude_workday_id)
    ]
    return {
        'max_slots': template.max_slots,
        'filled': len(holders),
        'is_full': len(holders) >= template.max_slots,
        'holders': holders,
    }


def assert_shift_slot_available(template, work_date, exclude_workday_id=None):
    """Raise ValueError (Polish message) when the approved slot limit is reached."""
    info = get_shift_slots_info(template, work_date, exclude_workday_id)
    if info and info['is_full']:
        raise ValueError(f'Zmiana {template.name} jest już obsadzona')


# --- Shortages ---------------------------------------------------------------

def find_shift_shortages(organization, work_date):
    """Active shift templates of the organization with unfilled slots on work_date."""
    if work_date is None:
        return []

    shortages = []
    templates = ShiftTemplate.objects.filter(
        organization=organization,
        is_active=True,
    ).prefetch_related('hours')
    for template in templates:
        hours = template.hours_for_date(work_date)
        if hours is None:
            continue
        info = get_shift_slots_info(template, work_date)
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


def find_shortages_in_range(organization, start_date, days):
    """Shortages from start_date inclusive for `days` calendar days (clamped to 1–14)."""
    if start_date is None:
        return []

    span = max(1, min(int(days), 14))
    items = []
    for offset in range(span):
        items.extend(find_shift_shortages(organization, start_date + timedelta(days=offset)))
    items.sort(key=lambda row: (row['date'], row['start_time'], row['shift_template_name']))
    return items


def serialize_shortage(shortage):
    """API-friendly dict for a shortage row."""
    return {
        'date': shortage['date'].isoformat(),
        'shift_template_id': shortage['shift_template_id'],
        'shift_template_name': shortage['shift_template_name'],
        'needed': shortage['needed'],
        'filled': shortage['filled'],
        'max_slots': shortage['max_slots'],
        'start_time': shortage['start_time'].strftime('%H:%M:%S'),
        'end_time': shortage['end_time'].strftime('%H:%M:%S'),
        'holders': shortage['holders'],
    }


def shortage_day_label(work_date, *, today=None):
    """Relative Polish day label: Jutro / Pojutrze / W poniedziałek / …"""
    if work_date is None:
        return 'Jutro'
    today = today or timezone.localdate()
    delta = (work_date - today).days
    if delta == 1:
        return 'Jutro'
    if delta == 2:
        return 'Pojutrze'
    prefix, name = _SHORTAGE_WEEKDAY_LABELS[work_date.weekday()]
    return f'{prefix} {name}'


def format_shortage_message(shortage, *, day_label=None, today=None):
    """Polish alert line, e.g. 'Jutro brakuje osoby na zmianę: wieczorna.'"""
    if day_label is None:
        day_label = shortage_day_label(shortage.get('date'), today=today)

    name = (shortage.get('shift_template_name') or '').strip().lower()
    needed = int(shortage.get('needed') or 0)
    if needed == 1:
        return f'{day_label} brakuje osoby na zmianę: {name}.'
    return f'{day_label} brakuje {needed} osób na zmianę: {name}.'


# --- Rejection reasons -------------------------------------------------------

def remember_rejection_reason(organization, text):
    """Store a non-empty rejection note as the organization's quick-pick template."""
    cleaned = (text or '').strip()[:255]
    if not cleaned:
        return None

    template, _created = RejectionReasonTemplate.objects.get_or_create(
        organization=organization,
        text=cleaned,
    )
    template.is_active = True
    template.last_used_at = timezone.now()
    template.save(update_fields=['is_active', 'last_used_at'])
    return template
