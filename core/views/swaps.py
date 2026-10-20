"""Shift swaps between employees."""
from django.db import transaction
from django.db.models import Q
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..email_notify import notify_swap_accepted_by_target, notify_swap_created, notify_swap_manager_decision
from ..models import SwapRequest, WorkDay
from ..permissions import IsManager, is_manager
from ..serializers import SwapRequestSerializer
from ..tenancy import OrganizationScopedMixin
from ..utils import remember_rejection_reason
from .common import error_response


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
            return error_response('Ta prośba nie jest już aktywna.')
        if swap.target_user != request.user:
            raise PermissionDenied('Tylko wskazany pracownik może zaakceptować prośbę.')
        if swap.accepted_by_target:
            return error_response('Prośba została już zaakceptowana.')

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
            return error_response('Ta prośba nie jest już aktywna.')

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
            return error_response('Odrzuconej prośby nie można zatwierdzić.')
        if not swap.accepted_by_target:
            return error_response('Prośba musi zostać najpierw zaakceptowana przez pracownika.')
        if swap.approved_by_manager:
            return error_response('Prośba została już zatwierdzona.')

        work_day, target_day = swap.work_day, swap.target_work_day
        requester, target = swap.requested_by, swap.target_user

        # The schedule may have changed since the request was created, so check again.
        if target_day is None:
            if WorkDay.objects.filter(employee=target, date=work_day.date).exists():
                return error_response('Docelowy pracownik ma już wpis w grafiku na ten dzień.')
        elif work_day.date != target_day.date:
            if (self._has_conflict(target, work_day.date, target_day)
                    or self._has_conflict(requester, target_day.date, work_day)):
                return error_response('Konflikt grafiku — nie można zatwierdzić zamiany.')

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
