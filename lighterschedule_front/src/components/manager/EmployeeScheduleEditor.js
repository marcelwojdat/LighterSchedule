import React, { useEffect, useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import CoverageLegend from './CoverageLegend';
import ManagerDayPopup from './ManagerDayPopup';
import styles from '../Manager.module.css';
import { WORKDAY_STATUS_LABELS } from '../../constants/statusLabels';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning';
import { formatDateStr } from '../../utils/dates';
import { formatMonthYearPl } from '../../utils/locale';
import { getDayShiftCoverage } from '../../utils/shiftCoverage';

const STATUS_LEGEND = [
  [styles.legendProposed, 'Oczekuje'],
  [styles.legendApproved, 'Zatwierdzony'],
  [styles.legendApprovedNote, 'Z notatką'],
  [styles.legendRejected, 'Odrzucony'],
  [styles.legendSelected, 'Do zapisu'],
];

const COVERAGE_TILE_CLASS = { closed: 'day-coverage-closed', open: 'day-coverage-open', none: 'day-coverage-none' };

const savedTileClass = (day) => {
  if (day.status === 'approved') return day.note?.trim() ? 'custom-approved-note-day' : 'custom-approved-day';
  if (day.status === 'rejected') return 'custom-rejected-day';
  return 'custom-proposed-day';
};

const statusBadgeClass = (day) => {
  if (day.status === 'approved') return day.note?.trim() ? styles.statusApprovedNote : styles.statusApproved;
  if (day.status === 'rejected') return styles.statusRejected;
  return styles.statusProposed;
};

/**
 * Calendar of one person: a click on a day opens the day popup, the shift goes to the drafts,
 * and "Zapisz zmiany" saves all drafts at once.
 *
 * Mount it with `key={employee.id}`, so switching employees starts with an empty draft.
 * `onSave(drafts)` and `onCopy(mode)` resolve to true on success.
 * `onDirtyChange(hasDrafts)` (optional, keep it stable) reports whether there are unsaved drafts.
 */
const EmployeeScheduleEditor = ({
  employee,
  workdays,
  shiftTemplates,
  taskTypes,
  coverageWorkdays,
  copyMonth,
  onMonthChange,
  onSave,
  onCopy,
  onSuccess,
  onError,
  onDirtyChange,
}) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [drafts, setDrafts] = useState({}); // { 'YYYY-MM-DD': { start_time, end_time, role, note, shift_template } }
  const hasDrafts = Object.keys(drafts).length > 0;
  useUnsavedChangesWarning(hasDrafts);
  // Tells the panel about unsaved drafts, so switching to another employee can ask first.
  useEffect(() => {
    onDirtyChange?.(hasDrafts);
    return () => onDirtyChange?.(false);
  }, [hasDrafts, onDirtyChange]);
  const [copyBusy, setCopyBusy] = useState(false);
  const draftCount = Object.keys(drafts).length;

  const savedDay = (date) => workdays.find((day) => day.date === date);
  const coverageOf = (date) => getDayShiftCoverage(date, shiftTemplates, coverageWorkdays);

  /** Shift from the day popup; replaces an earlier draft of the same day. */
  const addDraft = (date, draft) => {
    setDrafts((prev) => ({ ...prev, [date]: draft }));
    setSelectedDate('');
    onSuccess('Zmiana dodana do zapisu.');
  };

  const removeDraft = (date) => {
    setDrafts(({ [date]: _removed, ...rest }) => rest);
    setSelectedDate('');
  };

  const saveDrafts = async () => {
    if (draftCount === 0) return;
    if (await onSave(drafts)) setDrafts({});
  };

  const copy = async (mode) => {
    const period = mode === 'week' ? 'tygodnia' : 'miesiąca';
    const name = employee.first_name || employee.username;
    if (!window.confirm(`Skopiować grafik ${name} z poprzedniego ${period}? Istniejące dni zostaną pominięte; nowe wpisy będą od razu zatwierdzone.`)) {
      return;
    }
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
    const saved = savedDay(dateStr);
    const dayClass = drafts[dateStr] ? 'custom-selected-day' : saved ? savedTileClass(saved) : null;
    return [dayClass, COVERAGE_TILE_CLASS[coverageOf(dateStr).status]].filter(Boolean).join(' ');
  };

  const tileContent = ({ date, view }) => {
    if (view !== 'month') return null;
    const dateStr = formatDateStr(date);
    const coverage = coverageOf(dateStr);
    const draft = drafts[dateStr];
    const saved = savedDay(dateStr);
    const entry = draft || saved;
    if (!entry && coverage.status === 'none') return null;

    return (
      <div className={styles.tileContent} title={coverage.tooltip || undefined}>
        {coverage.status !== 'none' ? (
          <span
            className={`${styles.coverageMark} ${coverage.status === 'closed' ? styles.coverageClosed : styles.coverageOpen}`}
            aria-hidden="true"
          />
        ) : null}
        {entry ? (
          <>
            <div className={styles.tileHours}>
              {entry.start_time.slice(0, 5)} - {entry.end_time.slice(0, 5)}
            </div>
            {!draft && saved.role_name ? <div className={styles.tileStatus}>{saved.role_name}</div> : null}
            <div className={styles.tileStatus}>{draft ? 'Do zapisu' : WORKDAY_STATUS_LABELS[saved.status]}</div>
            {entry.note?.trim() ? <div className={styles.tileStatus}>nota</div> : null}
          </>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <div className={styles.empHeader}>
        {employee.first_name} {employee.last_name}
      </div>
      <div className={styles.empInfo}>
        <strong>E-mail:</strong> {employee.email || '—'}
      </div>
      <div className={styles.empInfo}>
        <strong>Stawka:</strong> {employee.hourly_rate ?? '—'} zł/h
      </div>

      <div className={`${styles.calendarContainer} calendarScroll`}>
        <Calendar
          locale="pl-PL"
          onChange={(date) => setSelectedDate(formatDateStr(date))}
          value={null}
          tileClassName={tileClassName}
          tileContent={tileContent}
          onActiveStartDateChange={({ activeStartDate }) => {
            if (activeStartDate) {
              onMonthChange({ year: activeStartDate.getFullYear(), month: activeStartDate.getMonth() });
            }
          }}
        />
      </div>
      <CoverageLegend />
      <div className={styles.statusLegend}>
        {STATUS_LEGEND.map(([dotClass, label]) => (
          <div key={label} className={styles.legendItem}>
            <span className={`${styles.legendDot} ${dotClass}`} />
            {label}
          </div>
        ))}
      </div>

      <div className={styles.copyScheduleRow}>
        <button type="button" className={styles.btnSecondary} disabled={copyBusy} onClick={() => copy('week')}>
          Kopiuj poprzedni tydzień
        </button>
        <button
          type="button"
          className={styles.btnSecondary}
          disabled={copyBusy}
          onClick={() => copy('month')}
          title={`Na miesiąc ${formatMonthYearPl(copyMonth)}`}
        >
          Kopiuj poprzedni miesiąc
        </button>
      </div>

      <div className={styles.shiftControls}>
        <p className={styles.statHint}>Kliknij dzień w kalendarzu, aby dodać lub zmienić zmianę.</p>
        <button type="button" className={styles.btnPrimary} onClick={saveDrafts} disabled={draftCount === 0}>
          {draftCount ? `Zapisz zmiany (${draftCount})` : 'Zapisz zmiany'}
        </button>
      </div>

      {selectedDate ? (
        <ManagerDayPopup
          key={selectedDate}
          date={selectedDate}
          existing={savedDay(selectedDate)}
          draft={drafts[selectedDate]}
          shiftTemplates={shiftTemplates}
          taskTypes={taskTypes}
          onAddDraft={addDraft}
          onRemoveDraft={removeDraft}
          onClose={() => setSelectedDate('')}
          onError={onError}
        />
      ) : null}

      <div className={styles.scheduleSection}>
        <h4>Aktualny grafik</h4>
        {workdays.length === 0 ? (
          <p className={styles.emptyQueue}>Brak wpisów w grafiku.</p>
        ) : (
          <ul className={styles.scheduleList}>
            {workdays.map((day) => (
              <li
                key={day.id}
                className={`${styles.scheduleItem} ${
                  day.status === 'approved' && day.note?.trim() ? styles.scheduleItemWithNote : ''
                }`}
              >
                <span>
                  {day.date} — {day.start_time.slice(0, 5)} - {day.end_time.slice(0, 5)}
                  {day.role_name ? ` (${day.role_name})` : ''}
                  {day.note?.trim() ? <small className={styles.scheduleNote}> — {day.note}</small> : null}
                </span>
                <span className={`${styles.statusBadge} ${statusBadgeClass(day)}`}>
                  {WORKDAY_STATUS_LABELS[day.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

export default EmployeeScheduleEditor;
