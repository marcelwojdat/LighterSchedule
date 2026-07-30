import apiClient from '../../api/client';

/**
 * Start checkout: create payment session.
 * - Stripe: returns checkout_url → caller should redirect.
 * - Mock: completes via webhook and stores a local order record.
 */
export const runCheckoutPayment = async (payload) => {
  const session = await apiClient
    .post('/payments/session/', {
      plan: payload.planId,
      email: payload.email,
      company_or_name: payload.companyOrName,
      nip: payload.nip || '',
      payment_method: payload.paymentMethod || '',
    })
    .then((response) => response.data);

  if (session.checkout_url) {
    return {
      redirecting: true,
      provider: session.provider || 'stripe',
      orderId: session.session_id,
      checkoutUrl: session.checkout_url,
      planId: payload.planId,
    };
  }

  const completed = await apiClient
    .post('/payments/webhook/', {
      provider: session.provider || 'mock',
      session_id: session.session_id,
      status: 'paid',
    })
    .then((response) => response.data);

  const record = {
    orderId: completed.session_id || session.session_id,
    provider: session.provider || 'mock',
    status: 'paid',
    planId: payload.planId,
    email: payload.email,
    companyOrName: payload.companyOrName,
    createdAt: new Date().toISOString(),
  };

  try {
    sessionStorage.setItem('ls_mock_checkout_order', JSON.stringify(record));
  } catch {
    // ignore
  }

  return { redirecting: false, ...record };
};

/** @deprecated Use runCheckoutPayment */
export const runMockPayment = runCheckoutPayment;

export const readMockOrder = () => {
  try {
    const raw = sessionStorage.getItem('ls_mock_checkout_order');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
