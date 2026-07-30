const mockPost = jest.fn();

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    post: (...args) => mockPost(...args),
  },
}));

import { runCheckoutPayment, runMockPayment, readMockOrder } from './mockPayment';

describe('mockPayment', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPost.mockReset();
  });

  it('creates session, completes webhook, and stores order (mock)', async () => {
    mockPost.mockImplementation((url, data) => {
      if (url === '/payments/session/') {
        return Promise.resolve({
          data: {
            provider: 'mock',
            session_id: 'mock_testsession',
            status: 'pending',
            plan: data.plan,
            checkout_url: null,
          },
        });
      }
      if (url === '/payments/webhook/') {
        return Promise.resolve({
          data: {
            session_id: data.session_id,
            status: 'paid',
            plan: 'basic',
          },
        });
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });

    const result = await runMockPayment({
      planId: 'basic',
      email: 'buyer@example.com',
      companyOrName: 'Firma',
      paymentMethod: 'blik',
    });

    expect(result.redirecting).toBe(false);
    expect(result.provider).toBe('mock');
    expect(result.status).toBe('paid');
    expect(result.orderId).toBe('mock_testsession');
    expect(readMockOrder()?.email).toBe('buyer@example.com');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('returns checkout_url for Stripe without calling webhook', async () => {
    mockPost.mockResolvedValue({
      data: {
        provider: 'stripe',
        session_id: 'cs_test_xyz',
        status: 'pending',
        plan: 'extended',
        checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_xyz',
      },
    });

    const result = await runCheckoutPayment({
      planId: 'extended',
      email: 'stripe@example.com',
      companyOrName: 'Firma',
    });

    expect(result.redirecting).toBe(true);
    expect(result.checkoutUrl).toContain('checkout.stripe.com');
    expect(result.orderId).toBe('cs_test_xyz');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][0]).toBe('/payments/session/');
  });
});
