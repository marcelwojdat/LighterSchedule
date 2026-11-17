import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import styles from './Register.module.css';
import { setPasswordFromLink } from '../api/auth';
import { getErrorMessage } from '../api/client';

const MIN_PASSWORD_LENGTH = 8;

/** Returns an error message, or null when the passwords can be sent (the server checks their strength). */
const validate = ({ password, passwordConfirm }) => {
  if (!password) return 'Podaj nowe hasło.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`;
  if (password !== passwordConfirm) return 'Hasła nie są takie same.';
  return null;
};

/** Page behind the invite link from the e-mail: /set-password/:uid/:token. */
const SetPassword = () => {
  const { uid, token } = useParams();
  const [form, setForm] = useState({ password: '', passwordConfirm: '' });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [username, setUsername] = useState(null); // set once the password is saved

  const updateField = (name) => (event) => setForm((prev) => ({ ...prev, [name]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const problem = validate(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSending(true);
    setError('');
    try {
      const data = await setPasswordFromLink({ uid, token, password: form.password });
      setUsername(data.username);
    } catch (err) {
      setError(getErrorMessage(err, 'Nie udało się ustawić hasła.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.registerPage}>
      <div className={styles.registerContainer}>
        <div className={styles.registerHeader}>
          <h2 className={styles.registerTitle}>Ustaw hasło</h2>
          <p className={styles.registerSubtitle}>Kierownik założył Ci konto. Wybierz hasło, którym będziesz się logować.</p>
        </div>

        {username ? (
          <>
            <div className={styles.successMessage} role="status">
              Hasło ustawione. Twój login: <strong>{username}</strong>
            </div>
            <Link className={styles.registerButton} to="/login">
              Przejdź do logowania
            </Link>
          </>
        ) : (
          <>
            {error ? (
              <div className={styles.errorMessage} role="alert">
                {error}
              </div>
            ) : null}
            <form className={`${styles.registerForm} lsFields`} onSubmit={handleSubmit} noValidate>
              <div className={styles.formGroup}>
                <label htmlFor="password">Nowe hasło</label>
                <input
                  id="password"
                  type="password"
                  placeholder={`Minimum ${MIN_PASSWORD_LENGTH} znaków`}
                  value={form.password}
                  onChange={updateField('password')}
                  autoComplete="new-password"
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="passwordConfirm">Powtórz hasło</label>
                <input
                  id="passwordConfirm"
                  type="password"
                  value={form.passwordConfirm}
                  onChange={updateField('passwordConfirm')}
                  autoComplete="new-password"
                />
              </div>
              <button className={styles.registerButton} type="submit" disabled={sending}>
                {sending ? 'Zapisywanie…' : 'Ustaw hasło'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default SetPassword;
