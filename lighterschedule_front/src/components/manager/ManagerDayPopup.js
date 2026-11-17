import React, { useState } from 'react';
import RoleSelect from '../common/RoleSelect';
import ShiftPicker, { useDayShiftTemplates } from '../common/ShiftPicker';
import TimeSelect from '../common/TimeSelect';
// The look of the employee's day popup, taken from the same stylesheet instead of a copy.
import styles from '../Dashboard.module.css';
import { WORKDAY_STATUS_LABELS } from '../../constants/statusLabels';
import { resolveTemplateHours, toApiTime, toDisplayTime } from '../../utils/time';

const DEFAULT_FORM = { timeFrom: '12:00', timeTo: '20:00', roleId: '', shiftId: '', note: '' };

/** Form prefilled from a draft or a saved entry; defaults when the day is empty. */
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

const STATUS_BADGE_CLASS = {
  approved: styles.statusApproved,
  rejected: styles.statusRejected,
  proposed: styles.statusProposed,
};

const PopupButton = ({ label, onClick, variant }) => (
  <input
    type="button"
    value={label}
    onClick={onClick}
    className={variant ? `${styles.popupBtn} ${styles[variant]}` : styles.popupBtn}
  />
);

/**
 * Manager's popup for one day of someone's schedule: the employee popup's look and shift list
 * (with free places), plus own hours. A template only suggests its hours; what the manager
 * finally sets is what gets saved. Changes become drafts, saved together with "Zapisz zmiany".
 * Mount it with `key={date}`, so the form is filled from that day.
 */
const ManagerDayPopup = ({
  date,
  existing,
  draft,
  shiftTemplates,
  taskTypes,
  onAddDraft,
  onRemoveDraft,
  onClose,
  onError,
}) => {
  const [form, setForm] = useState(() => formFrom(draft || existing));
  const templates = useDayShiftTemplates(date, shiftTemplates);
  const update = (changes) => setForm((prev) => ({ ...prev, ...changes }));

  const pickTemplate = (templateId) => {
    const template = templates.find((candidate) => String(candidate.id) === templateId);
    const hours = resolveTemplateHours(template, date);
    update({
      shiftId: templateId,
      ...(hours ? { timeFrom: toDisplayTime(hours.start_time), timeTo: toDisplayTime(hours.end_time) } : {}),
    });
  };

  // A full shift is fine when this person already holds one of its places (their own edit).
  const selected = templates.find((template) => String(template.id) === form.shiftId);
  const holdsPlace = existing?.status === 'approved' && String(existing.shift_template) === form.shiftId;
  const fullWarning = selected?.is_full && !holdsPlace;

  const submit = () => {
    if (form.timeFrom >= form.timeTo) return onError('Godzina końcowa musi być później niż początkowa.');
    return onAddDraft(date, {
      start_time: toApiTime(form.timeFrom),
      end_time: toApiTime(form.timeTo),
      role: form.roleId ? Number(form.roleId) : null,
      note: form.note.trim(),
      shift_template: form.shiftId ? Number(form.shiftId) : null,
    });
  };

  return (
    <div className={styles.popupBackdrop} onClick={onClose}>
      <div className={styles.popupBox} role="dialog" aria-label={`Zmiana: ${date}`} onClick={(event) => event.stopPropagation()}>
        <h2 className={styles.popupTitle}>{date}</h2>
        {existing ? (
          <p className={styles.popupInfo}>
            W grafiku: {existing.start_time.slice(0, 5)} - {existing.end_time.slice(0, 5)}{' '}
            <span className={`${styles.statusBadge} ${STATUS_BADGE_CLASS[existing.status]}`}>
              {WORKDAY_STATUS_LABELS[existing.status]}
            </span>
          </p>
        ) : (
          <p className={styles.popupInfo}>Brak zmiany w tym dniu.</p>
        )}

        <div className={styles.popupField}>
          <ShiftPicker
            date={date}
            templates={templates}
            value={form.shiftId}
            onChange={pickTemplate}
            allowFull
            placeholder="Bez szablonu (własne godziny)"
            className={styles.roleSelect}
          />
          {fullWarning ? (
            <p className={styles.popupInfo}>
              Ta zmiana ma już komplet osób — zapis zostanie odrzucony, dopóki ktoś się z niej nie wypisze.
            </p>
          ) : null}
        </div>
        <div className={styles.popupField}>
          <TimeSelect label="Początek zmiany" value={form.timeFrom} onChange={(timeFrom) => update({ timeFrom })} />
          <TimeSelect label="Koniec zmiany" value={form.timeTo} onChange={(timeTo) => update({ timeTo })} />
        </div>
        <RoleSelect
          taskTypes={taskTypes}
          value={form.roleId}
          onChange={(roleId) => update({ roleId })}
          className={styles.roleSelect}
          placeholder="Stanowisko (opcjonalnie)"
        />
        <label className={styles.noteLabel} htmlFor="manager-day-note">
          Notatka (opcjonalnie)
        </label>
        <textarea
          id="manager-day-note"
          className={styles.noteInput}
          rows={2}
          maxLength={500}
          value={form.note}
          onChange={(event) => update({ note: event.target.value })}
        />

        <div className={styles.popupButtons}>
          <PopupButton label="Wróć" onClick={onClose} variant="popupBtnSecondary" />
          {draft ? <PopupButton label="Usuń z zapisu" onClick={() => onRemoveDraft(date)} variant="popupBtnDanger" /> : null}
          <PopupButton label={draft ? 'Zmień w zapisie' : 'Dodaj do zapisu'} onClick={submit} />
        </div>
      </div>
    </div>
  );
};

export default ManagerDayPopup;
