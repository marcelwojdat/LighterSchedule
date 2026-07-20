/** Normalize HH:MM or HH:MM:SS into API time HH:MM:SS. */
export const toApiTime = (value) => {
  if (!value) return value;
  const [hours = '00', minutes = '00', seconds = '00'] = String(value).split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${String(seconds).padStart(2, '0').slice(0, 2)}`;
};

export const buildWorkdayPayload = ({
  date,
  start_time,
  end_time,
  role,
  employee,
  note,
  shift_template,
}) => {
  const payload = {
    date,
  };

  if (shift_template != null && shift_template !== '') {
    payload.shift_template = Number(shift_template);
  }

  if (start_time) {
    payload.start_time = toApiTime(start_time);
  }
  if (end_time) {
    payload.end_time = toApiTime(end_time);
  }

  if (role != null && role !== '') {
    payload.role = role;
  }

  if (employee != null) {
    payload.employee = employee;
  }

  if (note != null) {
    payload.note = String(note).trim().slice(0, 500);
  }

  return payload;
};

/** Format API time for display HH:MM */
export const toDisplayTime = (value) => {
  if (!value) return '';
  return String(value).slice(0, 5);
};

/** Python weekday 0=Mon … 6=Sun from YYYY-MM-DD */
export const toPythonWeekday = (dateStr) => {
  const d = new Date(`${dateStr}T12:00:00`);
  const jsDay = d.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
};

export const resolveTemplateHours = (template, dateStr) => {
  if (!template?.hours || !dateStr) return null;
  const weekday = toPythonWeekday(dateStr);
  return template.hours.find((h) => Number(h.weekday) === weekday) || null;
};

export const WEEKDAY_SHORT = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz'];

export const buildEmptyTemplateHours = () =>
  WEEKDAY_SHORT.map((_, weekday) => ({
    weekday,
    enabled: false,
    start: '06:00',
    end: '14:00',
  }));
