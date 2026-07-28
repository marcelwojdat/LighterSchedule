import { runMockPayment, readMockOrder } from './mockPayment';

describe('mockPayment', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stores a paid mock order and returns orderId', async () => {
    const result = await runMockPayment({
      planId: 'basic',
      email: 'buyer@example.com',
      paymentMethod: 'blik',
    });

    expect(result.provider).toBe('mock');
    expect(result.status).toBe('paid');
    expect(result.orderId).toMatch(/^mock_/);
    expect(readMockOrder()?.email).toBe('buyer@example.com');
  });
});
