/** Polish locale helpers for dates and month pickers. */

export const MONTHS_PL = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
];

/** Current month as YYYY-MM */
export const currentMonthValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/** Parse YYYY-MM → { year, monthIndex 0–11 } or null */
export const parseMonthValue = (value) => {
  if (!value || typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex };
};

/** YYYY-MM → „Sierpień 2026” */
export const formatMonthYearPl = (value) => {
  const parsed = parseMonthValue(value);
  if (!parsed) return value || '';
  return `${MONTHS_PL[parsed.monthIndex]} ${parsed.year}`;
};

/** Build YYYY-MM options from yearsBack..yearsForward relative to today */
export const buildMonthOptions = (yearsBack = 2, yearsForward = 1, baseDate = new Date()) => {
  const options = [];
  const start = new Date(baseDate.getFullYear() - yearsBack, baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear() + yearsForward, baseDate.getMonth(), 1);
  const cursor = new Date(start);
  while (cursor <= end) {
    const value = currentMonthValue(cursor);
    options.push({
      value,
      label: formatMonthYearPl(value),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return options;
};
