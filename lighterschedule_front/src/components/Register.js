import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Auth from './Auth';
import styles from './Register.module.css';
import { getErrorMessage } from '../api/client';

const MIN_PASSWORD_LENGTH = 8;
const REDIRECT_DELAY_MS = 2000;

const EMPTY_FORM = {
  organizationName: '',
  username: '',
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  passwordConfirm: '',
};

/** Returns an error message, or null when the form can be sent. */
const validate = (form) => {
  const requiredFilled = Object.entries(form)
    .filter(([name]) => !name.startsWith('password'))
    .every(([, value]) => value.trim());
  if (!requiredFilled || !form.password) {
    return 'Uzupełnij wszystkie pola formularza.';
  }
  if (form.password.length < MIN_PASSWORD_LENGTH) {
    return `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`;
  }
  if (form.password !== form.passwordConfirm) {
    return 'Hasła nie są takie same.';
  }
  return null;
};

const Register = () => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', text }
  const navigate = useNavigate();

  useEffect(() => {
    if (status?.type !== 'success') return undefined;
    const timer = setTimeout(() => navigate('/login'), REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, navigate]);

  const updateField = (name) => (event) => {
    setForm((prev) => ({ ...prev, [name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const error = validate(form);
    if (error) {
      setStatus({ type: 'error', text: error });
      return;
    }

    try {
      await Auth.register({
        organization_name: form.organizationName.trim(),
        username: form.username.trim(),
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setStatus({ type: 'success', text: 'Firma utworzona! Za chwilę przejdziesz do logowania.' });
    } catch (err) {
      setStatus({ type: 'error', text: getErrorMessage(err, 'Nie udało się założyć konta.') });
    }
  };

  return (
    <div className={styles.registerPage}>
      <div className={styles.registerContainer}>
        <div className={styles.registerHeader}>
          <h2 className={styles.registerTitle}>Załóż konto firmy</h2>
          <p className={styles.registerSubtitle}>
            Zostaniesz kierownikiem i dodasz pracowników w swoim panelu
          </p>
        </div>

        {status && (
          <div className={status.type === 'success' ? styles.successMessage : styles.errorMessage} role="status">
            {status.text}
          </div>
        )}

        <form className={`${styles.registerForm} lsFields`} onSubmit={handleSubmit} noValidate>
          <div className={styles.formGroup}>
            <label htmlFor="organizationName">Nazwa firmy</label>
            <input
              id="organizationName"
              type="text"
              placeholder="np. Piekarnia Kowalski"
              value={form.organizationName}
              onChange={updateField('organizationName')}
              autoComplete="organization"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="username">Login</label>
            <input
              id="username"
              type="text"
              placeholder="Wpisz nazwę użytkownika"
              value={form.username}
              onChange={updateField('username')}
              autoComplete="username"
            />
          </div>

          <div className={styles.nameRow}>
            <div className={styles.formGroup}>
              <label htmlFor="firstName">Imię</label>
              <input
                id="firstName"
                type="text"
                value={form.firstName}
                onChange={updateField('firstName')}
                autoComplete="given-name"
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="lastName">Nazwisko</label>
              <input
                id="lastName"
                type="text"
                value={form.lastName}
                onChange={updateField('lastName')}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              placeholder="np. jan@firma.pl"
              value={form.email}
              onChange={updateField('email')}
              autoComplete="email"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Hasło</label>
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
            <label htmlFor="passwordConfirm">Potwierdź hasło</label>
            <input
              id="passwordConfirm"
              type="password"
              placeholder="Powtórz hasło"
              value={form.passwordConfirm}
              onChange={updateField('passwordConfirm')}
              autoComplete="new-password"
            />
          </div>

          <button className={styles.registerButton} type="submit" disabled={status?.type === 'success'}>
            Załóż konto
          </button>
        </form>

        <div className={styles.registerFooter}>
          <p>
            Masz już konto? <Link to="/login">Zaloguj się tutaj</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
