import { toPythonWeekday } from './time';

/**
 * Team staffing status for a calendar day based on active shift templates.
 * - closed: every template with hours that weekday has enough approved WorkDays
 * - open: at least one template still has free slots
 * - none: no active templates define hours for that weekday
 */
export const getDayShiftCoverage = (dateStr, templates = [], approvedWorkdays = []) => {
  if (!dateStr) {
    return { status: 'none', tooltip: '', slots: [] };
  }

  const weekday = toPythonWeekday(dateStr);
  const dayTemplates = templates.filter(
    (template) =>
      template?.is_active !== false &&
      Array.isArray(template.hours) &&
      template.hours.some((hour) => Number(hour.weekday) === weekday)
  );

  if (dayTemplates.length === 0) {
    return { status: 'none', tooltip: '', slots: [] };
  }

  const slots = dayTemplates.map((template) => {
    const max = Math.max(1, Number(template.max_slots) || 1);
    const filledRaw = approvedWorkdays.filter(
      (workday) =>
        workday.date === dateStr &&
        workday.shift_template != null &&
        Number(workday.shift_template) === Number(template.id)
    ).length;

    return {
      id: template.id,
      name: template.name,
      filled: Math.min(filledRaw, max),
      filledRaw,
      max,
      isFull: filledRaw >= max,
    };
  });

  const allFilled = slots.every((slot) => slot.isFull);
  const tooltip = slots.map((slot) => `${slot.name} ${slot.filled}/${slot.max}`).join(' · ');

  return {
    status: allFilled ? 'closed' : 'open',
    tooltip,
    slots,
  };
};

export const monthBounds = (year, monthIndex0) => {
  const start = new Date(year, monthIndex0, 1);
  const end = new Date(year, monthIndex0 + 1, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    dateFrom: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    dateTo: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
};
