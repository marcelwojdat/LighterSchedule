import React, { useEffect, useState } from 'react';
import styles from '../Manager.module.css';

const WEEKDAY_NAMES = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const DEFAULT_CLOSE_TIME = '23:59';

/**
 * Weekly deadline for employee declarations.
 * The form is editable, so it mirrors the loaded `settings` instead of rendering them directly.
 */
const DeclarationDeadlineForm = ({ settings, onSave, onClear }) => {
  const [weekday, setWeekday] = useState('');
  const [time, setTime] = useState(DEFAULT_CLOSE_TIME);

  useEffect(() => {
    if (!settings) return;
    const loadedWeekday = settings.declaration_close_weekday;
    setWeekday(loadedWeekday === null || loadedWeekday === undefined ? '' : String(loadedWeekday));
    setTime(settings.declaration_close_time ? String(settings.declaration_close_time).slice(0, 5) : DEFAULT_CLOSE_TIME);
  }, [settings]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const closeWeekday = weekday === '' ? null : Number(weekday);
    onSave({
      declaration_close_weekday: closeWeekday,
      declaration_close_time: closeWeekday === null ? null : `${time || DEFAULT_CLOSE_TIME}:00`,
    });
  };

  const clear = () => {
    setWeekday('');
    setTime(DEFAULT_CLOSE_TIME);
    onClear();
  };

  return (
    <form className={styles.deadlineForm} onSubmit={handleSubmit}>
      <div>
        <label htmlFor="declaration-close-weekday" className={styles.deadlineLabel}>
          Zamknięcie deklaracji (co tydzień)
        </label>
        <p className={styles.statHint}>
          Po wybranym dniu i godzinie pracownicy nie składają deklaracji do kolejnego poniedziałku — tylko kierownik
          może zmieniać grafik.
        </p>
      </div>
      <div className={styles.deadlineControls}>
        <select
          id="declaration-close-weekday"
          value={weekday}
          onChange={(event) => setWeekday(event.target.value)}
          aria-label="Dzień tygodnia zamknięcia"
        >
          <option value="">Bez limitu</option>
          {WEEKDAY_NAMES.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
        <input
          id="declaration-close-time"
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value || DEFAULT_CLOSE_TIME)}
          disabled={weekday === ''}
          aria-label="Godzina zamknięcia"
        />
        <button type="submit" className={styles.btnPrimary}>
          Zapisz termin
        </button>
        {weekday !== '' ? (
          <button type="button" className={styles.btnSecondary} onClick={clear}>
            Wyczyść
          </button>
        ) : null}
      </div>
    </form>
  );
};

export default DeclarationDeadlineForm;
