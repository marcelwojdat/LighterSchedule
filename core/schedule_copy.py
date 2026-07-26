"""Copy WorkDay rows from one week/month onto another."""

from datetime import date, timedelta
import calendar

from django.db import transaction
from django.utils import timezone

from .models import WorkDay


def monday_of(day):
    return day - timedelta(days=day.weekday())


def month_bounds_for(day):
    last = calendar.monthrange(day.year, day.month)[1]
    return date(day.year, day.month, 1), date(day.year, day.month, last)


def parse_iso_date(value, field_name='date'):
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f'Niepoprawna data w polu {field_name}.') from exc


def resolve_copy_times(source_day, target_date):
    """
    Return (start_time, end_time, shift_template) for the target date.
    Prefer template hours for the new weekday when a template is set.
    """
    template = source_day.shift_template
    if template is not None:
        hours = template.hours_for_date(target_date)
        if hours is None:
            return None
        return hours.start_time, hours.end_time, template
    return source_day.start_time, source_day.end_time, None


def build_target_pairs(mode, source_start, target_start):
    """Return list of (source_date, target_date) pairs to attempt."""
    if mode == 'week':
        source_monday = monday_of(source_start)
        target_monday = monday_of(target_start)
        return [
            (source_monday + timedelta(days=offset), target_monday + timedelta(days=offset))
            for offset in range(7)
        ]

    if mode == 'month':
        source_from, source_to = month_bounds_for(source_start)
        target_year, target_month = target_start.year, target_start.month
        target_last = calendar.monthrange(target_year, target_month)[1]
        pairs = []
        cursor = source_from
        while cursor <= source_to:
            if cursor.day <= target_last:
                pairs.append((cursor, date(target_year, target_month, cursor.day)))
            cursor += timedelta(days=1)
        return pairs

    raise ValueError('mode musi być "week" albo "month".')


@transaction.atomic
def copy_workdays(
    *,
    employee,
    mode,
    source_start,
    target_start,
    as_manager,
    manager_user=None,
    on_conflict='skip',
    source_statuses=None,
):
    """
    Copy workdays onto target dates.

    Employees get PROPOSED rows; managers get APPROVED rows.
    Default on_conflict=skip leaves existing target days untouched.
    """
    if on_conflict not in ('skip', 'overwrite'):
        raise ValueError('on_conflict musi być "skip" albo "overwrite".')

    statuses = source_statuses or [
        WorkDay.Status.APPROVED,
        WorkDay.Status.PROPOSED,
    ]

    pairs = build_target_pairs(mode, source_start, target_start)
    source_dates = [src for src, _tgt in pairs]
    sources = {
        wd.date: wd
        for wd in WorkDay.objects.filter(
            employee=employee,
            date__in=source_dates,
            status__in=statuses,
        ).select_related('shift_template', 'role')
    }

    created, updated, skipped = [], [], []

    for source_date, target_date in pairs:
        source = sources.get(source_date)
        if source is None:
            continue

        resolved = resolve_copy_times(source, target_date)
        if resolved is None:
            skipped.append({
                'date': target_date.isoformat(),
                'reason': 'no_template_hours',
            })
            continue

        start_time, end_time, template = resolved
        existing = WorkDay.objects.filter(employee=employee, date=target_date).first()

        if existing is not None:
            if on_conflict == 'skip':
                skipped.append({'date': target_date.isoformat(), 'reason': 'exists'})
                continue

            if not as_manager and existing.status == WorkDay.Status.APPROVED:
                skipped.append({'date': target_date.isoformat(), 'reason': 'approved'})
                continue

            existing.start_time = start_time
            existing.end_time = end_time
            existing.role = source.role
            existing.shift_template = template
            existing.note = source.note or ''
            if as_manager:
                existing.status = WorkDay.Status.APPROVED
                existing.approved_by = manager_user
                existing.approved_at = timezone.now()
                existing.rejection_reason = ''
            else:
                existing.status = WorkDay.Status.PROPOSED
                existing.approved_by = None
                existing.approved_at = None
                existing.rejection_reason = ''
            existing.save()
            updated.append(target_date.isoformat())
            continue

        kwargs = {
            'employee': employee,
            'date': target_date,
            'start_time': start_time,
            'end_time': end_time,
            'role': source.role,
            'shift_template': template,
            'note': source.note or '',
        }
        if as_manager:
            kwargs.update(
                status=WorkDay.Status.APPROVED,
                approved_by=manager_user,
                approved_at=timezone.now(),
            )
        else:
            kwargs.update(status=WorkDay.Status.PROPOSED)

        WorkDay.objects.create(**kwargs)
        created.append(target_date.isoformat())

    return {
        'created': created,
        'updated': updated,
        'skipped': skipped,
        'created_count': len(created),
        'updated_count': len(updated),
        'skipped_count': len(skipped),
    }
