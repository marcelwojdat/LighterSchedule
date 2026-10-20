import React, { useState } from 'react';
import styles from '../Manager.module.css';

/**
 * Rejection note: pick a saved reason or type your own.
 * Controlled — the parent owns `value`; only "is the text field open" lives here.
 */
const RejectionReasonPicker = ({ reasons, value, onChange }) => {
  const [noteOpen, setNoteOpen] = useState(false);

  const pickReason = (text) => {
    onChange(text);
    if (text) setNoteOpen(true); // show the picked text so it can be adjusted
  };

  return (
    <div className={styles.rejectReasonBlock}>
      {reasons.length ? (
        <label className={styles.rejectReasonSelectLabel}>
          Gotowy powód
          <select
            className={styles.rejectReasonSelect}
            value={reasons.some((reason) => reason.text === value) ? value : ''}
            onChange={(event) => pickReason(event.target.value)}
            aria-label="Gotowy powód odrzucenia"
          >
            <option value="">Wybierz (opcjonalnie)</option>
            {reasons.map((reason) => (
              <option key={reason.id} value={reason.text}>
                {reason.text}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {noteOpen ? (
        <input
          className={styles.rejectionInput}
          type="text"
          placeholder="Własna uwaga dla pracownika (opcjonalnie)"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={255}
        />
      ) : (
        <button type="button" className={styles.btnLink} onClick={() => setNoteOpen(true)}>
          Dodaj uwagę
        </button>
      )}
    </div>
  );
};

export default RejectionReasonPicker;
