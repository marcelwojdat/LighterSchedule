import React from 'react';

const pad = (number) => String(number).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, hour) => pad(hour));

/** Minutes every `step`, plus the current value when it is off the step (e.g. 23:59), so it is never lost. */
const minuteOptions = (step, current) => {
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, index) => pad(index * step));
  return current && !minutes.includes(current) ? [...minutes, current].sort() : minutes;
};

/**
 * Hour and minute dropdowns instead of the browser's own time widget, so picking a time looks like
 * the other fields. `value` and `onChange` use 'HH:MM', like <input type="time">.
 */
const TimeSelect = ({ value, onChange, label, disabled = false, minuteStep = 5, className = '' }) => {
  const [hour = '00', minute = '00'] = (value || '').split(':');

  return (
    <span className={`timeSelect ${className}`.trim()} role="group" aria-label={label}>
      <select
        value={hour}
        onChange={(event) => onChange(`${event.target.value}:${minute}`)}
        disabled={disabled}
        aria-label={`${label} – godzina`}
      >
        {HOURS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="timeSelectColon" aria-hidden="true">
        :
      </span>
      <select
        value={minute}
        onChange={(event) => onChange(`${hour}:${event.target.value}`)}
        disabled={disabled}
        aria-label={`${label} – minuty`}
      >
        {minuteOptions(minuteStep, minute).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </span>
  );
};

export default TimeSelect;
