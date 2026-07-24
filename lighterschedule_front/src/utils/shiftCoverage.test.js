import { getDayShiftCoverage } from './shiftCoverage';

const saturday = '2026-07-25'; // Saturday

const templates = [
  {
    id: 1,
    name: 'Poranna',
    is_active: true,
    max_slots: 1,
    hours: [{ weekday: 5, start_time: '06:00:00', end_time: '14:00:00' }],
  },
  {
    id: 2,
    name: 'Wieczorna',
    is_active: true,
    max_slots: 1,
    hours: [{ weekday: 5, start_time: '14:00:00', end_time: '22:00:00' }],
  },
];

describe('getDayShiftCoverage', () => {
  test('returns none when no templates for weekday', () => {
    const monday = '2026-07-20';
    expect(getDayShiftCoverage(monday, templates, []).status).toBe('none');
  });

  test('open when no approved workdays', () => {
    const result = getDayShiftCoverage(saturday, templates, []);
    expect(result.status).toBe('open');
    expect(result.tooltip).toBe('Poranna 0/1 · Wieczorna 0/1');
  });

  test('open when only one of two templates filled', () => {
    const result = getDayShiftCoverage(saturday, templates, [
      { date: saturday, shift_template: 1 },
    ]);
    expect(result.status).toBe('open');
    expect(result.tooltip).toBe('Poranna 1/1 · Wieczorna 0/1');
  });

  test('closed when all templates filled', () => {
    const result = getDayShiftCoverage(saturday, templates, [
      { date: saturday, shift_template: 1 },
      { date: saturday, shift_template: 2 },
    ]);
    expect(result.status).toBe('closed');
    expect(result.tooltip).toBe('Poranna 1/1 · Wieczorna 1/1');
  });

  test('respects max_slots greater than 1', () => {
    const multi = [{ ...templates[0], max_slots: 2 }];
    const partial = getDayShiftCoverage(saturday, multi, [
      { date: saturday, shift_template: 1 },
    ]);
    expect(partial.status).toBe('open');
    expect(partial.tooltip).toBe('Poranna 1/2');

    const full = getDayShiftCoverage(saturday, multi, [
      { date: saturday, shift_template: 1 },
      { date: saturday, shift_template: 1 },
    ]);
    expect(full.status).toBe('closed');
    expect(full.tooltip).toBe('Poranna 2/2');
  });
});
