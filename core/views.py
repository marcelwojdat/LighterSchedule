from rest_framework import viewsets, status
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
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]


class TaskTypeViewSet(viewsets.ModelViewSet):
    queryset = TaskType.objects.all()
    serializer_class = TaskTypeSerializer
    permission_classes = [IsAuthenticated]


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


class SwapRequestViewSet(viewsets.ModelViewSet):
    queryset = SwapRequest.objects.all()
    serializer_class = SwapRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return SwapRequest.objects.none()

        if is_manager(user):
            return SwapRequest.objects.all()

        return SwapRequest.objects.filter(Q(requested_by=user) | Q(target_user=user))
