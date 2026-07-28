/** Mock payment provider — replace with Stripe/Przelewy24 session later. */

const STORAGE_KEY = 'ls_mock_checkout_order';

export const runMockPayment = async (payload) => {
  await new Promise((resolve) => setTimeout(resolve, 450));

  const orderId = `mock_${Date.now().toString(36)}`;
  const record = {
    orderId,
    provider: 'mock',
    status: 'paid',
    createdAt: new Date().toISOString(),
    ...payload,
  };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore quota / private mode
  }

  return record;
};

export const readMockOrder = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
