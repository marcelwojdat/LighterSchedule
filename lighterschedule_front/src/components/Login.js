import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Auth from './Auth';
import styles from './Login.module.css';
import { clearSession, getErrorMessage } from '../api/client';

const loginErrorMessage = (err) => {
  if (err.response?.status === 401) {
    return 'Błędny login lub hasło.';
  }
  return getErrorMessage(err, 'Nie udało się zalogować. Spróbuj ponownie.');
};

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      await Auth.login(username, password);
      const user = await Auth.fetchCurrentUser();
      navigate(user.is_manager ? '/manager' : '/dashboard');
    } catch (err) {
      clearSession(); // don't keep tokens of a half-finished login
      setError(loginErrorMessage(err));
    }
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginContainer}>
        <div className={styles.loginHeader}>
          <h2 className={styles.loginTitle}>Zaloguj się</h2>
          <p className={styles.loginSubtitle}>Wróć do swojego grafiku pracy</p>
        </div>

        {error && <div className={styles.errorMessage} role="alert">{error}</div>}

        <form className={`${styles.loginForm} lsFields`} onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="username">Login</label>
            <input
              id="username"
              type="text"
              placeholder="Wpisz swoją nazwę użytkownika"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Hasło</label>
            <input
              id="password"
              type="password"
              placeholder="Wpisz swoje hasło"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button className={styles.loginButton} type="submit">
            Zaloguj
          </button>
        </form>

        <div className={styles.loginFooter}>
          <p>
            Prowadzisz firmę? <Link to="/register">Załóż konto firmy</Link>
          </p>
          <p>Jesteś pracownikiem? Konto zakłada Ci kierownik.</p>
          <p>
            <Link to="/">← Strona główna</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
