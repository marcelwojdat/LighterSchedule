import React, { useState } from 'react';
import RoleSelect from '../common/RoleSelect';
import styles from '../Dashboard.module.css';
import { getShiftTemplates } from '../../api/shiftTemplates';
import { WORKDAY_STATUS_LABELS } from '../../constants/statusLabels';
import { useApiResource } from '../../hooks/useApiResource';
import { isPastDate } from '../../utils/dates';
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

/** Which view the popup shows for a day — checked in this order. */
const popupMode = ({ date, existing, draft, pastWarning }) => {
  if (pastWarning) return 'pastWarning';
  if (existing?.status === 'approved') return 'approved';
  if (existing?.status === 'rejected' && !draft) return 'rejected';
  if (existing?.status === 'proposed' && !draft) return 'pending';
  if (existing && isPastDate(date)) return 'pastLocked';
  return 'new';
};

const STATUS_BADGE_CLASS = {
  approved: styles.statusApproved,
  rejected: styles.statusRejected,
  proposed: styles.statusProposed,
};

const StatusBadge = ({ status }) => (
  <span className={`${styles.statusBadge} ${STATUS_BADGE_CLASS[status]}`}>{WORKDAY_STATUS_LABELS[status]}</span>
);

const PopupButton = ({ label, onClick, variant }) => (
  <input
    type="button"
    value={label}
    onClick={onClick}
    className={variant ? `${styles.popupBtn} ${styles[variant]}` : styles.popupBtn}
  />
);

/** Shift (or free hours), role and note — shared by every editable view. */
const DayFields = ({ date, form, update, templates, templatesConfigured, taskTypes }) => {
  const selectedFull = templates.some((template) => String(template.id) === form.shiftId && template.is_full);

  const pickTemplate = (templateId) => {
    const template = templates.find((candidate) => String(candidate.id) === templateId);
    const hours = template && !template.is_full ? resolveTemplateHours(template, date) : null;
    update({
      shiftId: templateId,
      ...(hours ? { timeFrom: toDisplayTime(hours.start_time), timeTo: toDisplayTime(hours.end_time) } : {}),
    });
  };

  let hint;
  if (templates.length === 0) hint = 'Brak zdefiniowanych zmian na ten dzień tygodnia.';
  else if (selectedFull) hint = 'Brak miejsc na wybranej zmianie.';
  else if (form.shiftId) hint = `Godziny: ${form.timeFrom} - ${form.timeTo} (ustalone przez kierownika)`;
  else hint = 'Wybierz zmianę — godzin nie wpisujesz samodzielnie.';

  return (
    <>
      <div className={styles.popupField}>
        {templatesConfigured ? (
          <>
            <select className={styles.roleSelect} value={form.shiftId} onChange={(event) => pickTemplate(event.target.value)}>
              <option value="">Wybierz zmianę</option>
              {templates.map((template) => {
                const hours = resolveTemplateHours(template, date);
                return (
                  <option key={template.id} value={template.id} disabled={template.is_full === true}>
                    {template.name}
                    {hours ? ` (${toDisplayTime(hours.start_time)}-${toDisplayTime(hours.end_time)})` : ''}
                    {template.is_full ? ' — brak miejsc' : ''}
                  </option>
                );
              })}
            </select>
            <p className={styles.popupInfo}>{hint}</p>
          </>
        ) : (
          <div className={styles.popupField}>
            <input type="time" value={form.timeFrom} onChange={(event) => update({ timeFrom: event.target.value })} />
            <input type="time" value={form.timeTo} onChange={(event) => update({ timeTo: event.target.value })} />
            <p className={styles.popupInfo}>
              Kierownik nie zdefiniował jeszcze szablonów zmian — możesz podać godziny ręcznie.
            </p>
          </div>
        )}
      </div>
      <RoleSelect
        taskTypes={taskTypes}
        value={form.roleId}
        onChange={(roleId) => update({ roleId })}
        className={styles.roleSelect}
        placeholder="Stanowisko (opcjonalnie)"
      />
      <label className={styles.noteLabel} htmlFor="day-note">
        Notatka (opcjonalnie)
      </label>
      <textarea
        id="day-note"
        className={styles.noteInput}
        rows={2}
        maxLength={500}
        placeholder="Np. muszę wyjść wcześniej"
        value={form.note}
        onChange={(event) => update({ note: event.target.value })}
      />
    </>
  );
};

/**
 * Popup for one calendar day: view a saved entry, prepare a declaration (a draft sent later
 * together with others), delete a pending one, or start giving away an approved shift.
 * Mount it with `key={date}`, so the form is filled from that day's entry.
 */
