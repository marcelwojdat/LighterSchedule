import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal
from io import BytesIO

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import F, Q
from django.http import HttpResponse
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
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
from .pdf_fonts import FONT_BOLD, FONT_REGULAR, polish_paragraph_styles
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
    declaration_deadline_passed,
    find_shift_shortages,
    find_shortages_in_range,
    format_month_year_pl,
    format_shortage_message,
    remember_rejection_reason,
    serialize_shortage,
)

MANAGER_WRITE_ACTIONS = ('create', 'update', 'partial_update', 'destroy')


def _parse_month(value):
    """Parse 'YYYY-MM' into (year, month, first_day, last_day). Raises ValueError."""
    year_str, month_str = (value or '').split('-')
    year, month = int(year_str), int(month_str)
    last_day = calendar.monthrange(year, month)[1]
    return year, month, date(year, month, 1), date(year, month, last_day)


def _workday_hours(workday):
    duration = datetime.combine(workday.date, workday.end_time) - datetime.combine(workday.date, workday.start_time)
    return Decimal(duration.total_seconds()) / Decimal(3600)


def _error(message, status_code=status.HTTP_400_BAD_REQUEST):
    return Response({'error': message}, status=status_code)


# --- Account -----------------------------------------------------------------

@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    """Sign-up creates a new organization with the registering user as its manager."""
    serializer = RegistrationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response({'message': 'Zarejestrowano pomyślnie'}, status=status.HTTP_201_CREATED)


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
        return _error('Podaj obecne i nowe hasło.')
    if not request.user.check_password(current_password):
        return _error('Obecne hasło jest nieprawidłowe.')
    try:
        validate_password(new_password, user=request.user)
    except DjangoValidationError as exc:
        return _error(' '.join(exc.messages))

    request.user.set_password(new_password)
    request.user.save(update_fields=['password'])
    return Response({'message': 'Hasło zostało zmienione.'})


# --- Users -------------------------------------------------------------------

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
            return _error('Nie możesz usunąć ani dezaktywować własnego konta.')
        if self._is_last_active_manager(user):
            return _error('Nie można usunąć ani dezaktywować ostatniego aktywnego kierownika.')

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
            return _error('Konto jest już nieaktywne. Możesz spróbować trwałego usunięcia.')
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
            return _error('Nie możesz odebrać sobie uprawnień kierownika.')
        if is_self and deactivating:
            return _error('Nie możesz dezaktywować własnego konta.')
        if (demoting or deactivating) and self._is_last_active_manager(user):
            return _error('Firma musi mieć co najmniej jednego aktywnego kierownika.')

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
            return _error('Wybierz innego pracownika.')

        workdays = WorkDay.objects.filter(
            employee=colleague,
            status=WorkDay.Status.APPROVED,
            date__gte=timezone.localdate(),
        ).order_by('date')
        return Response(WorkDaySerializer(workdays, many=True, context={'request': request}).data)


# --- Organization configuration ----------------------------------------------

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


class TaskTypeViewSet(OrganizationOwnedMixin, viewsets.ModelViewSet):
    queryset = TaskType.objects.all()
    serializer_class = TaskTypeSerializer

    def get_permissions(self):
        if self.action in MANAGER_WRITE_ACTIONS:
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
        if self.action in MANAGER_WRITE_ACTIONS:
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


# --- Schedule ----------------------------------------------------------------

