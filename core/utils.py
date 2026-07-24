from .models import EmployeeProfile, WorkDay


def ensure_user_profile(user):
    """Return EmployeeProfile for user, creating a default one if missing."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return None

    profile, _created = EmployeeProfile.objects.get_or_create(user=user)
    return profile


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
