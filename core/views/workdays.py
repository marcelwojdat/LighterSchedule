"""Schedule entries: declarations, approvals, copying and calendar export."""
from django.contrib.auth.models import User
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from ..approval import approve_proposed_workday
from ..email_notify import notify_workday_rejected
from ..ical import build_workdays_ics, make_calendar_token, resolve_calendar_token
from ..models import ScheduleSettings, WorkDay
from ..permissions import IsManager, is_manager
from ..schedule_copy import copy_workdays, parse_iso_date
from ..serializers import WorkDaySerializer
from ..tenancy import OrganizationScopedMixin, organization_users
from ..utils import DECLARATION_DEADLINE_MESSAGE, declaration_deadline_passed, remember_rejection_reason
from .common import INVALID_MONTH_MESSAGE, error_response, parse_month


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
            return error_response('Wymagane logowanie lub poprawny token kalendarza.', status.HTTP_401_UNAUTHORIZED)

        workdays = WorkDay.objects.filter(
            employee=user,
            status=WorkDay.Status.APPROVED,
        ).select_related('role', 'shift_template').order_by('date', 'start_time')

        month_value = request.query_params.get('month')
        if month_value:
            try:
                _year, _month, first_day, last_day = parse_month(month_value)
            except ValueError:
                return error_response(INVALID_MONTH_MESSAGE)
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
            return error_response('Podaj mode: "week" albo "month".')
        on_conflict = request.data.get('on_conflict', 'skip')
        if on_conflict not in ('skip', 'overwrite'):
            return error_response('on_conflict musi być "skip" albo "overwrite".')
        try:
            source_start = parse_iso_date(request.data.get('source_start'), 'source_start')
            target_start = parse_iso_date(request.data.get('target_start'), 'target_start')
        except ValueError as exc:
            return error_response(str(exc))

        employee = user
        if manager:
            employee_id = request.data.get('employee')
            if not employee_id:
                return error_response('Podaj pracownika (employee), którego grafik kopiujesz.')
            try:
                employee = organization_users(self.get_organization()).get(pk=employee_id)
            except (User.DoesNotExist, TypeError, ValueError):
                return error_response('Nie znaleziono pracownika.')

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
            return error_response(str(exc))
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
                return error_response('ids musi być listą liczb.')
            workdays = list(proposals.filter(pk__in=ids))
        else:
            return error_response('Podaj ids (lista) albo all: true.')

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
            return error_response(str(exc))
        return Response(self.get_serializer(workday).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsManager])
    def reject(self, request, pk=None):
        workday = self.get_object()
        if workday.status != WorkDay.Status.PROPOSED:
            return error_response('Można odrzucić tylko wpisy oczekujące na akceptację.')

        workday.status = WorkDay.Status.REJECTED
        workday.rejection_reason = (request.data.get('rejection_reason') or '').strip()
        workday.approved_by = None
        workday.approved_at = None
        workday.save()
        remember_rejection_reason(self.get_organization(), workday.rejection_reason)
        notify_workday_rejected(workday)
        return Response(self.get_serializer(workday).data)
