"""Manager reports: monthly team stats, unfilled shifts and the payroll PDF."""
from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from django.http import HttpResponse
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import WorkDay
from ..pdf_fonts import FONT_BOLD, FONT_REGULAR, polish_paragraph_styles
from ..permissions import IsManager
from ..tenancy import get_user_organization, organization_users
from ..utils import find_shortages_in_range, format_month_year_pl, serialize_shortage
from .common import INVALID_MONTH_MESSAGE, error_response, parse_month, workday_hours

MISSING_MONTH_MESSAGE = 'Podaj parametr month w formacie YYYY-MM.'


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManager])
def team_stats(request):
    month_value = request.query_params.get('month')
    if not month_value:
        return error_response(MISSING_MONTH_MESSAGE)
    try:
        _year, _month, first_day, last_day = parse_month(month_value)
    except ValueError:
        return error_response(INVALID_MONTH_MESSAGE)

    organization = get_user_organization(request.user)
    month_workdays = WorkDay.objects.filter(
        employee__profile__organization=organization,
        date__range=(first_day, last_day),
    )
    approved = list(month_workdays.filter(status=WorkDay.Status.APPROVED))

    total_hours = Decimal(0)
    total_earnings = Decimal(0)
    for workday in approved:
        hours = workday_hours(workday)
        total_hours += hours
        total_earnings += hours * (workday.rate_at_time or 0)

    return Response({
        'month': month_value,
        'employee_count': organization_users(organization).filter(
            is_active=True,
            profile__is_manager=False,
        ).count(),
        'approved_days': len(approved),
        'total_hours': round(total_hours, 2),
        'total_earnings': round(total_earnings, 2),
        'pending_proposals': month_workdays.filter(status=WorkDay.Status.PROPOSED).count(),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManager])
def schedule_holes(request):
    """Unfilled shift slots for the next N days (default 7, max 14)."""
    try:
        days = int(request.query_params.get('days', 7))
    except (TypeError, ValueError):
        days = 7
    days = max(1, min(days, 14))

    start = timezone.localdate()
    items = [
        serialize_shortage(row)
        for row in find_shortages_in_range(get_user_organization(request.user), start, days)
    ]
    return Response({
        'days': days,
        'date_from': start.isoformat(),
        'date_to': (start + timedelta(days=days - 1)).isoformat(),
        'count': len(items),
        'items': items,
    })


PAYROLL_TABLE_STYLE = TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), FONT_BOLD),
    ('FONTNAME', (0, 1), (-1, -2), FONT_REGULAR),
    ('FONTNAME', (0, -1), (-1, -1), FONT_BOLD),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.whitesmoke, colors.Color(0.95, 0.96, 0.98)]),
    ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
])


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManager])
def payroll_report(request):
    """Monthly payroll PDF: approved hours and earnings per employee."""
    month_value = request.query_params.get('month')
    if not month_value:
        return error_response(MISSING_MONTH_MESSAGE)
    try:
        year, month, first_day, last_day = parse_month(month_value)
    except ValueError:
        return error_response(INVALID_MONTH_MESSAGE)

    workdays = WorkDay.objects.filter(
        employee__profile__organization=get_user_organization(request.user),
        status=WorkDay.Status.APPROVED,
        date__range=(first_day, last_day),
    ).select_related('employee', 'shift_template')

    per_employee = {}
    for workday in workdays:
        employee = workday.employee
        entry = per_employee.setdefault(employee.id, {
            'name': employee.get_full_name() or employee.username,
            'days': 0,
            'hours': Decimal(0),
            'earnings': Decimal(0),
            'shifts': set(),
        })
        hours = workday_hours(workday)
        entry['days'] += 1
        entry['hours'] += hours
        entry['earnings'] += hours * (workday.rate_at_time or 0)
        if workday.shift_template_id:
            entry['shifts'].add(workday.shift_template.name)

    table_data = [['Pracownik', 'Zmiany', 'Dni', 'Godziny', 'Wypłata (zł)']]
    for entry in sorted(per_employee.values(), key=lambda item: item['name'].lower()):
        table_data.append([
            entry['name'],
            ', '.join(sorted(entry['shifts'])) or '—',
            str(entry['days']),
            f"{entry['hours']:.2f}",
            f"{entry['earnings']:.2f}",
        ])
    total_hours = sum((entry['hours'] for entry in per_employee.values()), Decimal(0))
    total_earnings = sum((entry['earnings'] for entry in per_employee.values()), Decimal(0))
    table_data.append(['RAZEM', '', '', f'{total_hours:.2f}', f'{total_earnings:.2f}'])

    table = Table(table_data, colWidths=[140, 120, 45, 70, 90])
    table.setStyle(PAYROLL_TABLE_STYLE)
    styles = polish_paragraph_styles()
    story = [
        Paragraph(f'ProstyGrafik — raport wypłat — {format_month_year_pl(year, month)}', styles['title']),
        Spacer(1, 12),
        Paragraph('Zatwierdzone dni pracy w wybranym miesiącu (łącznie ze zmianami).', styles['normal']),
        Spacer(1, 16),
        table,
    ]

    buffer = BytesIO()
    SimpleDocTemplate(buffer, pagesize=A4).build(story)
    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="wyplaty-{month_value}.pdf"'
    return response
