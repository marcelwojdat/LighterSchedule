import React, { useMemo } from 'react';
import { buildMonthOptions, formatMonthYearPl } from '../utils/locale';
import styles from './MonthPicker.module.css';

/**
 * Custom month picker with Polish labels (avoids native type=month EN UI).
 * Value format: YYYY-MM
 */
const MonthPicker = ({
  id,
  value,
  onChange,
  label = 'Wybierz miesiąc',
  yearsBack = 2,
  yearsForward = 1,
  className = '',
  selectClassName = '',
}) => {
  const options = useMemo(() => {
    const base = buildMonthOptions(yearsBack, yearsForward);
    if (value && !base.some((o) => o.value === value)) {
      return [
        { value, label: formatMonthYearPl(value) },
        ...base,
      ].sort((a, b) => a.value.localeCompare(b.value));
    }
    return base;
  }, [yearsBack, yearsForward, value]);

  const safeValue = options.some((o) => o.value === value)
    ? value
    : value || options[Math.floor(options.length / 2)]?.value || '';

  return (
    <div className={`${styles.picker} ${className}`.trim()}>
      {label ? (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      ) : null}
      <select
        id={id}
        className={`fieldSelect ${styles.select} ${selectClassName}`.trim()}
        value={safeValue}
        onChange={(e) => onChange?.(e.target.value)}
        aria-label={label || formatMonthYearPl(safeValue) || 'Miesiąc'}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default MonthPicker;
