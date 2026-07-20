from datetime import datetime, date
from io import BytesIO
import calendar

from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from .models import TaskType, WorkDay, SwapRequest, EmployeeProfile
from .permissions import is_manager, IsManager
from .serializers import (
    TaskTypeSerializer,
    WorkDaySerializer,
    SwapRequestSerializer,
    UserSerializer,
    UserProfileUpdateSerializer,
    ManagerUserCreateSerializer,
)
from .utils import ensure_user_profile


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
        total = pending_proposals + pending_swaps
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
    ).select_related('employee', 'employee__profile')

    per_employee = {}
    for workday in workdays:
        emp = workday.employee
        entry = per_employee.setdefault(emp.id, {
            'name': f'{emp.first_name} {emp.last_name}'.strip() or emp.username,
            'days': 0,
            'hours': 0.0,
            'earnings': 0.0,
        })
        hours = (
            datetime.combine(workday.date, workday.end_time)
            - datetime.combine(workday.date, workday.start_time)
        ).total_seconds() / 3600
        entry['days'] += 1
        entry['hours'] += hours
        if workday.rate_at_time:
            entry['earnings'] += hours * float(workday.rate_at_time)

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f'Raport wypłat — {month_value}', styles['Title']),
        Spacer(1, 12),
        Paragraph('Zatwierdzone dni pracy w wybranym miesiącu.', styles['Normal']),
        Spacer(1, 16),
    ]

    table_data = [['Pracownik', 'Dni', 'Godziny', 'Wypłata (zł)']]
    total_hours = 0.0
    total_earnings = 0.0
    for entry in sorted(per_employee.values(), key=lambda item: item['name'].lower()):
        table_data.append([
            entry['name'],
            str(entry['days']),
            f"{entry['hours']:.2f}",
            f"{entry['earnings']:.2f}",
        ])
        total_hours += entry['hours']
        total_earnings += entry['earnings']

    table_data.append(['RAZEM', '', f'{total_hours:.2f}', f'{total_earnings:.2f}'])
    table = Table(table_data, colWidths=[220, 60, 80, 100])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.whitesmoke, colors.Color(0.95, 0.96, 0.98)]),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(table)
    doc.build(story)

    filename = f'wypłaty-{month_value}.pdf'
    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def current_user(request):
    ensure_user_profile(request.user)
    user = User.objects.select_related('profile').get(pk=request.user.pk)

    if request.method == 'GET':
        return Response(UserSerializer(user, context={'request': request}).data)

    serializer = UserProfileUpdateSerializer(user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    user.refresh_from_db()
    return Response(UserSerializer(user, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    current_password = request.data.get('current_password')
    new_password = request.data.get('new_password')

    if not current_password or not new_password:
        return Response(
            {'error': 'Podaj obecne i nowe hasło.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not request.user.check_password(current_password):
        return Response(
            {'error': 'Obecne hasło jest nieprawidłowe.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(new_password) < 8:
        return Response(
            {'error': 'Nowe hasło musi mieć co najmniej 8 znaków.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    request.user.set_password(new_password)
    request.user.save()
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
    if not _registration_is_open():
        return Response(
            {'error': 'Rejestracja jest wyłączona. Poproś kierownika o utworzenie konta.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    username = (request.data.get('username') or '').strip()
    password = request.data.get('password')
    first_name = (request.data.get('first_name') or '').strip()
    last_name = (request.data.get('last_name') or '').strip()
    email = (request.data.get('email') or '').strip().lower()
    invite_code = (request.data.get('invite_code') or '').strip()

    if not username or not password:
        return Response(
            {'error': 'Podaj login i hasło'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not first_name or not last_name:
        return Response(
            {'error': 'Podaj imię i nazwisko'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not email:
        return Response(
            {'error': 'Podaj adres e-mail'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if _registration_invite_required() and invite_code != settings.REGISTRATION_INVITE_CODE:
        return Response(
            {'error': 'Nieprawidłowy kod zaproszenia'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {'error': 'Użytkownik już istnieje'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email__iexact=email).exists():
        return Response(
            {'error': 'Konto z tym adresem e-mail już istnieje'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        validate_password(password)
    except DjangoValidationError as exc:
        return Response(
            {'error': ' '.join(exc.messages)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(
        username=username,
        password=password,
        first_name=first_name,
        last_name=last_name,
        email=email,
    )
    EmployeeProfile.objects.get_or_create(user=user)

    return Response({'message': 'Zarejestrowano pomyślnie'}, status=status.HTTP_201_CREATED)


class UserViewSet(
    mixins.CreateModelMixin,
    viewsets.ReadOnlyModelViewSet,
):
    queryset = User.objects.select_related('profile').all().order_by('username')
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action == 'create':
            return [IsAuthenticated(), IsManager()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'create':
            return ManagerUserCreateSerializer
        return UserSerializer

    @action(detail=True, methods=['patch'], permission_classes=[IsAuthenticated, IsManager])
    def profile(self, request, pk=None):
        user = self.get_object()
        data = request.data
        has_rate = 'hourly_rate' in data
        has_manager = 'is_manager' in data
        has_active = 'is_active' in data

        if not has_rate and not has_manager and not has_active:
            return Response(
                {'error': 'Podaj hourly_rate, is_manager lub is_active.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.id == request.user.id and has_manager and not data.get('is_manager'):
            return Response(
                {'error': 'Nie możesz odebrać sobie uprawnień kierownika.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if user.id == request.user.id and has_active and data.get('is_active') is False:
            return Response(
                {'error': 'Nie możesz dezaktywować własnego konta.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = ensure_user_profile(user)

        if has_rate:
            profile.hourly_rate = data.get('hourly_rate')
        if has_manager:
            profile.is_manager = bool(data.get('is_manager'))
        profile.save()

        if has_active:
            user.is_active = bool(data.get('is_active'))
            user.save(update_fields=['is_active'])

        return Response(UserSerializer(user, context={'request': request}).data)

    @action(detail=True, methods=['get'], url_path='swappable-workdays')
    def swappable_workdays(self, request, pk=None):
        """Approved future workdays of a colleague — for two-way swap selection."""
        colleague = self.get_object()
        if colleague.id == request.user.id:
            return Response(
                {'error': 'Wybierz innego pracownika.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workdays = WorkDay.objects.filter(
            employee=colleague,
            status=WorkDay.Status.APPROVED,
            date__gte=timezone.now().date(),
        ).order_by('date')
        return Response(WorkDaySerializer(workdays, many=True).data)


class TaskTypeViewSet(viewsets.ModelViewSet):
    queryset = TaskType.objects.all()
    serializer_class = TaskTypeSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), IsManager()]
        return super().get_permissions()


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

    def perform_create(self, serializer):
        user = self.request.user
        ensure_user_profile(user)

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
            if instance.employee != user:
                raise PermissionDenied('Nie możesz usuwać cudzego grafiku.')
            if instance.status == WorkDay.Status.APPROVED:
                raise PermissionDenied('Nie możesz usuwać zatwierdzonego grafiku.')

        instance.delete()

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

        if start_time:
            workday.start_time = start_time
        if end_time:
            workday.end_time = end_time
        if role is not None:
            workday.role_id = role if role else None
        if note is not None:
            workday.note = str(note).strip()[:500]

        workday.status = WorkDay.Status.APPROVED
        workday.approved_by = request.user
        workday.approved_at = timezone.now()
        workday.rejection_reason = ''
        workday.save()
        workday.refresh_from_db()

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
        workday.rejection_reason = request.data.get('rejection_reason', '')
        workday.approved_by = None
        workday.approved_at = None
        workday.save()

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
        serializer.save(requested_by=self.request.user)

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

        swap.is_rejected = True
        swap.rejection_reason = request.data.get('rejection_reason', '')
        swap.save()

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

        return Response(SwapRequestSerializer(swap).data)
