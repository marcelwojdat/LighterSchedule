"""Organization configuration: declaration deadline, task types, rejection reasons, shift templates."""
from datetime import date

from django.db.models import F
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import RejectionReasonTemplate, ScheduleSettings, ShiftTemplate, TaskType
from ..permissions import IsManager, is_manager
from ..serializers import (
    RejectionReasonTemplateSerializer,
    ScheduleSettingsSerializer,
    ShiftTemplateSerializer,
    TaskTypeSerializer,
)
from ..tenancy import OrganizationOwnedMixin, get_user_organization
from .common import ManagerWritesMixin


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


class TaskTypeViewSet(ManagerWritesMixin, OrganizationOwnedMixin, viewsets.ModelViewSet):
    queryset = TaskType.objects.all()
    serializer_class = TaskTypeSerializer


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


class ShiftTemplateViewSet(ManagerWritesMixin, OrganizationOwnedMixin, viewsets.ModelViewSet):
    """
    Shift templates of the organization.

    ?date=YYYY-MM-DD limits the list to templates scheduled that weekday and adds
    that day's hours and slot usage. Employees only see active templates.
    """

    queryset = ShiftTemplate.objects.prefetch_related('hours')
    serializer_class = ShiftTemplateSerializer

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