class WorkDayViewSet(OrganizationScopedMixin, viewsets.ModelViewSet):
    """
    Schedule entries.

    Employees see and declare their own days (as proposals, only while the weekly
    declaration window is open). Managers see the whole organization and their
    entries are approved immediately.
    """

    queryset = WorkDay.objects.select_related('employee', 'role', 'shift_template', 'approved_by')
    serializer_class = WorkDaySerializer
    organization_lookup = 'employee__profile__organization'

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        if not is_manager(self.request.user):
            queryset = queryset.filter(employee=self.request.user)
        if params.get('employee'):
            queryset = queryset.filter(employee_id=params['employee'])
        if params.get('status'):
            queryset = queryset.filter(status=params['status'])
        if params.get('date_from'):
            queryset = queryset.filter(date__gte=params['date_from'])
        if params.get('date_to'):
            queryset = queryset.filter(date__lte=params['date_to'])
        return queryset

    def _ensure_declarations_open(self):
        settings_obj = ScheduleSettings.for_organization(self.get_organization())
        if declaration_deadline_passed(settings_obj):
            raise PermissionDenied(DECLARATION_DEADLINE_MESSAGE)

    def perform_create(self, serializer):
        user = self.request.user
        if is_manager(user):
            serializer.save(status=WorkDay.Status.APPROVED, approved_by=user, approved_at=timezone.now())
            return
        self._ensure_declarations_open()
        serializer.save(status=WorkDay.Status.PROPOSED)

    def perform_update(self, serializer):
        if is_manager(self.request.user):
            serializer.save()
            return

        self._ensure_declarations_open()
        workday = serializer.instance
        if workday.status == WorkDay.Status.APPROVED:
            raise PermissionDenied('Nie możesz edytować zatwierdzonego grafiku.')
        if workday.status == WorkDay.Status.REJECTED:
            # Editing a rejected day resubmits it for approval.
            serializer.save(status=WorkDay.Status.PROPOSED, approved_by=None, approved_at=None, rejection_reason='')
            return
        serializer.save()

    def perform_destroy(self, instance):
        if not is_manager(self.request.user):
            self._ensure_declarations_open()
            if instance.status == WorkDay.Status.APPROVED:
                raise PermissionDenied('Nie możesz usuwać zatwierdzonego grafiku.')
        instance.delete()

    @action(detail=False, methods=['get'], url_path='export.ics', permission_classes=[AllowAny])
    def export_ics(self, request):
        """Approved shifts as iCalendar. Works with a session or a signed ?token= (calendar apps)."""
        if request.user.is_authenticated:
            user = request.user
        else:
            user_id = resolve_calendar_token(request.query_params.get('token'))
            user = User.objects.filter(pk=user_id).first() if user_id else None
        if user is None:
            return _error('Wymagane logowanie lub poprawny token kalendarza.', status.HTTP_401_UNAUTHORIZED)

        workdays = WorkDay.objects.filter(
            employee=user,
            status=WorkDay.Status.APPROVED,
        ).select_related('role', 'shift_template').order_by('date', 'start_time')

        month_value = request.query_params.get('month')
        if month_value:
            try:
                _year, _month, first_day, last_day = _parse_month(month_value)
            except ValueError:
                return _error('Nieprawidłowy format miesiąca. Użyj YYYY-MM.')
            workdays = workdays.filter(date__range=(first_day, last_day))
            filename = f'grafik-{month_value}.ics'
        else:
            workdays = workdays.filter(date__gte=timezone.localdate())
            filename = 'grafik.ics'

        calendar_name = f'ProstyGrafik — {user.get_full_name() or user.username}'
        response = HttpResponse(
            build_workdays_ics(list(workdays), calendar_name=calendar_name),
            content_type='text/calendar; charset=utf-8',
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        response['Cache-Control'] = 'no-cache'
        return response

    @action(detail=False, methods=['get'], url_path='calendar-feed')
    def calendar_feed(self, request):
        """Stable subscription URL (signed token) for Google / Apple Calendar."""
        token = make_calendar_token(request.user.id)
        url = request.build_absolute_uri(f'/api/workdays/export.ics/?token={token}')
        webcal_url = url.replace('https://', 'webcal://').replace('http://', 'webcal://')
        return Response({'token': token, 'url': url, 'webcal_url': webcal_url})

    @action(detail=False, methods=['post'])
    def copy(self, request):
        """
        Duplicate a week or month of workdays onto a target period.

        Employees copy their own days as proposals; managers copy an employee's days as approved.
        """
        user = request.user
        manager = is_manager(user)
        if not manager:
            self._ensure_declarations_open()

        mode = request.data.get('mode')
        if mode not in ('week', 'month'):
            return _error('Podaj mode: "week" albo "month".')
        on_conflict = request.data.get('on_conflict', 'skip')
        if on_conflict not in ('skip', 'overwrite'):
            return _error('on_conflict musi być "skip" albo "overwrite".')
        try:
            source_start = parse_iso_date(request.data.get('source_start'), 'source_start')
            target_start = parse_iso_date(request.data.get('target_start'), 'target_start')
        except ValueError as exc:
            return _error(str(exc))

        employee = user
        if manager:
            employee_id = request.data.get('employee')
            if not employee_id:
                return _error('Podaj pracownika (employee), którego grafik kopiujesz.')
            try:
                employee = organization_users(self.get_organization()).get(pk=employee_id)
            except (User.DoesNotExist, TypeError, ValueError):
                return _error('Nie znaleziono pracownika.')

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
            return _error(str(exc))
        return Response(result)

    @action(detail=False, methods=['post'], url_path='bulk-approve', permission_classes=[IsAuthenticated, IsManager])
    def bulk_approve(self, request):
        """
        Approve many proposals as-is. Body: {"ids": [1, 2, 3]} or {"all": true}.

        Rows that can't be approved (e.g. full shift) are reported as skipped, not as an error.
        """
        proposals = self.get_queryset().filter(status=WorkDay.Status.PROPOSED).order_by('date', 'id')
        raw_ids = request.data.get('ids')

        if request.data.get('all'):
            workdays = list(proposals)
        elif isinstance(raw_ids, list) and raw_ids:
            try:
                ids = [int(value) for value in raw_ids]
            except (TypeError, ValueError):
                return _error('ids musi być listą liczb.')
            workdays = list(proposals.filter(pk__in=ids))
        else:
            return _error('Podaj ids (lista) albo all: true.')

        approved, skipped = [], []
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
        """Approve a proposal, optionally adjusting hours, role, shift template or note first."""
        workday = self.get_object()
        serializer = self.get_serializer(workday, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            # If approval fails (e.g. full shift), the manager's edits are rolled back too.
            with transaction.atomic():
                serializer.save()
                approve_proposed_workday(workday, request.user)
        except ValueError as exc:
            return _error(str(exc))
        return Response(self.get_serializer(workday).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManager])
    def reject(self, request, pk=None):
        workday = self.get_object()
        if workday.status != WorkDay.Status.PROPOSED:
            return _error('Można odrzucić tylko wpisy oczekujące na akceptację.')

        workday.status = WorkDay.Status.REJECTED
        workday.rejection_reason = (request.data.get('rejection_reason') or '').strip()
        workday.approved_by = None
        workday.approved_at = None
        workday.save()
        remember_rejection_reason(self.get_organization(), workday.rejection_reason)
        notify_workday_rejected(workday)
        return Response(self.get_serializer(workday).data)


class SwapRequestViewSet(
    OrganizationScopedMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    Shift swaps: requester -> colleague accepts -> manager approves.

    Employees see swaps they take part in; managers see all swaps of the organization.
    """

    queryset = SwapRequest.objects.select_related(
        'work_day', 'work_day__employee',
        'target_work_day', 'target_work_day__employee',
        'requested_by', 'target_user',
    ).order_by('-created_at')
    serializer_class = SwapRequestSerializer
    organization_lookup = 'requested_by__profile__organization'

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not is_manager(user):
            queryset = queryset.filter(Q(requested_by=user) | Q(target_user=user))
        if self.request.query_params.get('pending_manager') == 'true':
            queryset = queryset.filter(accepted_by_target=True, approved_by_manager=False, is_rejected=False)
        return queryset

    def perform_create(self, serializer):
        swap = serializer.save(requested_by=self.request.user)
        notify_swap_created(swap)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        swap = self.get_object()
        if swap.is_rejected or swap.approved_by_manager:
            return _error('Ta prośba nie jest już aktywna.')
        if swap.target_user != request.user:
            raise PermissionDenied('Tylko wskazany pracownik może zaakceptować prośbę.')
        if swap.accepted_by_target:
            return _error('Prośba została już zaakceptowana.')

        swap.accepted_by_target = True
        swap.save(update_fields=['accepted_by_target'])
        notify_swap_accepted_by_target(swap)
        return Response(self.get_serializer(swap).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Either party may withdraw before acceptance; afterwards only a manager can reject."""
        swap = self.get_object()
        user = request.user
        if swap.is_rejected or swap.approved_by_manager:
            return _error('Ta prośba nie jest już aktywna.')

        party_withdraws = not swap.accepted_by_target and user in (swap.requested_by, swap.target_user)
        manager_rejects = swap.accepted_by_target and is_manager(user)
        if not (party_withdraws or manager_rejects):
            raise PermissionDenied('Nie możesz odrzucić tej prośby.')

        swap.is_rejected = True
        swap.rejection_reason = (request.data.get('rejection_reason') or '').strip()
        swap.save(update_fields=['is_rejected', 'rejection_reason'])
        if manager_rejects:
            remember_rejection_reason(self.get_organization(), swap.rejection_reason)
            notify_swap_manager_decision(swap, approved=False)
        return Response(self.get_serializer(swap).data)

    @staticmethod
    def _reassign(workday, employee):
        workday.employee = employee
        workday.rate_at_time = employee.profile.hourly_rate
        workday.save()

    @staticmethod
    def _has_conflict(employee, work_date, ignore_workday):
        return WorkDay.objects.filter(employee=employee, date=work_date).exclude(pk=ignore_workday.pk).exists()

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManager])
    def approve(self, request, pk=None):
        swap = self.get_object()
        if swap.is_rejected:
            return _error('Odrzuconej prośby nie można zatwierdzić.')
        if not swap.accepted_by_target:
            return _error('Prośba musi zostać najpierw zaakceptowana przez pracownika.')
        if swap.approved_by_manager:
            return _error('Prośba została już zatwierdzona.')

        work_day, target_day = swap.work_day, swap.target_work_day
        requester, target = swap.requested_by, swap.target_user

        # The schedule may have changed since the request was created, so check again.
        if target_day is None:
            if WorkDay.objects.filter(employee=target, date=work_day.date).exists():
                return _error('Docelowy pracownik ma już wpis w grafiku na ten dzień.')
        elif work_day.date != target_day.date:
            if (self._has_conflict(target, work_day.date, target_day)
                    or self._has_conflict(requester, target_day.date, work_day)):
                return _error('Konflikt grafiku — nie można zatwierdzić zamiany.')

        with transaction.atomic():
            if target_day is None:
                self._reassign(work_day, target)
            elif work_day.date == target_day.date:
                # Same day: exchange the shift details, keep employees (one entry per employee per day).
                for field in ('start_time', 'end_time', 'role_id', 'shift_template_id', 'rate_at_time'):
                    mine, theirs = getattr(work_day, field), getattr(target_day, field)
                    setattr(work_day, field, theirs)
                    setattr(target_day, field, mine)
                work_day.save()
                target_day.save()
            else:
                self._reassign(work_day, target)
                self._reassign(target_day, requester)

            swap.approved_by_manager = True
            swap.save(update_fields=['approved_by_manager'])

        notify_swap_manager_decision(swap, approved=True)
        return Response(self.get_serializer(swap).data)


