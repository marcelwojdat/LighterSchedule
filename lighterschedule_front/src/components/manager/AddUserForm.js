import React, { useState } from 'react';
import styles from '../Manager.module.css';

const MIN_PASSWORD_LENGTH = 8;

const EMPTY_FORM = {
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  is_manager: false,
  hourly_rate: '20',
};

const TEXT_FIELDS = [
  ['username', 'text', 'Login'],
  ['first_name', 'text', 'Imię'],
  ['last_name', 'text', 'Nazwisko'],
  ['email', 'email', 'E-mail'],
  ['password', 'password', `Hasło (min. ${MIN_PASSWORD_LENGTH} znaków)`],
];

/** Returns an error message, or null when the form can be sent. */
const validate = (form) => {
  const requiredFilled = ['username', 'first_name', 'last_name', 'email'].every((name) => form[name].trim());
  if (!requiredFilled || !form.password) return 'Uzupełnij wszystkie pola formularza nowej osoby.';
  if (form.password.length < MIN_PASSWORD_LENGTH) return `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`;
  return null;
};

/**
 * New employee or manager account. `onSubmit(payload)` resolves to true on success.
 * The form is unmounted when closed, so its fields reset by themselves.
 */
const AddUserForm = ({ onSubmit, onCancel, onError }) => {
  const [form, setForm] = useState(EMPTY_FORM);

  const update = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

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
      password: form.password,
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
            minLength={name === 'password' ? MIN_PASSWORD_LENGTH : undefined}
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
