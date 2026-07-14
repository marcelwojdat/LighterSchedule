from datetime import datetime, date
import calendar

from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.contrib.auth.models import User
from django.db.models import Q
from django.utils import timezone

from .models import TaskType, WorkDay, SwapRequest, EmployeeProfile
from .permissions import is_manager, IsManager
from .serializers import (
    TaskTypeSerializer,
    WorkDaySerializer,
    SwapRequestSerializer,
    UserSerializer,
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
@permission_classes([IsAuthenticated])
def current_user(request):
    user = User.objects.select_related('profile').get(pk=request.user.pk)
    return Response(UserSerializer(user, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response({'error': 'Podaj login i hasło'}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username=username).exists():
        return Response({'error': 'Użytkownik już istnieje'}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=username, password=password)
    EmployeeProfile.objects.create(user=user)

    return Response({'message': 'Zarejestrowano pomyślnie'}, status=status.HTTP_201_CREATED)


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.select_related('profile').all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['patch'], permission_classes=[IsAuthenticated, IsManager])
    def profile(self, request, pk=None):
        user = self.get_object()
        hourly_rate = request.data.get('hourly_rate')

        if hourly_rate is None:
            return Response(
                {'error': 'Podaj stawkę godzinową (hourly_rate).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.profile.hourly_rate = hourly_rate
        user.profile.save()

        return Response(UserSerializer(user, context={'request': request}).data)


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

        if is_manager(user):
            employee = serializer.validated_data.get('employee', user)
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

        if start_time:
            workday.start_time = start_time
        if end_time:
            workday.end_time = end_time
        if role is not None:
            workday.role_id = role if role else None

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
        'work_day', 'work_day__employee', 'requested_by', 'target_user',
    ).all()
    serializer_class = SwapRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return SwapRequest.objects.none()

        queryset = SwapRequest.objects.select_related(
            'work_day', 'work_day__employee', 'requested_by', 'target_user',
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
        if WorkDay.objects.filter(employee=swap.target_user, date=work_day.date).exists():
            return Response(
                {'error': 'Docelowy pracownik ma już wpis w grafiku na ten dzień.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        work_day.employee = swap.target_user
        work_day.rate_at_time = swap.target_user.profile.hourly_rate
        work_day.save()

        swap.approved_by_manager = True
        swap.save()

        return Response(SwapRequestSerializer(swap).data)