# --- Manager reports ---------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManager])
def team_stats(request):
    month_value = request.query_params.get('month')
    if not month_value:
        return _error('Podaj parametr month w formacie YYYY-MM.')
    try:
        _year, _month, first_day, last_day = _parse_month(month_value)
    except ValueError:
        return _error('Nieprawidłowy format miesiąca. Użyj YYYY-MM.')

    organization = get_user_organization(request.user)
    month_workdays = WorkDay.objects.filter(
        employee__profile__organization=organization,
        date__range=(first_day, last_day),
    )
    approved = list(month_workdays.filter(status=WorkDay.Status.APPROVED))

    total_hours = Decimal(0)
    total_earnings = Decimal(0)
    for workday in approved:
        hours = _workday_hours(workday)
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


def _manager_notifications(organization):
    org_workdays = WorkDay.objects.filter(employee__profile__organization=organization)
    pending_proposals = org_workdays.filter(status=WorkDay.Status.PROPOSED).count()
    pending_swaps = SwapRequest.objects.filter(
        requested_by__profile__organization=organization,
        accepted_by_target=True,
        approved_by_manager=False,
        is_rejected=False,
    ).count()

    items = []
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
    shortages = find_shift_shortages(organization, tomorrow)
    for shortage in shortages:
        items.append({
            'type': 'shortage',
            'count': shortage['needed'],
            'shift_template_id': shortage['shift_template_id'],
            'date': shortage['date'].isoformat(),
            'message': format_shortage_message(shortage),
        })

    total = pending_proposals + pending_swaps + sum(shortage['needed'] for shortage in shortages)
    return total, items


def _employee_notifications(user):
    pending_received = SwapRequest.objects.filter(
        target_user=user,
        accepted_by_target=False,
        approved_by_manager=False,
        is_rejected=False,
    ).count()
    rejected_days = WorkDay.objects.filter(
        employee=user,
        status=WorkDay.Status.REJECTED,
        date__gte=timezone.localdate(),
    ).count()

    items = []
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
    return pending_received + rejected_days, items


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notifications(request):
    if is_manager(request.user):
        total, items = _manager_notifications(get_user_organization(request.user))
    else:
        total, items = _employee_notifications(request.user)
    return Response({'total': total, 'items': items})


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
        return _error('Podaj parametr month w formacie YYYY-MM.')
    try:
        year, month, first_day, last_day = _parse_month(month_value)
    except ValueError:
        return _error('Nieprawidłowy format miesiąca. Użyj YYYY-MM.')

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
        hours = _workday_hours(workday)
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
