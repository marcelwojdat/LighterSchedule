"""Accounts of the organization, managed by managers."""
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..email_notify import notify_account_invite
from ..invites import make_set_password_link
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
        if self.action in ('create', 'destroy', 'profile', 'invite'):
            return [IsAuthenticated(), IsManager()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'create':
            return ManagerUserCreateSerializer
        return UserSerializer

    def _send_invite(self, user):
        """E-mail a set-password link; the manager also gets it to pass on if the e-mail goes astray."""
        link = make_set_password_link(user)
        sent = notify_account_invite(user, link, invited_by=self.request.user)
        return {'invite_link': link, 'invite_email_sent': sent}

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()  # its own transaction, so the account exists before the e-mail goes out
        return Response({**serializer.data, **self._send_invite(user)}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def invite(self, request, pk=None):
        """A new invite for an account that has no password yet; earlier links stop working."""
        user = self.get_object()
        if user.has_usable_password():
            # Otherwise a manager could set a password on someone's working account.
            return error_response('To konto ma już hasło. Pracownik może je zmienić po zalogowaniu.')
        if not user.is_active:
            return error_response('Konto jest nieaktywne. Najpierw je aktywuj.')
        # A fresh unusable hash changes the token input, so only the newest link is valid.
        user.set_unusable_password()
        user.save(update_fields=['password'])
        return Response(self._send_invite(user))

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
