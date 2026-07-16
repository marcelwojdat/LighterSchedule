import React, { useEffect, useState } from 'react';
import Auth from './Auth';
import { useNavigate, Link } from 'react-router-dom';
import styles from './Login.module.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    Auth.getRegistrationStatus()
      .then((status) => setRegistrationOpen(status.open !== false))
      .catch(() => setRegistrationOpen(true));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await Auth.login(username, password);
      const user = await Auth.fetchCurrentUser();
      navigate(user.is_manager ? '/manager' : '/dashboard');
    } catch (err) {
      setError('Błędny login lub hasło!');
    }
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginContainer}>
        <div className={styles.loginHeader}>
          <h2 className={styles.loginTitle}>Zaloguj się</h2>
          <p className={styles.loginSubtitle}>Wróć do swojego grafiku pracy</p>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <form className={styles.loginForm} onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="username">Login</label>
            <input
              id="username"
              type="text"
              placeholder="Wpisz swoją nazwę użytkownika"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button className={styles.loginButton} type="submit">
            Zaloguj
          </button>
        </form>

        {registrationOpen ? (
          <div className={styles.loginFooter}>
            <p>
              Nie masz konta?{' '}
              <Link to="/register">Zarejestruj się tutaj</Link>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Login;
