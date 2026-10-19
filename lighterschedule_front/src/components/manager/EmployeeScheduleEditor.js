import React, { useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import CoverageLegend from './CoverageLegend';
import RoleSelect from './RoleSelect';
import styles from '../Manager.module.css';
import { WORKDAY_STATUS_LABELS } from '../../constants/statusLabels';
import { formatDateStr } from '../../utils/dates';
import { formatMonthYearPl } from '../../utils/locale';
import { getDayShiftCoverage } from '../../utils/shiftCoverage';
import { resolveTemplateHours, toApiTime, toDisplayTime } from '../../utils/time';

const DEFAULT_FORM = { timeFrom: '12:00', timeTo: '20:00', roleId: '', shiftId: '', note: '' };

/** Day form prefilled from a draft or a saved entry; defaults when the day is empty. */
const formFrom = (entry) =>
  entry
    ? {
        timeFrom: entry.start_time.slice(0, 5),
        timeTo: entry.end_time.slice(0, 5),
        roleId: entry.role ? String(entry.role) : '',
        shiftId: entry.shift_template ? String(entry.shift_template) : '',
        note: entry.note || '',
      }
    : DEFAULT_FORM;

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
 * Calendar of one employee: pick days, queue shifts as drafts, then save them all at once.
 *
 * Mount it with `key={employee.id}`, so switching employees starts with an empty draft.
 * `onSave(drafts)` and `onCopy(mode)` resolve to true on success.
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
}) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [drafts, setDrafts] = useState({}); // { 'YYYY-MM-DD': { start_time, end_time, role, note, shift_template } }
  const [form, setForm] = useState(DEFAULT_FORM);
  const [copyBusy, setCopyBusy] = useState(false);

  const savedDay = (date) => workdays.find((day) => day.date === date);
  const coverageOf = (date) => getDayShiftCoverage(date, shiftTemplates, coverageWorkdays);
  const updateForm = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const templatesForDay = selectedDate
    ? shiftTemplates.filter((template) => resolveTemplateHours(template, selectedDate))
    : [];

  const selectDate = (date) => {
    const dateStr = formatDateStr(date);
    setSelectedDate(dateStr);
    setForm(formFrom(drafts[dateStr] || savedDay(dateStr)));
  };

  const pickTemplate = (templateId) => {
    const template = shiftTemplates.find((candidate) => String(candidate.id) === String(templateId));
    const hours = resolveTemplateHours(template, selectedDate);
    setForm((prev) => ({
      ...prev,
      shiftId: templateId,
      ...(hours ? { timeFrom: toDisplayTime(hours.start_time), timeTo: toDisplayTime(hours.end_time) } : {}),
    }));
  };

  const addDraft = () => {
    if (!selectedDate) return;
    let start = toApiTime(form.timeFrom);
    let end = toApiTime(form.timeTo);
    if (form.shiftId) {
      const template = shiftTemplates.find((candidate) => String(candidate.id) === String(form.shiftId));
      const hours = resolveTemplateHours(template, selectedDate);
      if (!hours) {
        onError('Wybrana zmiana nie ma godzin na ten dzień tygodnia.');
        return;
      }
      start = toApiTime(hours.start_time);
      end = toApiTime(hours.end_time);
    }
    setDrafts((prev) => ({
      ...prev,
      [selectedDate]: {
        start_time: start,
        end_time: end,
        role: form.roleId ? Number(form.roleId) : null,
        note: form.note.trim(),
        shift_template: form.shiftId ? Number(form.shiftId) : null,
      },
    }));
    onSuccess('Zmiana dodana do zapisu.');
  };

  const saveDrafts = async () => {
    if (Object.keys(drafts).length === 0) return;
    if (await onSave(drafts)) {
      setDrafts({});
      setSelectedDate('');
    }
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

      <div className={styles.calendarContainer}>
        <Calendar
          locale="pl-PL"
          onChange={selectDate}
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
        <div>Wybrany dzień: {selectedDate || '—'}</div>
        <select
          className={styles.roleSelect}
          value={form.shiftId}
          onChange={(event) => pickTemplate(event.target.value)}
          disabled={!selectedDate}
        >
          <option value="">Szablon zmiany (opcjonalnie)</option>
          {templatesForDay.map((template) => {
            const hours = resolveTemplateHours(template, selectedDate);
            return (
              <option key={template.id} value={template.id}>
                {template.name}
                {hours ? ` (${toDisplayTime(hours.start_time)}-${toDisplayTime(hours.end_time)})` : ''}
              </option>
            );
          })}
        </select>
        <input type="time" value={form.timeFrom} onChange={(event) => updateForm('timeFrom', event.target.value)} />
        <input type="time" value={form.timeTo} onChange={(event) => updateForm('timeTo', event.target.value)} />
        <RoleSelect taskTypes={taskTypes} value={form.roleId} onChange={(value) => updateForm('roleId', value)} />
        <textarea
          className={styles.noteInput}
          rows={2}
          maxLength={500}
          placeholder="Notatka (opcjonalnie)"
          value={form.note}
          onChange={(event) => updateForm('note', event.target.value)}
        />
        <button type="button" className={styles.btnPrimary} onClick={addDraft}>
          Dodaj zmianę
        </button>
        <button type="button" className={styles.btnPrimary} onClick={saveDrafts}>
          Zapisz zmiany
        </button>
      </div>

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
