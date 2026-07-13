import React, { useState } from 'react';
import Auth from './Auth';
import { useNavigate, Link } from 'react-router-dom';
import styles from './Login.module.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const navigate = useNavigate(); 

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
            />
          </div>

          <button className={styles.loginButton} type="submit">
            Zaloguj
          </button>
        </form>

        <div className={styles.loginFooter}>
          <p>
            Nie masz konta?{' '}
            <Link to="/register">Zarejestruj się tutaj</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;