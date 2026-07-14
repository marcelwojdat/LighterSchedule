import React, { useState } from 'react';
import Auth from './Auth';
import { useNavigate, Link } from 'react-router-dom';
import styles from './Register.module.css';

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      await Auth.register(username, password);
      setMessage('Rejestracja udana! Teraz możesz się zalogować.');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setMessage('Błąd rejestracji. Może taki użytkownik już istnieje?');
    }
  };

  return (
    <div className={styles.registerPage}>
      <div className={styles.registerContainer}>
        <div className={styles.registerHeader}>
          <h2 className={styles.registerTitle}>Zarejestruj się</h2>
          <p className={styles.registerSubtitle}>Stwórz konto i zacznij planować</p>
        </div>

        {message && (
          <div className={message.includes('Rejestracja udana') ? styles.successMessage : styles.errorMessage}>
            {message}
          </div>
        )}

        <form className={styles.registerForm} onSubmit={handleRegister}>
          <div className={styles.formGroup}>
            <label htmlFor="username">Login</label>
            <input
              id="username"
              type="text"
              placeholder="Wpisz nową nazwę użytkownika"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Hasło</label>
            <input
              id="password"
              type="password"
              placeholder="Wpisz nowe hasło"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button className={styles.registerButton} type="submit">
            Załóż konto
          </button>
        </form>

        <div className={styles.registerFooter}>
          <p>
            Masz już konto?{' '}
            <Link to="/login">Zaloguj się tutaj</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;