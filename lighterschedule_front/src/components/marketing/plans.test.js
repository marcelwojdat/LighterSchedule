import { getPlan, PLANS } from './plans';

describe('plans catalog', () => {
  it('exposes Basic and Extended with PLN prices', () => {
    expect(PLANS.basic.pricePln).toBe(39.99);
    expect(PLANS.extended.pricePln).toBe(48.99);
    expect(PLANS.basic.managers).toBe(1);
    expect(PLANS.basic.employees).toBe(10);
    expect(PLANS.extended.managers).toBe(2);
    expect(PLANS.extended.employees).toBe(100);
  });

  it('resolves plan ids case-insensitively', () => {
    expect(getPlan('BASIC')?.id).toBe('basic');
    expect(getPlan('extended')?.name).toBe('Extended');
    expect(getPlan('unknown')).toBeNull();
  });
});
