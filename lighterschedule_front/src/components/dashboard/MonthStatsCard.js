import React from 'react';
import MonthPicker from '../MonthPicker';
import styles from '../Dashboard.module.css';
import { formatDateStr } from '../../utils/dates';
import { formatMonthYearPl } from '../../utils/locale';

const formatCurrency = (value) => `${(Number(value) || 0).toFixed(2).replace('.', ',')} zł`;
const sum = (days, field) => days.reduce((total, day) => total + Number(day[field] || 0), 0);

/** Hours and earnings of one month ('YYYY-MM'); "to date" counts approved days up to today. */
const monthStats = (workdays, month) => {
  const monthDays = workdays.filter((day) => day.date.startsWith(`${month}-`));
  const approved = monthDays.filter((day) => day.status === 'approved');
  const worked = approved.filter((day) => day.date <= formatDateStr(new Date()));
  return {
    hoursToDate: sum(worked, 'total_hours'),
    earnedToDate: sum(worked, 'earnings'),
    approvedDays: approved.length,
    pendingCount: monthDays.filter((day) => day.status === 'proposed').length,
  };
};

const MonthStatsCard = ({ workdays, month, onMonthChange }) => {
  const stats = monthStats(workdays, month);
  const cards = [
    ['Godziny przepracowane', stats.hoursToDate.toFixed(2), 'zatwierdzone dni do dziś'],
    ['Zarobki do dziś', formatCurrency(stats.earnedToDate), 'za zatwierdzone dni'],
    ['Zatwierdzone dni', stats.approvedDays, 'w wybranym miesiącu'],
    ['Oczekujące deklaracje', stats.pendingCount, 'czekają na kierownika'],
  ];

  return (
    <>
      <div className={styles.statsHeader}>
        <div>
          <div className={styles.statsLabel}>Statystyki miesiąca</div>
          <div className={styles.statsTitle}>{formatMonthYearPl(month)}</div>
        </div>
        <div className={styles.statsMonthPicker}>
          <MonthPicker id="stats-month" label="Wybierz miesiąc" value={month} onChange={onMonthChange} />
        </div>
      </div>
      <div className={styles.statsGrid}>
        {cards.map(([title, value, hint]) => (
          <div key={title} className={styles.statCard}>
            <h3>{title}</h3>
            <p>{value}</p>
            <small>{hint}</small>
          </div>
        ))}
      </div>
    </>
  );
};

export default MonthStatsCard;
