import React from 'react';
import MonthPicker from '../MonthPicker';
import styles from '../Manager.module.css';

/** Monthly team totals with a month picker and the payroll PDF download. */
const TeamStatsBar = ({ month, onMonthChange, onDownloadPayroll, stats, employeeCount, pendingCount, swapCount }) => {
  const cards = [
    ['Pracownicy', stats?.employee_count ?? employeeCount],
    ['Oczekujące deklaracje', pendingCount],
    ['Zamiany do zatwierdzenia', swapCount],
    ['Godziny', (stats?.total_hours ?? 0).toFixed(2)],
    ['Wypłaty', `${(stats?.total_earnings ?? 0).toFixed(2)} zł`],
    ['Zatwierdzone dni', stats?.approved_days ?? 0],
  ];

  return (
    <section className={styles.statsBar}>
      <div className={styles.statsBarHeader}>
        <div>
          <h3>Statystyki zespołu</h3>
          <p className={styles.statHint}>Zatwierdzone wpisy w wybranym miesiącu — cały zespół.</p>
        </div>
        <div className={styles.statsBarActions}>
          <MonthPicker
            id="manager-stats-month"
            label="Wybierz miesiąc"
            value={month}
            onChange={onMonthChange}
            className={styles.managerMonthPicker}
          />
          <button type="button" className={styles.btnPrimary} onClick={onDownloadPayroll}>
            Raport PDF
          </button>
        </div>
      </div>
      <div className={styles.statsGrid}>
        {cards.map(([label, value]) => (
          <div key={label} className={styles.statCard}>
            <span className={styles.statLabel}>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TeamStatsBar;