const DayPopup = ({
  date,
  existing,
  draft,
  shiftTemplates,
  taskTypes,
  hasActiveSwap,
  blockedMessage,
  onClose,
  onAddDraft,
  onRemove,
  onGiveAway,
  onError,
}) => {
  const [form, setForm] = useState(() => formFrom(draft || existing));
  const [pastWarning, setPastWarning] = useState(false);
  // Templates for this exact day include slot usage (is_full); until loaded, filter the general list.
  const { data: dayTemplates } = useApiResource(getShiftTemplates, { active: '1', date }, { initial: null });

  const update = (changes) => setForm((prev) => ({ ...prev, ...changes }));
  const templatesConfigured = shiftTemplates.length > 0;
  const templates = dayTemplates ?? shiftTemplates.filter((template) => resolveTemplateHours(template, date));

  const submit = () => {
    if (blockedMessage) return onError(blockedMessage);
    if (existing?.status === 'approved') return onError('Nie możesz edytować zatwierdzonego grafiku.');
    if (!existing && isPastDate(date)) return setPastWarning(true);
    if (templatesConfigured) {
      if (!shiftTemplates.some((template) => resolveTemplateHours(template, date))) {
        return onError('Brak zdefiniowanych zmian na ten dzień tygodnia.');
      }
      if (!form.shiftId) return onError('Wybierz zmianę zdefiniowaną przez kierownika.');
    }

    let start = toApiTime(form.timeFrom);
    let end = toApiTime(form.timeTo);
    if (form.shiftId) {
      const template = templates.find((candidate) => String(candidate.id) === form.shiftId);
      if (template?.is_full) return onError(`Zmiana ${template.name} jest już obsadzona (brak miejsc).`);
      const hours = resolveTemplateHours(template, date);
      if (!hours) return onError('Ta zmiana nie jest dostępna w wybranym dniu.');
      start = toApiTime(hours.start_time);
      end = toApiTime(hours.end_time);
    }
    return onAddDraft(date, {
      start_time: start,
      end_time: end,
      role: form.roleId ? Number(form.roleId) : null,
      note: form.note.trim(),
      shift_template: form.shiftId ? Number(form.shiftId) : null,
    });
  };

  const fields = (
    <DayFields
      date={date}
      form={form}
      update={update}
      templates={templates}
      templatesConfigured={templatesConfigured}
      taskTypes={taskTypes}
    />
  );
  const back = <PopupButton label="Wróć" onClick={onClose} variant="popupBtnSecondary" />;
  const hoursLabel = existing ? `${existing.start_time.slice(0, 5)} - ${existing.end_time.slice(0, 5)}` : '';

  const views = {
    pastWarning: () => (
      <>
        <h2 className={styles.popupTitle}>Nie można dodawać przeszłych dni</h2>
        <div className={styles.popupButtons}>{back}</div>
      </>
    ),
    approved: () => (
      <>
        <h2 className={styles.popupTitle}>Zatwierdzony grafik</h2>
        <p className={styles.popupInfo}>{date}</p>
        <p className={styles.popupInfo}>
          {hoursLabel}
          {existing.shift_template_name ? ` · ${existing.shift_template_name}` : ''}
          {existing.role_name ? ` (${existing.role_name})` : ''}
        </p>
        <StatusBadge status="approved" />
        {existing.note?.trim() ? <div className={styles.dayNoteBox}>Notatka: {existing.note}</div> : null}
        <p className={styles.popupInfo}>Ten dzień został zatwierdzony przez kierownika. Nie możesz go edytować.</p>
        {hasActiveSwap ? <p className={styles.popupInfo}>Prośba o oddanie tej zmiany jest już w toku.</p> : null}
        <div className={styles.popupButtons}>
          {!isPastDate(date) && !hasActiveSwap ? (
            <button type="button" className={`${styles.popupBtn} ${styles.giveAwayBtn}`} onClick={() => onGiveAway(existing)}>
              Chcę oddać zmianę
            </button>
          ) : null}
          {back}
        </div>
      </>
    ),
    rejected: () => (
      <>
        <h2 className={styles.popupTitle}>Odrzucona deklaracja</h2>
        <p className={styles.popupInfo}>{date}</p>
        <StatusBadge status="rejected" />
        {existing.rejection_reason ? (
          <div className={styles.rejectionReason}>Powód odrzucenia: {existing.rejection_reason}</div>
        ) : null}
        <p className={styles.popupInfo}>Możesz złożyć nową deklarację na ten dzień.</p>
        {fields}
        <div className={styles.popupButtons}>
          {back}
          <PopupButton label="Złóż ponownie" onClick={submit} />
        </div>
      </>
    ),
    pending: () => (
      <>
        <h2 className={styles.popupTitle}>Oczekująca deklaracja</h2>
        <p className={styles.popupInfo}>{date}</p>
        <p className={styles.popupInfo}>{hoursLabel}</p>
        <StatusBadge status="proposed" />
        <p className={styles.popupInfo}>Deklaracja czeka na akceptację kierownika.</p>
        {isPastDate(date) ? (
          <div className={styles.popupButtons}>{back}</div>
        ) : (
          <>
            {fields}
            <div className={styles.popupButtons}>
              {back}
              <PopupButton label="Usuń" onClick={() => onRemove(date)} variant="popupBtnDanger" />
              <PopupButton label="Edytuj" onClick={submit} />
            </div>
          </>
        )}
      </>
    ),
    pastLocked: () => (
      <>
        <h2 className={styles.popupTitle}>Dzień z przeszłości</h2>
        <p className={styles.popupInfo}>
          {date}: {hoursLabel}
        </p>
        <StatusBadge status={existing.status} />
        <p className={styles.popupInfo}>Przeszłych deklaracji nie można już edytować ani usuwać.</p>
        <div className={styles.popupButtons}>{back}</div>
      </>
    ),
    new: () => (
      <>
        <h2 className={styles.popupTitle}>{date}</h2>
        <p className={styles.popupInfo}>
          {templatesConfigured ? 'Wybierz zdefiniowaną zmianę' : 'Wybierz godziny dyspozycyjności'}
        </p>
        {fields}
        <div className={styles.popupButtons}>
          {back}
          <PopupButton label="Dodaj deklarację" onClick={submit} />
        </div>
      </>
    ),
  };

  return (
    <div className={styles.popupBackdrop} onClick={onClose}>
      <div className={styles.popupBox} onClick={(event) => event.stopPropagation()}>
        {views[popupMode({ date, existing, draft, pastWarning })]()}
      </div>
    </div>
  );
};

export default DayPopup;
