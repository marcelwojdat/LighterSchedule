/** Normalize HH:MM or HH:MM:SS into API time HH:MM:SS. */
export const toApiTime = (value) => {
  if (!value) return value;
  const [hours = '00', minutes = '00', seconds = '00'] = String(value).split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${String(seconds).padStart(2, '0').slice(0, 2)}`;
};

export const buildWorkdayPayload = ({ date, start_time, end_time, role, employee }) => {
  const payload = {
    date,
    start_time: toApiTime(start_time),
    end_time: toApiTime(end_time),
  };

  if (role != null && role !== '') {
    payload.role = role;
  }

  if (employee != null) {
    payload.employee = employee;
  }

  return payload;
};
