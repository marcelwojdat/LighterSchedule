import { getWeekSummary, formatWeekRangeLabel } from './weekSummary';

describe('getWeekSummary', () => {
  const weekStart = '2026-07-20'; // Monday

  const workdays = [
    { date: '2026-07-20', status: 'approved', total_hours: 8 },
    { date: '2026-07-21', status: 'proposed', total_hours: 6 },
    { date: '2026-07-22', status: 'approved', total_hours: 4.5 },
    { date: '2026-07-23', status: 'rejected', total_hours: 8 },
    { date: '2026-07-27', status: 'approved', total_hours: 8 }, // next Monday — out
  ];

  it('sums approved vs pending hours for the week', () => {
    const summary = getWeekSummary(workdays, weekStart);
    expect(summary.weekStart).toBe('2026-07-20');
    expect(summary.weekEnd).toBe('2026-07-26');
    expect(summary.approvedHours).toBe(12.5);
    expect(summary.pendingHours).toBe(6);
    expect(summary.approvedDays).toBe(2);
    expect(summary.pendingDays).toBe(1);
  });

  it('returns zeros when no workdays in week', () => {
    const summary = getWeekSummary([], weekStart);
    expect(summary.approvedHours).toBe(0);
    expect(summary.pendingHours).toBe(0);
  });
});

describe('formatWeekRangeLabel', () => {
  it('formats a readable Polish range', () => {
    const label = formatWeekRangeLabel('2026-07-20', '2026-07-26');
    expect(label).toContain('20');
    expect(label).toContain('26');
  });
});
