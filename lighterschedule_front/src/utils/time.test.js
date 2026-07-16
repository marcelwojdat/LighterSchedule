import { buildWorkdayPayload, toApiTime } from './time';

describe('toApiTime', () => {
  test('adds seconds to HH:MM', () => {
    expect(toApiTime('12:00')).toBe('12:00:00');
  });

  test('keeps HH:MM:SS unchanged', () => {
    expect(toApiTime('12:00:00')).toBe('12:00:00');
  });

  test('does not produce HH:MM:SS:00', () => {
    expect(toApiTime('12:00:00')).not.toBe('12:00:00:00');
  });
});

describe('buildWorkdayPayload', () => {
  test('omits empty role', () => {
    expect(
      buildWorkdayPayload({
        date: '2026-07-20',
        start_time: '12:00',
        end_time: '20:00',
        role: null,
      })
    ).toEqual({
      date: '2026-07-20',
      start_time: '12:00:00',
      end_time: '20:00:00',
    });
  });

  test('includes role and employee when provided', () => {
    expect(
      buildWorkdayPayload({
        date: '2026-07-20',
        start_time: '09:00:00',
        end_time: '17:00',
        role: 2,
        employee: 5,
      })
    ).toEqual({
      date: '2026-07-20',
      start_time: '09:00:00',
      end_time: '17:00:00',
      role: 2,
      employee: 5,
    });
  });
});
