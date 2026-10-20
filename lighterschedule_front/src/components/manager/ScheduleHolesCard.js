import React, { useMemo, useState } from 'react';
import styles from '../Manager.module.css';

const PREVIEW_COUNT = 5;
const RANGE_OPTIONS = [7, 14];

/** Unfilled shift slots for the next 7 or 14 days, sorted by date and start time. */
const ScheduleHolesCard = ({ holes, days, onDaysChange }) => {
  const [showAll, setShowAll] = useState(false);

  const sortedHoles = useMemo(
    () =>
      [...(holes.items || [])].sort(
        (a, b) =>
          String(a.date).localeCompare(String(b.date)) ||
          String(a.start_time || '').localeCompare(String(b.start_time || '')),
      ),
    [holes.items],
  );
  const visibleHoles = showAll ? sortedHoles : sortedHoles.slice(0, PREVIEW_COUNT);

  const changeDays = (value) => {
    setShowAll(false);
    onDaysChange(value);
  };

  return (
    <section className={styles.holesSection}>
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h3>Braki w grafiku</h3>
            <p className={styles.statHint}>
              Wolne miejsca na aktywnych zmianach
              {holes.date_from && holes.date_to ? ` · ${holes.date_from} – ${holes.date_to}` : ''}
            </p>
          </div>
          <div className={styles.holesControls}>
            <div className={styles.holesToggle}>
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.btnSecondary}${days === option ? ` ${styles.holesToggleActive}` : ''}`}
                  onClick={() => changeDays(option)}
                >
                  {option} dni
                </button>
              ))}
            </div>
            <span className={styles.queueBadge}>{holes.count ?? 0}</span>
          </div>
        </div>

        {!sortedHoles.length ? (
          <p className={styles.emptyQueue}>Brak dziur — wszystkie zaplanowane zmiany są obsadzone.</p>
        ) : (
          <>
            <ul className={styles.holesList}>
              {visibleHoles.map((hole) => (
                <li key={`${hole.date}-${hole.shift_template_id}`} className={styles.holesItem}>
                  <div className={styles.holesItemMain}>
                    <strong>{hole.date}</strong>
                    <span className={styles.holesShiftName}>{hole.shift_template_name}</span>
                    <span className={styles.holesHours}>
                      {hole.start_time?.slice(0, 5)} – {hole.end_time?.slice(0, 5)}
                    </span>
                  </div>
                  <div className={styles.holesItemMeta}>
                    <span className={styles.holesNeeded}>
                      brakuje {hole.needed} / {hole.max_slots}
                    </span>
                    <small>
                      Obsada: {hole.filled}
                      {hole.holders?.length ? ` · ${hole.holders.map((holder) => holder.name).join(', ')}` : ' · nikt'}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
            {sortedHoles.length > PREVIEW_COUNT ? (
              <button
                type="button"
                className={`${styles.btnSecondary} ${styles.holesExpandBtn}`}
                onClick={() => setShowAll((prev) => !prev)}
                aria-expanded={showAll}
              >
                {showAll ? 'Zwiń' : `Pokaż więcej (${sortedHoles.length - PREVIEW_COUNT})`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
};

export default ScheduleHolesCard;
