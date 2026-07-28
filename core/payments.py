"""Payment session helpers (mock provider first; Stripe later)."""

import secrets
from decimal import Decimal

from django.conf import settings
from django.utils import timezone

from .models import PaymentSession, Subscription
from .subscription import PLAN_LIMITS, activate_subscription, get_or_create_default_organization


def payments_provider():
    return getattr(settings, 'PAYMENTS_PROVIDER', 'mock') or 'mock'


def create_payment_session(*, plan, email, company_or_name, nip='', payment_method=''):
    if plan not in PLAN_LIMITS:
        raise ValueError('Nieznany plan. Wybierz basic lub extended.')

    provider = payments_provider()
    if provider not in ('mock', 'stripe'):
        raise ValueError('Nieobsługiwany dostawca płatności.')

    org = get_or_create_default_organization()
    amount = Decimal(PLAN_LIMITS[plan]['price_pln'])
    session_id = f'{provider}_{secrets.token_urlsafe(12)}'

    session = PaymentSession.objects.create(
        session_id=session_id,
        provider=provider,
        plan=plan,
        status=PaymentSession.Status.PENDING,
        amount=amount,
        currency='PLN',
        email=email,
        company_or_name=company_or_name,
        nip=nip or '',
        payment_method=payment_method or '',
        organization=org,
    )

    payload = {
        'provider': provider,
        'session_id': session.session_id,
        'status': session.status,
        'plan': session.plan,
        'amount': str(session.amount),
        'currency': session.currency,
        'organization_id': org.id,
    }
    if provider == 'mock':
        payload['checkout_url'] = None
        payload['mock_complete_hint'] = (
            'POST /api/payments/webhook/ with provider=mock, session_id, status=paid'
        )
    else:
        payload['checkout_url'] = None
        payload['message'] = 'Integracja Stripe nie jest jeszcze podłączona.'

    return payload


def complete_payment_session(*, provider, session_id, status='paid'):
    try:
        session = PaymentSession.objects.select_related('organization').get(
            session_id=session_id,
        )
    except PaymentSession.DoesNotExist as exc:
        raise ValueError('Nie znaleziono sesji płatności.') from exc

    if provider and session.provider != provider:
        raise ValueError('Niezgodny dostawca płatności dla tej sesji.')

    if status != 'paid':
        session.status = PaymentSession.Status.CANCELED if status == 'canceled' else PaymentSession.Status.FAILED
        session.save(update_fields=['status'])
        return {
            'session_id': session.session_id,
            'status': session.status,
            'plan': session.plan,
        }

    if session.status == PaymentSession.Status.PAID:
        return {
            'session_id': session.session_id,
            'status': session.status,
            'plan': session.plan,
            'already_paid': True,
        }

    org = session.organization or get_or_create_default_organization()
    activate_subscription(org, session.plan, external_payment_id=session.session_id)
    session.status = PaymentSession.Status.PAID
    session.paid_at = timezone.now()
    session.organization = org
    session.save(update_fields=['status', 'paid_at', 'organization'])

    return {
        'session_id': session.session_id,
        'status': session.status,
        'plan': session.plan,
        'subscription_status': Subscription.Status.ACTIVE,
        'organization_id': org.id,
    }
