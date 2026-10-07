import calendar
from datetime import date, datetime, timedelta
from io import BytesIO

from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import F, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .approval import approve_proposed_workday
from .email_notify import (
    notify_swap_accepted_by_target,
    notify_swap_created,
    notify_swap_manager_decision,
    notify_workday_approved,
    notify_workday_rejected,
)
from .ical import build_workdays_ics, make_calendar_token, resolve_calendar_token
from .models import (
    RejectionReasonTemplate,
    ScheduleSettings,
    ShiftTemplate,
    SwapRequest,
    TaskType,
    WorkDay,
)
from .permissions import IsManager, is_manager
from .schedule_copy import copy_workdays, parse_iso_date
from .serializers import (
    ManagerUserCreateSerializer,
    ProfileUpdateSerializer,
    RegistrationSerializer,
    RejectionReasonTemplateSerializer,
    ScheduleSettingsSerializer,
    ShiftTemplateSerializer,
    SwapRequestSerializer,
    TaskTypeSerializer,
    UserProfileUpdateSerializer,
    UserSerializer,
    WorkDaySerializer,
)
from .tenancy import (
    OrganizationOwnedMixin,
    OrganizationScopedMixin,
    get_user_organization,
    organization_users,
)
from .utils import (
    DECLARATION_DEADLINE_MESSAGE,
    assert_shift_slot_available,
    declaration_deadline_passed,
    find_shift_shortages,
    find_shortages_in_range,
    format_shortage_message,
    remember_rejection_reason,
    serialize_shortage,
)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManager])
def team_stats(request):
    month_value = request.query_params.get('month')
    if not month_value:
        return Response(
            {'error': 'Podaj parametr month w formacie YYYY-MM.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        year_str, month_str = month_value.split('-')
        year = int(year_str)
        month = int(month_str)
        month_start = date(year, month, 1)
        month_end = date(year, month, calendar.monthrange(year, month)[1])
    except (ValueError, TypeError):
        return Response(
            {'error': 'Nieprawidłowy format miesiąca. Użyj YYYY-MM.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    approved_workdays = WorkDay.objects.filter(
        status=WorkDay.Status.APPROVED,
        date__gte=month_start,
        date__lte=month_end,
    ).select_related('employee', 'employee__profile')

    total_hours = 0.0
    total_earnings = 0.0
    for workday in approved_workdays:
        tdelta = datetime.combine(workday.date, workday.end_time) - datetime.combine(
            workday.date, workday.start_time
        )
        hours = tdelta.total_seconds() / 3600
        total_hours += hours
        if workday.rate_at_time:
            total_earnings += hours * float(workday.rate_at_time)

    employee_count = User.objects.filter(profile__is_manager=False).count()
    pending_proposals = WorkDay.objects.filter(
        status=WorkDay.Status.PROPOSED,
        date__gte=month_start,
        date__lte=month_end,
    ).count()

    return Response({
        'month': month_value,
        'employee_count': employee_count,
        'approved_days': approved_workdays.count(),
        'total_hours': round(total_hours, 2),
        'total_earnings': round(total_earnings, 2),
        'pending_proposals': pending_proposals,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManager])
def schedule_holes(request):
    """
    Open shift slots for the next N days (default 7, max 14).
    Helps managers see coverage gaps beyond the tomorrow alert.
    """
    try:
        days = int(request.query_params.get('days', 7))
    except (TypeError, ValueError):
        days = 7
    days = max(1, min(days, 14))

    start = timezone.localdate()
    end = start + timedelta(days=days - 1)
    raw = find_shortages_in_range(start, days)
    items = [serialize_shortage(row) for row in raw]

    return Response({
        'days': days,
        'date_from': start.isoformat(),
        'date_to': end.isoformat(),
        'count': len(items),
        'items': items,
    })


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def schedule_settings(request):
    settings_obj = ScheduleSettings.for_organization(get_user_organization(request.user))

    if request.method == 'GET':
        return Response(ScheduleSettingsSerializer(settings_obj).data)

    if not is_manager(request.user):
        raise PermissionDenied('Tylko kierownik może zmieniać termin deklaracji.')

    serializer = ScheduleSettingsSerializer(settings_obj, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notifications(request):
    user = request.user
    ensure_user_profile(user)
    items = []

    if is_manager(user):
        pending_proposals = WorkDay.objects.filter(status=WorkDay.Status.PROPOSED).count()
        pending_swaps = SwapRequest.objects.filter(
            accepted_by_target=True,
            approved_by_manager=False,
            is_rejected=False,
        ).count()
        if pending_proposals:
            items.append({
                'type': 'proposals',
                'count': pending_proposals,
                'message': f'Masz {pending_proposals} deklaracji do akceptacji.',
            })
        if pending_swaps:
            items.append({
                'type': 'swaps_manager',
                'count': pending_swaps,
                'message': f'Masz {pending_swaps} zamian do zatwierdzenia.',
            })

        tomorrow = timezone.localdate() + timedelta(days=1)
        shortage_needed = 0
        for shortage in find_shift_shortages(tomorrow):
            shortage_needed += shortage['needed']
            items.append({
                'type': 'shortage',
                'count': shortage['needed'],
                'shift_template_id': shortage['shift_template_id'],
                'date': shortage['date'].isoformat(),
                'message': format_shortage_message(shortage),
            })

        total = pending_proposals + pending_swaps + shortage_needed
    else:
        pending_received = SwapRequest.objects.filter(
            target_user=user,
            accepted_by_target=False,
            approved_by_manager=False,
            is_rejected=False,
        ).count()
        rejected_days = WorkDay.objects.filter(
            employee=user,
            status=WorkDay.Status.REJECTED,
            date__gte=timezone.now().date(),
        ).count()
        if pending_received:
            items.append({
                'type': 'swaps_received',
                'count': pending_received,
                'message': f'Masz {pending_received} próśb o zamianę do rozpatrzenia.',
            })
        if rejected_days:
            items.append({
                'type': 'rejected_workdays',
                'count': rejected_days,
                'message': f'Masz {rejected_days} odrzuconych deklaracji — możesz złożyć je ponownie.',
            })
        total = pending_received + rejected_days

    return Response({'total': total, 'items': items})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManager])
def payroll_report(request):
    month_value = request.query_params.get('month')
    if not month_value:
        return Response(
            {'error': 'Podaj parametr month w formacie YYYY-MM.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        year_str, month_str = month_value.split('-')
        year = int(year_str)
        month = int(month_str)
        month_start = date(year, month, 1)
        month_end = date(year, month, calendar.monthrange(year, month)[1])
    except (ValueError, TypeError):
        return Response(
            {'error': 'Nieprawidłowy format miesiąca. Użyj YYYY-MM.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    workdays = WorkDay.objects.filter(
        status=WorkDay.Status.APPROVED,
        date__gte=month_start,
        date__lte=month_end,
    ).select_related('employee', 'employee__profile', 'shift_template')

    per_employee = {}
    for workday in workdays:
        emp = workday.employee
        entry = per_employee.setdefault(emp.id, {
            'name': f'{emp.first_name} {emp.last_name}'.strip() or emp.username,
            'days': 0,
            'hours': 0.0,
            'earnings': 0.0,
            'shifts': set(),
        })
        hours = (
            datetime.combine(workday.date, workday.end_time)
            - datetime.combine(workday.date, workday.start_time)
        ).total_seconds() / 3600
        entry['days'] += 1
        entry['hours'] += hours
        if workday.rate_at_time:
            entry['earnings'] += hours * float(workday.rate_at_time)
        if workday.shift_template_id:
            entry['shifts'].add(workday.shift_template.name)

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    from .pdf_fonts import FONT_BOLD, FONT_REGULAR, polish_paragraph_styles, register_polish_fonts

    register_polish_fonts()
    styles = polish_paragraph_styles()

    from .utils import format_month_year_pl

    month_label = format_month_year_pl(year, month)

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    story = [
        Paragraph(f'ProstyGrafik — raport wypłat — {month_label}', styles['title']),
        Spacer(1, 12),
        Paragraph(
            'Zatwierdzone dni pracy w wybranym miesiącu (łącznie ze zmianami).',
            styles['normal'],
        ),
        Spacer(1, 16),
    ]

    table_data = [['Pracownik', 'Zmiany', 'Dni', 'Godziny', 'Wypłata (zł)']]
    total_hours = 0.0
    total_earnings = 0.0
    for entry in sorted(per_employee.values(), key=lambda item: item['name'].lower()):
        shifts_label = ', '.join(sorted(entry['shifts'])) if entry['shifts'] else '—'
        table_data.append([
            entry['name'],
            shifts_label,
            str(entry['days']),
            f"{entry['hours']:.2f}",
            f"{entry['earnings']:.2f}",
        ])
        total_hours += entry['hours']
        total_earnings += entry['earnings']

    table_data.append(['RAZEM', '', '', f'{total_hours:.2f}', f'{total_earnings:.2f}'])
    table = Table(table_data, colWidths=[140, 120, 45, 70, 90])
    table.setStyle(TableStyle([
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
    ]))
    story.append(table)
    doc.build(story)

    filename = f'wyplaty-{month_value}.pdf'
    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def current_user(request):
    if request.method == 'PATCH':
        serializer = UserProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response(UserSerializer(request.user).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    current_password = request.data.get('current_password')
    new_password = request.data.get('new_password')

    if not current_password or not new_password:
        return Response({'error': 'Podaj obecne i nowe hasło.'}, status=status.HTTP_400_BAD_REQUEST)
    if not request.user.check_password(current_password):
        return Response({'error': 'Obecne hasło jest nieprawidłowe.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        validate_password(new_password, user=request.user)
    except DjangoValidationError as exc:
        return Response({'error': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

    request.user.set_password(new_password)
    request.user.save(update_fields=['password'])
    return Response({'message': 'Hasło zostało zmienione.'})


def _registration_invite_required():
    return (
        not settings.ALLOW_PUBLIC_REGISTRATION
        and bool(settings.REGISTRATION_INVITE_CODE)
    )


def _registration_is_open():
    if settings.ALLOW_PUBLIC_REGISTRATION:
        return True
    return bool(settings.REGISTRATION_INVITE_CODE)


@api_view(['GET'])
@permission_classes([AllowAny])
def registration_status(request):
    return Response({
        'open': _registration_is_open(),
        'invite_required': _registration_invite_required(),
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    """Sign-up creates a new organization with the registering user as its manager."""
    serializer = RegistrationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response({'message': 'Zarejestrowano pomyślnie'}, status=status.HTTP_201_CREATED)


class UserViewSet(
    OrganizationScopedMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.ReadOnlyModelViewSet,
):
    """Colleagues from the same organization. Managers add, edit and remove accounts."""

    queryset = User.objects.select_related('profile').order_by('username')
    organization_lookup = 'profile__organization'

    def get_permissions(self):
        if self.action in ('create', 'destroy', 'profile'):
            return [IsAuthenticated(), IsManager()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'create':
            return ManagerUserCreateSerializer
        return UserSerializer

    @staticmethod
    def _is_last_active_manager(user):
        if not (user.is_active and user.profile.is_manager):
            return False
        other_managers = organization_users(user.profile.organization).filter(
            is_active=True,
            profile__is_manager=True,
        ).exclude(pk=user.pk)
        return not other_managers.exists()

    @staticmethod
    def _has_schedule_history(user):
        return (
            WorkDay.objects.filter(employee=user).exists()
            or SwapRequest.objects.filter(Q(requested_by=user) | Q(target_user=user)).exists()
        )

    def destroy(self, request, *args, **kwargs):
        """Deactivate the account, or delete it for good with ?permanent=1 (only without history)."""
        user = self.get_object()
        permanent = request.query_params.get('permanent', '').lower() in ('1', 'true', 'yes')

        if user == request.user:
            return Response(
                {'error': 'Nie możesz usunąć ani dezaktywować własnego konta.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if self._is_last_active_manager(user):
            return Response(
                {'error': 'Nie można usunąć ani dezaktywować ostatniego aktywnego kierownika.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if permanent:
            if self._has_schedule_history(user):
                return Response(
                    {
                        'error': 'Konto ma historię grafiku lub zamian. Użyj dezaktywacji zamiast trwałego usunięcia.',
                        'can_hard_delete': False,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            username = user.username
            user.delete()
            return Response({'message': f'Usunięto konto „{username}".', 'deleted': True})

        if not user.is_active:
            return Response(
                {'error': 'Konto jest już nieaktywne. Możesz spróbować trwałego usunięcia.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_active = False
        user.save(update_fields=['is_active'])
        return Response(UserSerializer(user).data)

    @action(detail=True, methods=['patch'])
    def profile(self, request, pk=None):
        user = self.get_object()
        serializer = ProfileUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        changes = serializer.validated_data

        is_self = user == request.user
        demoting = changes.get('is_manager') is False
        deactivating = changes.get('is_active') is False

        if is_self and demoting:
            return Response(
                {'error': 'Nie możesz odebrać sobie uprawnień kierownika.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if is_self and deactivating:
            return Response(
                {'error': 'Nie możesz dezaktywować własnego konta.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if (demoting or deactivating) and self._is_last_active_manager(user):
            return Response(
                {'error': 'Firma musi mieć co najmniej jednego aktywnego kierownika.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            profile = user.profile
            for field in ('hourly_rate', 'is_manager'):
                if field in changes:
                    setattr(profile, field, changes[field])
            profile.save()
            if 'is_active' in changes:
                user.is_active = changes['is_active']
                user.save(update_fields=['is_active'])

        return Response(UserSerializer(user).data)

    @action(detail=True, methods=['get'], url_path='swappable-workdays')
    def swappable_workdays(self, request, pk=None):
        """Approved future workdays of a colleague, for picking a two-way swap."""
        colleague = self.get_object()
        if colleague == request.user:
            return Response({'error': 'Wybierz innego pracownika.'}, status=status.HTTP_400_BAD_REQUEST)

        workdays = WorkDay.objects.filter(
            employee=colleague,
            status=WorkDay.Status.APPROVED,
            date__gte=timezone.localdate(),
        ).order_by('date')
        return Response(WorkDaySerializer(workdays, many=True, context={'request': request}).data)


class TaskTypeViewSet(OrganizationOwnedMixin, viewsets.ModelViewSet):
    queryset = TaskType.objects.all()
    serializer_class = TaskTypeSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsManager()]
        return super().get_permissions()


class RejectionReasonTemplateViewSet(OrganizationOwnedMixin, viewsets.ModelViewSet):
    """Quick-pick rejection notes for managers. List shows recently used first."""

    queryset = RejectionReasonTemplate.objects.all()
    serializer_class = RejectionReasonTemplateSerializer
    permission_classes = [IsAuthenticated, IsManager]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action != 'list':
            return queryset
        if self.request.query_params.get('active', '1') == '1':
            queryset = queryset.filter(is_active=True)
        return queryset.order_by(F('last_used_at').desc(nulls_last=True), 'sort_order', 'text')


class ShiftTemplateViewSet(OrganizationOwnedMixin, viewsets.ModelViewSet):
    """
    Shift templates of the organization.

    ?date=YYYY-MM-DD limits the list to templates scheduled that weekday and adds
    that day's hours and slot usage. Employees only see active templates.
    """

    queryset = ShiftTemplate.objects.prefetch_related('hours')
    serializer_class = ShiftTemplateSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsManager()]
        return super().get_permissions()

    def _filter_date(self):
        raw = self.request.query_params.get('date')
        if not raw:
            return None
        try:
            return date.fromisoformat(raw)
        except ValueError:
            return None

    def get_queryset(self):
        queryset = super().get_queryset()
        if not is_manager(self.request.user) or self.request.query_params.get('active') == '1':
            queryset = queryset.filter(is_active=True)

        if self.request.query_params.get('date'):
            work_date = self._filter_date()
            if work_date is None:
                return queryset.none()
            queryset = queryset.filter(hours__weekday=work_date.weekday()).distinct()
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['filter_date'] = self._filter_date()
        return context


class WorkDayViewSet(viewsets.ModelViewSet):
    queryset = WorkDay.objects.all()
    serializer_class = WorkDaySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return WorkDay.objects.none()

        if is_manager(user):
            queryset = WorkDay.objects.all()
        else:
            queryset = WorkDay.objects.filter(employee=user)

        employee_id = self.request.query_params.get('employee')
        status_param = self.request.query_params.get('status')

        if employee_id:
            if is_manager(user):
                queryset = queryset.filter(employee_id=employee_id)
            elif str(user.id) != str(employee_id):
                return WorkDay.objects.none()

        if status_param:
            queryset = queryset.filter(status=status_param)

        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)

        return queryset

    def _ensure_employee_can_declare(self, user):
        if not is_manager(user) and declaration_deadline_passed():
            raise PermissionDenied(DECLARATION_DEADLINE_MESSAGE)

    def perform_create(self, serializer):
        user = self.request.user
        ensure_user_profile(user)
        self._ensure_employee_can_declare(user)

        if is_manager(user):
            employee = serializer.validated_data.get('employee', user)
            ensure_user_profile(employee)
            serializer.save(
                employee=employee,
                status=WorkDay.Status.APPROVED,
                approved_by=user,
                approved_at=timezone.now(),
            )
        else:
            serializer.save(
                employee=user,
                status=WorkDay.Status.PROPOSED,
            )

    def perform_update(self, serializer):
        user = self.request.user
        instance = self.get_object()

        if not is_manager(user):
            self._ensure_employee_can_declare(user)
            if instance.employee != user:
                raise PermissionDenied('Nie możesz edytować cudzego grafiku.')
            if instance.status == WorkDay.Status.APPROVED:
                raise PermissionDenied('Nie możesz edytować zatwierdzonego grafiku.')
            if instance.status == WorkDay.Status.REJECTED:
                serializer.save(
                    status=WorkDay.Status.PROPOSED,
                    approved_by=None,
                    approved_at=None,
                    rejection_reason='',
                )
                return

        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user

        if not is_manager(user):
            self._ensure_employee_can_declare(user)
            if instance.employee != user:
                raise PermissionDenied('Nie możesz usuwać cudzego grafiku.')
            if instance.status == WorkDay.Status.APPROVED:
                raise PermissionDenied('Nie możesz usuwać zatwierdzonego grafiku.')

        instance.delete()

    def _resolve_calendar_user(self, request):
        """Authenticated user, or user id from signed ?token= for calendar feeds."""
        if request.user and request.user.is_authenticated:
            return request.user

        user_id = resolve_calendar_token(request.query_params.get('token'))
        if user_id is None:
            return None
        return User.objects.filter(pk=user_id).first()

    def _approved_export_queryset(self, user, request):
        qs = WorkDay.objects.filter(
            employee=user,
            status=WorkDay.Status.APPROVED,
        ).select_related('role', 'shift_template').order_by('date', 'start_time')

        month_value = request.query_params.get('month')
        if month_value:
            try:
                year_str, month_str = month_value.split('-')
                year = int(year_str)
                month = int(month_str)
                month_start = date(year, month, 1)
                month_end = date(year, month, calendar.monthrange(year, month)[1])
            except (ValueError, TypeError):
                return WorkDay.objects.none()
            return qs.filter(date__gte=month_start, date__lte=month_end)

        return qs.filter(date__gte=timezone.localdate())

    @action(
        detail=False,
        methods=['get'],
        url_path='export.ics',
        permission_classes=[AllowAny],
    )
    def export_ics(self, request):
        user = self._resolve_calendar_user(request)
        if user is None:
            return Response(
                {'error': 'Wymagane logowanie lub poprawny token kalendarza.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        workdays = list(self._approved_export_queryset(user, request))
        calendar_name = f'ProstyGrafik — {user.get_full_name() or user.username}'
        payload = build_workdays_ics(workdays, calendar_name=calendar_name)

        filename = 'grafik.ics'
        month_value = request.query_params.get('month')
        if month_value:
            filename = f'grafik-{month_value}.ics'

        response = HttpResponse(payload, content_type='text/calendar; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['Cache-Control'] = 'no-cache'
        return response

    @action(detail=False, methods=['get'], url_path='calendar-feed', permission_classes=[IsAuthenticated])
    def calendar_feed(self, request):
        """Return a stable subscription URL (token) for Google / Apple Calendar."""
        token = make_calendar_token(request.user.id)
        relative = f'/api/workdays/export.ics/?token={token}'
        absolute = request.build_absolute_uri(relative)
        webcal = absolute.replace('https://', 'webcal://').replace('http://', 'webcal://')
        return Response({
            'token': token,
            'url': absolute,
            'webcal_url': webcal,
        })

    @action(detail=False, methods=['post'], url_path='copy', permission_classes=[IsAuthenticated])
    def copy(self, request):
        """
        Duplicate a previous week/month of workdays onto a target period.
        Employees get proposed rows; managers create approved rows for an employee.
        """
        user = request.user
        ensure_user_profile(user)
        manager = is_manager(user)
        if not manager:
            self._ensure_employee_can_declare(user)

        mode = request.data.get('mode')
        if mode not in ('week', 'month'):
            return Response(
                {'error': 'Podaj mode: "week" albo "month".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            source_start = parse_iso_date(request.data.get('source_start'), 'source_start')
            target_start = parse_iso_date(request.data.get('target_start'), 'target_start')
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        on_conflict = request.data.get('on_conflict', 'skip')
        if on_conflict not in ('skip', 'overwrite'):
            return Response(
                {'error': 'on_conflict musi być "skip" albo "overwrite".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if manager:
            employee_id = request.data.get('employee')
            if not employee_id:
                return Response(
                    {'error': 'Podaj pracownika (employee), którego grafik kopiujesz.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                employee = User.objects.get(pk=employee_id)
            except (User.DoesNotExist, TypeError, ValueError):
                return Response(
                    {'error': 'Nie znaleziono pracownika.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            ensure_user_profile(employee)
        else:
            employee = user

        try:
            result = copy_workdays(
                employee=employee,
                mode=mode,
                source_start=source_start,
                target_start=target_start,
                as_manager=manager,
                manager_user=user if manager else None,
                on_conflict=on_conflict,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='bulk-approve', permission_classes=[IsAuthenticated, IsManager])
    def bulk_approve(self, request):
        """
        Approve many proposed workdays as-is.
        Body: { "ids": [1,2,3] } or { "all": true }.
        Full slots / non-proposed rows are skipped (not a hard 400).
        """
        approve_all = bool(request.data.get('all'))
        raw_ids = request.data.get('ids')

        qs = WorkDay.objects.filter(status=WorkDay.Status.PROPOSED).select_related(
            'employee', 'shift_template', 'role',
        )
        if approve_all:
            workdays = list(qs.order_by('date', 'id'))
        elif isinstance(raw_ids, list) and raw_ids:
            try:
                ids = [int(value) for value in raw_ids]
            except (TypeError, ValueError):
                return Response(
                    {'error': 'ids musi być listą liczb.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            workdays = list(qs.filter(pk__in=ids).order_by('date', 'id'))
        else:
            return Response(
                {'error': 'Podaj ids (lista) albo all: true.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approved = []
        skipped = []
        for workday in workdays:
            try:
                approve_proposed_workday(workday, request.user)
                approved.append(workday.id)
            except ValueError as exc:
                skipped.append({
                    'id': workday.id,
                    'date': workday.date.isoformat(),
                    'employee': workday.employee_id,
                    'reason': str(exc),
                })

        return Response({
            'approved': approved,
            'approved_count': len(approved),
            'skipped': skipped,
            'skipped_count': len(skipped),
        })

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManager])
    def approve(self, request, pk=None):
        workday = self.get_object()

        if workday.status != WorkDay.Status.PROPOSED:
            return Response(
                {'error': 'Można zatwierdzić tylko wpisy oczekujące na akceptację.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_time = request.data.get('start_time')
        end_time = request.data.get('end_time')
        role = request.data.get('role')
        note = request.data.get('note')
        shift_template_id = request.data.get('shift_template')

        if shift_template_id is not None:
            if shift_template_id:
                try:
                    template = ShiftTemplate.objects.get(pk=shift_template_id)
                except ShiftTemplate.DoesNotExist:
                    return Response(
                        {'error': 'Nie znaleziono szablonu zmiany.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                hours = template.hours_for_date(workday.date)
                if not hours:
                    return Response(
                        {'error': 'Szablon nie ma godzin na ten dzień tygodnia.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                workday.shift_template = template
                if not start_time:
                    workday.start_time = hours.start_time
                if not end_time:
                    workday.end_time = hours.end_time
            else:
                workday.shift_template = None

        if start_time:
            workday.start_time = start_time
        if end_time:
            workday.end_time = end_time
        if role is not None:
            workday.role_id = role if role else None
        if note is not None:
            workday.note = str(note).strip()[:500]

        if workday.shift_template_id:
            try:
                assert_shift_slot_available(workday.shift_template, workday.date)
            except ValueError as exc:
                return Response(
                    {'error': str(exc)},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        workday.status = WorkDay.Status.APPROVED
        workday.approved_by = request.user
        workday.approved_at = timezone.now()
        workday.rejection_reason = ''
        workday.save()
        workday.refresh_from_db()
        notify_workday_approved(workday)

        return Response(WorkDaySerializer(workday).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManager])
    def reject(self, request, pk=None):
        workday = self.get_object()

        if workday.status != WorkDay.Status.PROPOSED:
            return Response(
                {'error': 'Można odrzucić tylko wpisy oczekujące na akceptację.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workday.status = WorkDay.Status.REJECTED
        workday.rejection_reason = (request.data.get('rejection_reason') or '').strip()
        workday.approved_by = None
        workday.approved_at = None
        workday.save()
        if workday.rejection_reason:
            remember_rejection_reason(workday.rejection_reason)
        notify_workday_rejected(workday)

        return Response(WorkDaySerializer(workday).data)


class SwapRequestViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = SwapRequest.objects.select_related(
        'work_day', 'work_day__employee', 'target_work_day', 'target_work_day__employee',
        'requested_by', 'target_user',
    ).all()
    serializer_class = SwapRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return SwapRequest.objects.none()

        queryset = SwapRequest.objects.select_related(
            'work_day', 'work_day__employee', 'target_work_day', 'target_work_day__employee',
            'requested_by', 'target_user',
        ).all()

        if not is_manager(user):
            queryset = queryset.filter(Q(requested_by=user) | Q(target_user=user))

        pending_manager = self.request.query_params.get('pending_manager')
        if pending_manager == 'true':
            queryset = queryset.filter(
                accepted_by_target=True,
                approved_by_manager=False,
                is_rejected=False,
            )

        return queryset.order_by('-created_at')

    def perform_create(self, serializer):
        if is_manager(self.request.user):
            raise PermissionDenied('Kierownik nie może tworzyć próśb o zamianę.')
        swap = serializer.save(requested_by=self.request.user)
        notify_swap_created(swap)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def accept(self, request, pk=None):
        swap = self.get_object()

        if swap.is_rejected or swap.approved_by_manager:
            return Response({'error': 'Ta prośba nie jest już aktywna.'}, status=status.HTTP_400_BAD_REQUEST)

        if swap.target_user != request.user:
            raise PermissionDenied('Tylko wskazany pracownik może zaakceptować prośbę.')

        if swap.accepted_by_target:
            return Response({'error': 'Prośba została już zaakceptowana.'}, status=status.HTTP_400_BAD_REQUEST)

        swap.accepted_by_target = True
        swap.save()
        notify_swap_accepted_by_target(swap)

        return Response(SwapRequestSerializer(swap).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def reject(self, request, pk=None):
        swap = self.get_object()
        user = request.user

        if swap.is_rejected or swap.approved_by_manager:
            return Response({'error': 'Ta prośba nie jest już aktywna.'}, status=status.HTTP_400_BAD_REQUEST)

        if user == swap.target_user and not swap.accepted_by_target:
            pass
        elif user == swap.requested_by and not swap.accepted_by_target:
            pass
        elif is_manager(user) and swap.accepted_by_target:
            pass
        else:
            raise PermissionDenied('Nie możesz odrzucić tej prośby.')

        manager_reject = is_manager(user) and swap.accepted_by_target
        swap.is_rejected = True
        swap.rejection_reason = (request.data.get('rejection_reason') or '').strip()
        swap.save()
        if manager_reject and swap.rejection_reason:
            remember_rejection_reason(swap.rejection_reason)
        if manager_reject:
            notify_swap_manager_decision(swap, approved=False)

        return Response(SwapRequestSerializer(swap).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManager])
    def approve(self, request, pk=None):
        swap = self.get_object()

        if swap.is_rejected:
            return Response({'error': 'Odrzuconej prośby nie można zatwierdzić.'}, status=status.HTTP_400_BAD_REQUEST)

        if not swap.accepted_by_target:
            return Response(
                {'error': 'Prośba musi zostać najpierw zaakceptowana przez pracownika.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if swap.approved_by_manager:
            return Response({'error': 'Prośba została już zatwierdzona.'}, status=status.HTTP_400_BAD_REQUEST)

        work_day = swap.work_day
        target_profile = ensure_user_profile(swap.target_user)
        requester_profile = ensure_user_profile(swap.requested_by)

        if swap.target_work_day_id:
            target_day = swap.target_work_day
            requester = swap.requested_by
            target = swap.target_user

            if work_day.date != target_day.date:
                conflict_a = WorkDay.objects.filter(
                    employee=target, date=work_day.date,
                ).exclude(pk=target_day.pk).exists()
                conflict_b = WorkDay.objects.filter(
                    employee=requester, date=target_day.date,
                ).exclude(pk=work_day.pk).exists()
                if conflict_a or conflict_b:
                    return Response(
                        {'error': 'Konflikt grafiku — nie można zatwierdzić zamiany.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
        elif WorkDay.objects.filter(employee=swap.target_user, date=work_day.date).exists():
            return Response(
                {'error': 'Docelowy pracownik ma już wpis w grafiku na ten dzień.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            if swap.target_work_day_id:
                target_day = swap.target_work_day
                if work_day.date == target_day.date:
                    # Same day: exchange shift details, keep employees (unique_together).
                    work_day.start_time, target_day.start_time = target_day.start_time, work_day.start_time
                    work_day.end_time, target_day.end_time = target_day.end_time, work_day.end_time
                    work_day.role_id, target_day.role_id = target_day.role_id, work_day.role_id
                    work_day.rate_at_time, target_day.rate_at_time = (
                        target_day.rate_at_time, work_day.rate_at_time
                    )
                else:
                    work_day.employee = swap.target_user
                    work_day.rate_at_time = (
                        target_profile.hourly_rate if target_profile else work_day.rate_at_time
                    )
                    target_day.employee = swap.requested_by
                    target_day.rate_at_time = (
                        requester_profile.hourly_rate if requester_profile else target_day.rate_at_time
                    )
                work_day.save()
                target_day.save()
            else:
                work_day.employee = swap.target_user
                work_day.rate_at_time = (
                    target_profile.hourly_rate if target_profile else work_day.rate_at_time
                )
                work_day.save()

            swap.approved_by_manager = True
            swap.save()

        notify_swap_manager_decision(swap, approved=True)
        return Response(SwapRequestSerializer(swap).data)
