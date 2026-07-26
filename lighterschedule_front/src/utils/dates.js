/** Format Date → YYYY-MM-DD */
export const formatDateStr = (dateObj) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Monday of the week containing baseDate (local). */
export const getMonday = (baseDate = new Date()) => {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const getWeekDates = (weekStartStr) => {
  const start = new Date(`${weekStartStr}T12:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    return formatDateStr(d);
  });
};

export const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateStr(d);
};

export const shiftMonth = (dateStr, monthDelta) => {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setMonth(d.getMonth() + monthDelta);
  return formatDateStr(d);
};
