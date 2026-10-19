import React from 'react';
import styles from '../Manager.module.css';

const ITEMS = [
  [styles.legendCoverageClosed, 'Dzień zamknięty (pełne obsadzenie)'],
  [styles.legendCoverageOpen, 'Dzień otwarty (brakuje osób)'],
  [styles.legendCoverageNone, 'Brak szablonów na ten dzień'],
];

/** Explains the day colours used by the team table and the employee calendar. */
const CoverageLegend = () => (
  <div className={styles.coverageLegend}>
    {ITEMS.map(([dotClass, label]) => (
      <div key={label} className={styles.legendItem}>
        <span className={`${styles.legendDot} ${dotClass}`} />
        {label}
      </div>
    ))}
  </div>
);

export default CoverageLegend;
