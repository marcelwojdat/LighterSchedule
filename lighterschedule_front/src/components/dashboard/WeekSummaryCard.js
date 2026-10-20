import React from 'react';
import styles from '../Dashboard.module.css';
import { addDays, formatDateStr, getMonday } from '../../utils/dates';
import { formatWeekRangeLabel, getWeekSummary } from '../../utils/weekSummary';

/** Approved vs pending hours in one Mon–Sun week, with week navigation. */
const WeekSummaryCard = ({ workdays, weekStart, onWeekChange }) => {
  const summary = getWeekSummary(workdays, weekStart);

  return (
    <div className={styles.weekSummary}>
      <div className={styles.statsHeader}>
        <div>
          <div className={styles.statsLabel}>Podsumowanie tygodnia</div>
          <div className={styles.statsTitle}>{formatWeekRangeLabel(summary.weekStart, summary.weekEnd)}</div>
        </div>
        <div className={styles.weekNav}>
          <button type="button" className={styles.weekNavBtn} onClick={() => onWeekChange(addDays(weekStart, -7))}>
            ←
          </button>
          <button type="button" className={styles.weekNavBtn} onClick={() => onWeekChange(formatDateStr(getMonday()))}>
            Ten tydzień
          </button>
          <button type="button" className={styles.weekNavBtn} onClick={() => onWeekChange(addDays(weekStart, 7))}>
            →
          </button>
        </div>
      </div>
      <div className={styles.weekSummaryGrid}>
        <div className={`${styles.statCard} ${styles.weekStatApproved}`}>
          <h3>Zatwierdzone</h3>
          <p>{summary.approvedHours.toFixed(1)} h</p>
          <small>
            {summary.approvedDays} {summary.approvedDays === 1 ? 'dzień' : 'dni'} w grafiku
          </small>
        </div>
        <div className={`${styles.statCard} ${styles.weekStatPending}`}>
          <h3>Oczekujące</h3>
          <p>{summary.pendingHours.toFixed(1)} h</p>
          <small>
            {summary.pendingDays} {summary.pendingDays === 1 ? 'deklaracja' : 'deklaracje'} do akceptacji
          </small>
        </div>
      </div>
    </div>
  );
};

export default WeekSummaryCard;
