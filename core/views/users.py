"""Accounts of the organization, managed by managers."""
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import SwapRequest, WorkDay
from ..permissions import IsManager
from ..serializers import ManagerUserCreateSerializer, ProfileUpdateSerializer, UserSerializer, WorkDaySerializer
from ..tenancy import OrganizationScopedMixin, organization_users
from .common import error_response


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
            return error_response('Nie możesz usunąć ani dezaktywować własnego konta.')
        if self._is_last_active_manager(user):
            return error_response('Nie można usunąć ani dezaktywować ostatniego aktywnego kierownika.')

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
            return error_response('Konto jest już nieaktywne. Możesz spróbować trwałego usunięcia.')
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
            return error_response('Nie możesz odebrać sobie uprawnień kierownika.')
        if is_self and deactivating:
            return error_response('Nie możesz dezaktywować własnego konta.')
        if (demoting or deactivating) and self._is_last_active_manager(user):
            return error_response('Firma musi mieć co najmniej jednego aktywnego kierownika.')

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
            return error_response('Wybierz innego pracownika.')

        workdays = WorkDay.objects.filter(
            employee=colleague,
            status=WorkDay.Status.APPROVED,
            date__gte=timezone.localdate(),
        ).order_by('date')
        return Response(WorkDaySerializer(workdays, many=True, context={'request': request}).data)
