import { buildMonthOptions, formatMonthYearPl, parseMonthValue } from './locale';

describe('locale month helpers', () => {
  it('formats Polish month labels', () => {
    expect(formatMonthYearPl('2026-08')).toBe('Sierpień 2026');
    expect(formatMonthYearPl('2026-01')).toBe('Styczeń 2026');
  });

  it('parses YYYY-MM', () => {
    expect(parseMonthValue('2026-08')).toEqual({ year: 2026, monthIndex: 7 });
    expect(parseMonthValue('bad')).toBeNull();
  });

  it('builds month options including Polish labels', () => {
    const options = buildMonthOptions(0, 0, new Date(2026, 7, 15));
    expect(options.some((o) => o.value === '2026-08' && o.label === 'Sierpień 2026')).toBe(true);
  });
});
