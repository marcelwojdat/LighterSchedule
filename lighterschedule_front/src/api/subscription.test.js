import { getSubscription } from './subscription';

const mockGet = jest.fn();

jest.mock('./client', () => ({
  __esModule: true,
  default: {
    get: (...args) => mockGet(...args),
  },
}));

describe('getSubscription', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({
      data: {
        plan: 'basic',
        plan_name: 'Basic',
        status: 'trial',
        used_managers: 1,
        max_managers: 1,
        used_employees: 3,
        max_employees: 10,
      },
    });
  });

  it('fetches subscription snapshot', async () => {
    const data = await getSubscription();
    expect(mockGet).toHaveBeenCalledWith('/subscription/');
    expect(data.plan_name).toBe('Basic');
    expect(data.used_employees).toBe(3);
  });
});
