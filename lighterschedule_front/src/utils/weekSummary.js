import { formatDateStr, getMonday, getWeekDates } from './dates';

const sumHours = (days) =>
  days.reduce((sum, day) => sum + Number(day.total_hours || 0), 0);

/**
 * Summarize approved vs pending hours for a Mon–Sun week.
 * @param {Array} workdays
 * @param {string} [weekStartStr] YYYY-MM-DD Monday (defaults to current week)
 */
export const getWeekSummary = (workdays = [], weekStartStr) => {
  const start = weekStartStr || formatDateStr(getMonday());
  const dates = getWeekDates(start);
  const inWeek = new Set(dates);
  const weekDays = workdays.filter((day) => inWeek.has(day.date));
  const approved = weekDays.filter((day) => day.status === 'approved');
  const pending = weekDays.filter((day) => day.status === 'proposed');

  return {
    weekStart: dates[0],
    weekEnd: dates[6],
    approvedHours: sumHours(approved),
    pendingHours: sumHours(pending),
    approvedDays: approved.length,
    pendingDays: pending.length,
  };
};

export const formatWeekRangeLabel = (weekStart, weekEnd) => {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(`${weekEnd}T12:00:00`);
  const opts = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('pl-PL', opts)} – ${end.toLocaleDateString('pl-PL', opts)}`;
};
