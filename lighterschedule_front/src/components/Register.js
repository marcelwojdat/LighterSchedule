import React, { useState } from 'react';
import Auth from './Auth';
import { useNavigate, Link } from 'react-router-dom';
import styles from './Register.module.css';
import { getErrorMessage } from '../api/client';

const Register = () => {
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage('');

    if (!username.trim() || !password || !firstName.trim() || !lastName.trim() || !email.trim()) {
      setMessage('Uzupełnij wszystkie pola formularza.');
      return;
    }

    try {
      await Auth.register({
        username: username.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
      });
      setMessage('Rejestracja udana! Teraz możesz się zalogować.');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setMessage(getErrorMessage(err, 'Błąd rejestracji. Może taki użytkownik już istnieje?'));
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
              placeholder="Wpisz nazwę użytkownika"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className={styles.nameRow}>
            <div className={styles.formGroup}>
              <label htmlFor="firstName">Imię</label>
              <input
                id="firstName"
                type="text"
                placeholder="Imię"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="lastName">Nazwisko</label>
              <input
                id="lastName"
                type="text"
                placeholder="Nazwisko"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              placeholder="np. jan@firma.pl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Hasło</label>
            <input
              id="password"
              type="password"
              placeholder="Wpisz hasło"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
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
