import React, { useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import styles from '../Dashboard.module.css';
import { WORKDAY_STATUS_LABELS } from '../../constants/statusLabels';
import { formatDateStr } from '../../utils/dates';
import { formatMonthYearPl } from '../../utils/locale';

const STATUS_LEGEND = [
  [styles.legendProposed, 'Oczekuje na akceptację'],
  [styles.legendApproved, 'Zatwierdzony przez kierownika'],
  [styles.legendApprovedNote, 'Zatwierdzony z notatką'],
  [styles.legendRejected, 'Odrzucony'],
  [styles.legendSelected, 'Do wysłania'],
];

const savedTileClass = (day) => {
  if (day.status === 'approved') return day.note?.trim() ? 'custom-approved-note-day' : 'custom-approved-day';
  if (day.status === 'rejected') return 'custom-rejected-day';
  return 'custom-proposed-day';
};

/**
 * Month calendar of the employee's declarations plus "copy previous period" and "send" actions.
 * `drafts` are declarations prepared in the day popup but not sent yet.
 */
const DeclarationCalendar = ({ workdays, drafts, declarationsClosed, copyMonth, onSelectDate, onCopy, onSend }) => {
  const [copyBusy, setCopyBusy] = useState(false);
  const savedDay = (date) => workdays.find((day) => day.date === date);

  const copy = async (mode) => {
    const period = mode === 'week' ? 'tygodnia' : 'miesiąca';
    if (!window.confirm(`Skopiować grafik z poprzedniego ${period} na bieżący? Istniejące dni zostaną pominięte.`)) return;
    setCopyBusy(true);
    try {
      await onCopy(mode);
    } finally {
      setCopyBusy(false);
    }
  };

  const tileClassName = ({ date, view }) => {
    if (view !== 'month') return null;
    const dateStr = formatDateStr(date);
    if (drafts[dateStr]) return 'custom-selected-day';
    const saved = savedDay(dateStr);
    return saved ? savedTileClass(saved) : null;
  };

  const tileContent = ({ date, view }) => {
    if (view !== 'month') return null;
    const dateStr = formatDateStr(date);
    const draft = drafts[dateStr];
    const saved = savedDay(dateStr);
    const entry = draft || saved;
    if (!entry) return null;
    return (
      <div className={styles.tileContent}>
        <div className={styles.tileHours}>
          {entry.start_time.slice(0, 5)} - {entry.end_time.slice(0, 5)}
        </div>
        {!draft && saved.role_name ? <div className={styles.tileStatus}>{saved.role_name}</div> : null}
        {!draft && saved.shift_template_name ? <div className={styles.tileStatus}>{saved.shift_template_name}</div> : null}
        <div className={styles.tileStatus}>{draft ? 'Do wysłania' : WORKDAY_STATUS_LABELS[saved.status]}</div>
        {entry.note?.trim() ? <div className={styles.tileStatus}>nota</div> : null}
      </div>
    );
  };

  return (
    <>
      <div className={styles.calendarWrapper}>
        <div className={styles.calendarContainer}>
          <Calendar
            locale="pl-PL"
            onChange={(date) => onSelectDate(formatDateStr(date))}
            value={null}
            tileClassName={tileClassName}
            tileContent={tileContent}
          />
        </div>
      </div>
      <div className={styles.statusLegend}>
        {STATUS_LEGEND.map(([dotClass, label]) => (
          <div key={label} className={styles.legendItem}>
            <span className={`${styles.legendDot} ${dotClass}`} />
            {label}
          </div>
        ))}
      </div>
      <div className={styles.copyScheduleRow}>
        <button
          type="button"
          className={styles.copyScheduleBtn}
          disabled={declarationsClosed || copyBusy}
          onClick={() => copy('week')}
        >
          Kopiuj poprzedni tydzień
        </button>
        <button
          type="button"
          className={styles.copyScheduleBtn}
          disabled={declarationsClosed || copyBusy}
          onClick={() => copy('month')}
          title={`Na miesiąc ${formatMonthYearPl(copyMonth)}`}
        >
          Kopiuj poprzedni miesiąc
        </button>
      </div>
      <input
        type="button"
        onClick={onSend}
        value={declarationsClosed ? 'Termin deklaracji minął' : 'Wyślij deklaracje'}
        disabled={declarationsClosed}
        className={`${styles.scheduleSetBtn} ${styles.saveScheduleBtn}`}
      />
    </>
  );
};

export default DeclarationCalendar;
