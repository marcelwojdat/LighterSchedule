import React, { useState } from 'react';
import styles from '../Manager.module.css';
import { normalizeLogin } from '../../utils/people';

const EMPTY_FORM = {
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  is_manager: false,
  hourly_rate: '20',
};

const TEXT_FIELDS = [
  ['username', 'text', 'Login'],
  ['first_name', 'text', 'Imię'],
  ['last_name', 'text', 'Nazwisko'],
  ['email', 'email', 'E-mail'],
];

/** Returns an error message, or null when the form can be sent. */
const validate = (form) => {
  const requiredFilled = ['username', 'first_name', 'last_name', 'email'].every((name) => form[name].trim());
  return requiredFilled ? null : 'Uzupełnij wszystkie pola formularza nowej osoby.';
};

/**
 * New employee or manager account, without a password: the person sets it from the e-mailed invite link.
 * `onSubmit(payload)` resolves to true on success.
 * The form is unmounted when closed, so its fields reset by themselves.
 */
const AddUserForm = ({ onSubmit, onCancel, onError }) => {
  const [form, setForm] = useState(EMPTY_FORM);

  const update = (name, value) =>
    setForm((prev) => ({ ...prev, [name]: name === 'username' ? normalizeLogin(value) : value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const error = validate(form);
    if (error) {
      onError(error);
      return;
    }
    await onSubmit({
      username: form.username.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
      is_manager: form.is_manager,
      hourly_rate: form.hourly_rate === '' ? 0 : Number(form.hourly_rate),
    });
  };

  return (
    <form className={styles.userCreateForm} onSubmit={handleSubmit}>
      <div className={styles.userCreateGrid}>
        {TEXT_FIELDS.map(([name, type, placeholder]) => (
          <input
            key={name}
            type={type}
            placeholder={placeholder}
            value={form[name]}
            onChange={(event) => update(name, event.target.value)}
            autoCapitalize={name === 'username' ? 'none' : undefined}
            spellCheck={name === 'username' ? false : undefined}
            required
          />
        ))}
        <input
          type="number"
          step="0.01"
          placeholder="Stawka zł/h"
          value={form.hourly_rate}
          onChange={(event) => update('hourly_rate', event.target.value)}
        />
      </div>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={form.is_manager}
          onChange={(event) => update('is_manager', event.target.checked)}
        />
        Konto kierownika
      </label>
      <p className={styles.statHint}>
        Osoba dostanie e-mail z loginem i linkiem do ustawienia hasła. Link zobaczysz też tutaj, gdyby e-mail nie dotarł.
      </p>
      <div className={styles.queueActions}>
        <button type="submit" className={styles.btnPrimary}>
          Dodaj osobę
        </button>
        <button type="button" className={styles.btnSecondary} onClick={onCancel}>
          Anuluj
        </button>
      </div>
    </form>
  );
};

export default AddUserForm;
