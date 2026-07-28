import apiClient from '../../api/client';

/** Create a backend payment session, then complete it via mock webhook. */
export const runMockPayment = async (payload) => {
  const session = await apiClient
    .post('/payments/session/', {
      plan: payload.planId,
      email: payload.email,
      company_or_name: payload.companyOrName,
      nip: payload.nip || '',
      payment_method: payload.paymentMethod || '',
    })
    .then((response) => response.data);

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

  return record;
};

export const readMockOrder = () => {
  try {
    const raw = sessionStorage.getItem('ls_mock_checkout_order');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
