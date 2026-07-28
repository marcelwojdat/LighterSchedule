const mockPost = jest.fn();

jest.mock('../../api/client', () => ({
  __esModule: true,
  default: {
    post: (...args) => mockPost(...args),
  },
}));

import { runMockPayment, readMockOrder } from './mockPayment';

describe('mockPayment', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPost.mockReset();
    mockPost.mockImplementation((url, data) => {
      if (url === '/payments/session/') {
        return Promise.resolve({
          data: {
            provider: 'mock',
            session_id: 'mock_testsession',
            status: 'pending',
            plan: data.plan,
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
  });

  it('creates session, completes webhook, and stores order', async () => {
    const result = await runMockPayment({
      planId: 'basic',
      email: 'buyer@example.com',
      companyOrName: 'Firma',
      paymentMethod: 'blik',
    });

    expect(result.provider).toBe('mock');
    expect(result.status).toBe('paid');
    expect(result.orderId).toBe('mock_testsession');
    expect(readMockOrder()?.email).toBe('buyer@example.com');
    expect(mockPost).toHaveBeenCalledTimes(2);
  });
});
