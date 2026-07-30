"""Payment session helpers: mock provider + Stripe Checkout."""

import secrets
from decimal import Decimal

from django.conf import settings
from django.utils import timezone

from .models import PaymentSession, Subscription
from .subscription import PLAN_LIMITS, activate_subscription, get_or_create_default_organization


def payments_provider():
    return (getattr(settings, 'PAYMENTS_PROVIDER', 'mock') or 'mock').strip().lower()


def frontend_base_url():
    return (getattr(settings, 'FRONTEND_URL', None) or 'http://localhost:3000').rstrip('/')


def _stripe_secret_key():
    return (getattr(settings, 'STRIPE_SECRET_KEY', '') or '').strip()


def create_payment_session(*, plan, email, company_or_name, nip='', payment_method=''):
    if plan not in PLAN_LIMITS:
        raise ValueError('Nieznany plan. Wybierz basic lub extended.')

    provider = payments_provider()
    if provider not in ('mock', 'stripe'):
        raise ValueError('Nieobsługiwany dostawca płatności.')

    org = get_or_create_default_organization()
    amount = Decimal(PLAN_LIMITS[plan]['price_pln'])
    plan_name = PLAN_LIMITS[plan]['name']

    if provider == 'stripe':
        return _create_stripe_session(
            plan=plan,
            plan_name=plan_name,
            email=email,
            company_or_name=company_or_name,
            nip=nip,
            payment_method=payment_method,
            amount=amount,
            org=org,
        )

    session_id = f'mock_{secrets.token_urlsafe(12)}'
    session = PaymentSession.objects.create(
        session_id=session_id,
        provider='mock',
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

    return {
        'provider': 'mock',
        'session_id': session.session_id,
        'status': session.status,
        'plan': session.plan,
        'amount': str(session.amount),
        'currency': session.currency,
        'organization_id': org.id,
        'checkout_url': None,
        'mock_complete_hint': (
            'POST /api/payments/webhook/ with provider=mock, session_id, status=paid'
        ),
    }


def _create_stripe_session(*, plan, plan_name, email, company_or_name, nip, payment_method, amount, org):
    secret = _stripe_secret_key()
    if not secret:
        raise ValueError(
            'Brak STRIPE_SECRET_KEY. Ustaw klucz w .env albo przełącz PAYMENTS_PROVIDER=mock.'
        )

    import stripe

    stripe.api_key = secret
    local_id = f'stripe_pending_{secrets.token_urlsafe(10)}'
    session = PaymentSession.objects.create(
        session_id=local_id,
        provider='stripe',
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

    unit_amount = int(amount * 100)
    success_url = (
        f'{frontend_base_url()}/checkout/success'
        f'?plan={plan}&session_id={{CHECKOUT_SESSION_ID}}'
    )
    cancel_url = (
        f'{frontend_base_url()}/checkout/cancel'
        f'?plan={plan}&reason=canceled'
    )

    payment_method_types = ['card']

    try:
        checkout = stripe.checkout.Session.create(
            mode='payment',
            customer_email=email,
            line_items=[{
                'price_data': {
                    'currency': 'pln',
                    'unit_amount': unit_amount,
                    'product_data': {
                        'name': f'LighterSchedule {plan_name}',
                        'description': 'Abonament miesięczny',
                    },
                },
                'quantity': 1,
            }],
            success_url=success_url,
            cancel_url=cancel_url,
            client_reference_id=str(org.id),
            metadata={
                'plan': plan,
                'ls_local_id': local_id,
                'organization_id': str(org.id),
                'company_or_name': company_or_name[:120],
                'nip': (nip or '')[:20],
                'payment_method': (payment_method or '')[:20],
            },
            payment_method_types=payment_method_types,
            locale='pl',
        )
    except Exception as exc:
        session.status = PaymentSession.Status.FAILED
        session.save(update_fields=['status'])
        raise ValueError(f'Nie udało się utworzyć sesji Stripe: {exc}') from exc

    session.session_id = checkout.id
    session.save(update_fields=['session_id'])

    return {
        'provider': 'stripe',
        'session_id': session.session_id,
        'status': session.status,
        'plan': session.plan,
        'amount': str(session.amount),
        'currency': session.currency,
        'organization_id': org.id,
        'checkout_url': checkout.url,
    }


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
        session.status = (
            PaymentSession.Status.CANCELED if status == 'canceled' else PaymentSession.Status.FAILED
        )
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


def handle_stripe_webhook(*, payload: bytes, signature: str):
    """Verify Stripe signature and activate subscription on checkout.session.completed."""
    secret = (getattr(settings, 'STRIPE_WEBHOOK_SECRET', '') or '').strip()
    if not secret:
        raise ValueError('Brak STRIPE_WEBHOOK_SECRET — webhook Stripe nie jest skonfigurowany.')

    import stripe

    stripe.api_key = _stripe_secret_key()
    try:
        event = stripe.Webhook.construct_event(payload, signature, secret)
    except ValueError as exc:
        raise ValueError('Nieprawidłowy payload webhook Stripe.') from exc
    except Exception as exc:
        # stripe.error.SignatureVerificationError
        raise ValueError(f'Nie udało się zweryfikować podpisu Stripe: {exc}') from exc

    event_type = event['type'] if isinstance(event, dict) else event.type
    data_object = event['data']['object'] if isinstance(event, dict) else event.data.object

    if event_type == 'checkout.session.completed':
        session_id = data_object['id'] if isinstance(data_object, dict) else data_object.id
        payment_status = (
            data_object.get('payment_status')
            if isinstance(data_object, dict)
            else getattr(data_object, 'payment_status', None)
        )
        if payment_status and payment_status != 'paid':
            return complete_payment_session(
                provider='stripe',
                session_id=session_id,
                status='failed',
            )
        return complete_payment_session(
            provider='stripe',
            session_id=session_id,
            status='paid',
        )

    if event_type in ('checkout.session.expired', 'checkout.session.async_payment_failed'):
        session_id = data_object['id'] if isinstance(data_object, dict) else data_object.id
        status_name = 'canceled' if 'expired' in event_type else 'failed'
        try:
            return complete_payment_session(
                provider='stripe',
                session_id=session_id,
                status=status_name,
            )
        except ValueError:
            return {'ignored': True, 'type': event_type}

    return {'ignored': True, 'type': event_type}
