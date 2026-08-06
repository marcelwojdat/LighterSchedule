"""Plan limits and seat enforcement for the default organization."""

from django.contrib.auth.models import User
from django.db import transaction

from .models import Organization, OrganizationMembership, Subscription

PLAN_LIMITS = {
    Subscription.Plan.BASIC: {
        'managers': 1,
        'employees': 10,
        'price_pln': '39.99',
        'name': 'Basic',
    },
    Subscription.Plan.EXTENDED: {
        'managers': 2,
        'employees': 100,
        'price_pln': '48.99',
        'name': 'Extended',
    },
}


def get_or_create_default_organization():
    org, _created = Organization.objects.get_or_create(
        pk=1,
        defaults={'name': 'ProstyGrafik'},
    )
    Subscription.objects.get_or_create(
        organization=org,
        defaults={
            'plan': Subscription.Plan.BASIC,
            'status': Subscription.Status.TRIAL,
            'max_managers': PLAN_LIMITS[Subscription.Plan.BASIC]['managers'],
            'max_employees': PLAN_LIMITS[Subscription.Plan.BASIC]['employees'],
        },
    )
    return org


def ensure_user_membership(user, organization=None):
    if user is None:
        return None
    org = organization or get_or_create_default_organization()
    membership, _ = OrganizationMembership.objects.get_or_create(
        user=user,
        defaults={'organization': org},
    )
    return membership


def organization_for_user(user):
    membership = getattr(user, 'membership', None)
    if membership is not None:
        return membership.organization
    ensure_user_membership(user)
    user.refresh_from_db()
    return user.membership.organization


def count_active_seats(organization):
    members = User.objects.filter(
        is_active=True,
        membership__organization=organization,
    ).select_related('profile')
    managers = 0
    employees = 0
    for user in members:
        profile = getattr(user, 'profile', None)
        if profile and profile.is_manager:
            managers += 1
        else:
            employees += 1
    return {'managers': managers, 'employees': employees}


def subscription_snapshot(organization=None):
    org = organization or get_or_create_default_organization()
    sub = org.subscription
    seats = count_active_seats(org)
    return {
        'organization_id': org.id,
        'organization_name': org.name,
        'plan': sub.plan,
        'plan_name': PLAN_LIMITS.get(sub.plan, {}).get('name', sub.plan),
        'status': sub.status,
        'max_managers': sub.max_managers,
        'max_employees': sub.max_employees,
        'used_managers': seats['managers'],
        'used_employees': seats['employees'],
        'external_payment_id': sub.external_payment_id,
    }


def assert_can_add_seat(organization, *, as_manager, exclude_user_id=None):
    """
    Raise ValueError (Polish) when the org has no free seat for the role.
    exclude_user_id: when promoting/reactivating an existing member.
    """
    sub = organization.subscription
    members = User.objects.filter(
        is_active=True,
        membership__organization=organization,
    ).select_related('profile')
    if exclude_user_id:
        members = members.exclude(pk=exclude_user_id)

    managers = 0
    employees = 0
    for user in members:
        profile = getattr(user, 'profile', None)
        if profile and profile.is_manager:
            managers += 1
        else:
            employees += 1

    if as_manager:
        if managers >= sub.max_managers:
            raise ValueError(
                f'Limit kierowników planu {sub.plan} wyczerpany '
                f'({sub.max_managers}). Przejdź na wyższy plan.'
            )
    else:
        if employees >= sub.max_employees:
            raise ValueError(
                f'Limit pracowników planu {sub.plan} wyczerpany '
                f'({sub.max_employees}). Przejdź na wyższy plan.'
            )


@transaction.atomic
def activate_subscription(organization, plan, *, external_payment_id=''):
    if plan not in PLAN_LIMITS:
        raise ValueError('Nieznany plan.')
    sub = organization.subscription
    sub.plan = plan
    sub.status = Subscription.Status.ACTIVE
    sub.apply_plan_limits()
    if external_payment_id:
        sub.external_payment_id = external_payment_id
    sub.save()
    return sub
