"""Badge counters and messages shown after sign-in."""
from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import SwapRequest, WorkDay
from ..permissions import is_manager
from ..tenancy import get_user_organization
from ..utils import find_shift_shortages, format_shortage_message


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
