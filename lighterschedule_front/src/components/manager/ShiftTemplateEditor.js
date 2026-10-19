import React, { useState } from 'react';
import styles from '../Manager.module.css';
import { buildEmptyTemplateHours, toApiTime, toDisplayTime, WEEKDAY_SHORT } from '../../utils/time';

const emptyForm = () => ({ id: null, name: '', is_active: true, max_slots: 1, hours: buildEmptyTemplateHours() });

/** Editable form of an existing template: one row per weekday, enabled where the template has hours. */
const formFromTemplate = (template) => ({
  id: template.id,
  name: template.name,
  is_active: template.is_active !== false,
  max_slots: template.max_slots ?? 1,
  hours: buildEmptyTemplateHours().map((row) => {
    const match = template.hours.find((hours) => Number(hours.weekday) === row.weekday);
    return match
      ? { weekday: row.weekday, enabled: true, start: toDisplayTime(match.start_time), end: toDisplayTime(match.end_time) }
      : row;
  }),
});

/** Returns [payload, null] when valid, or [null, errorMessage]. */
const toPayload = (form) => {
  if (!form.name.trim()) return [null, 'Podaj nazwę zmiany (np. Poranna).'];
  const hours = form.hours
    .filter((row) => row.enabled)
    .map((row) => ({ weekday: row.weekday, start_time: toApiTime(row.start), end_time: toApiTime(row.end) }));
  if (hours.length === 0) return [null, 'Włącz godziny przynajmniej dla jednego dnia tygodnia.'];
  const maxSlots = Number(form.max_slots);
  if (!Number.isInteger(maxSlots) || maxSlots < 1) return [null, 'Max. osób na zmianę musi być liczbą całkowitą ≥ 1.'];
  return [{ name: form.name.trim(), is_active: form.is_active, max_slots: maxSlots, hours }, null];
};

const hoursSummary = (template) =>
  template.hours
    .map((hours) => `${WEEKDAY_SHORT[hours.weekday]} ${toDisplayTime(hours.start_time)}-${toDisplayTime(hours.end_time)}`)
    .join(' · ');

/**
 * Shift templates (e.g. Poranna) with hours per weekday and a staffing limit.
 * `onSave(payload, id)` and `onDelete(template)` resolve to true on success.
 */
const ShiftTemplateEditor = ({ templates, onSave, onDelete, onError }) => {
  const [form, setForm] = useState(emptyForm);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const updateDay = (weekday, field, value) =>
    setForm((prev) => ({
      ...prev,
      hours: prev.hours.map((row) => (row.weekday === weekday ? { ...row, [field]: value } : row)),
    }));
  const reset = () => setForm(emptyForm());

  const handleSubmit = async (event) => {
    event.preventDefault();
    const [payload, error] = toPayload(form);
    if (error) {
      onError(error);
      return;
    }
    if (await onSave(payload, form.id)) reset();
  };

  const remove = async (template) => {
    if (!window.confirm(`Usunąć zmianę „${template.name}"?`)) return;
    if ((await onDelete(template)) && form.id === template.id) reset();
  };

  return (
    <div className={styles.shiftTemplatesPanel}>
      <p className={styles.statHint}>
        Zdefiniuj zmiany (np. Poranna, Późniejsza) z godzinami na wybrane dni tygodnia. Pracownicy wybierają tylko
        nazwę zmiany — bez wpisywania godzin.
      </p>
      <form className={styles.userCreateForm} onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Nazwa zmiany (np. Poranna)"
          value={form.name}
          onChange={(event) => update('name', event.target.value)}
          required
        />
        <label className="checkboxRow">
          <input type="checkbox" checked={form.is_active} onChange={(event) => update('is_active', event.target.checked)} />
          Aktywna (widoczna dla pracowników)
        </label>
        <label className={styles.maxSlotsRow}>
          <span className={styles.maxSlotsLabel}>Max. osób na zmianę</span>
          <input
            type="number"
            min={1}
            step={1}
            className={styles.maxSlotsInput}
            value={form.max_slots}
            onChange={(event) => update('max_slots', event.target.value)}
            required
          />
        </label>
        <div className={styles.templateHoursGrid}>
          {form.hours.map((row) => (
            <div key={row.weekday} className={styles.templateHourRow}>
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(event) => updateDay(row.weekday, 'enabled', event.target.checked)}
                />
                {WEEKDAY_SHORT[row.weekday]}
              </label>
              <input
                type="time"
                disabled={!row.enabled}
                value={row.start}
                onChange={(event) => updateDay(row.weekday, 'start', event.target.value)}
              />
              <input
                type="time"
                disabled={!row.enabled}
                value={row.end}
                onChange={(event) => updateDay(row.weekday, 'end', event.target.value)}
              />
            </div>
          ))}
        </div>
        <div className={styles.queueActions}>
          <button type="submit" className={styles.btnPrimary}>
            {form.id ? 'Zapisz zmiany szablonu' : 'Dodaj szablon'}
          </button>
          {form.id ? (
            <button type="button" className={styles.btnSecondary} onClick={reset}>
              Anuluj edycję
            </button>
          ) : null}
        </div>
      </form>

      {templates.length === 0 ? (
        <p className={styles.emptyQueue}>Brak szablonów — dodaj pierwszą zmianę powyżej.</p>
      ) : (
        <ul className={styles.templateList}>
          {templates.map((template) => {
            const maxSlots = template.max_slots ?? 1;
            return (
              <li key={template.id} className={styles.templateListItem}>
                <div>
                  <strong>{template.name}</strong>
                  {!template.is_active ? <span className={styles.inactiveTag}> nieaktywna</span> : null}
                  <span className={styles.inactiveTag}>
                    {' '}· max {maxSlots} {maxSlots === 1 ? 'osoba' : 'osób'}
                  </span>
                  <div className={styles.templateHoursSummary}>{hoursSummary(template)}</div>
                </div>
                <div className={styles.queueActions}>
                  <button type="button" className={styles.btnSecondary} onClick={() => setForm(formFromTemplate(template))}>
                    Edytuj
                  </button>
                  <button type="button" className={styles.btnDanger} onClick={() => remove(template)}>
                    Usuń
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ShiftTemplateEditor;
