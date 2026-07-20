import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Auth from './Auth';
import UserMenu from './UserMenu';
import styles from './Profile.module.css';
import { getErrorMessage } from '../api/client';
import { getCurrentUser, updateCurrentUser, changePassword } from '../api/users';
import { useTheme } from '../hooks/useTheme';
import { useAutoDismiss } from '../hooks/useAutoDismiss';

const Profile = () => {
  const { darkMode, toggleTheme } = useTheme();
  const [currentUser, setCurrentUser] = useState(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
  });
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  useAutoDismiss(success, setSuccess);

  const loadUser = async () => {
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
      setFormData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const updated = await updateCurrentUser(formData);
      setCurrentUser(updated);
      setSuccess('Profil został zaktualizowany.');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (passwordData.new_password !== passwordData.confirm_password) {
      setError('Nowe hasła nie są identyczne.');
      return;
    }

    try {
      await changePassword({
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
      });
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      setSuccess('Hasło zostało zmienione.');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleLogout = () => {
    Auth.logout();
  };

  if (loading) {
    return <div className={styles.loading}>Ładowanie profilu...</div>;
  }

  return (
    <div className={styles.profilePage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Ustawienia profilu</h1>
          <p className={styles.pageSubtitle}>Zarządzaj danymi konta i hasłem</p>
        </div>
        {currentUser ? (
          <UserMenu
            user={{
              name: `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim(),
              email: currentUser.email,
              username: currentUser.username,
            }}
            isManager={currentUser.is_manager}
            darkMode={darkMode}
            onToggleTheme={toggleTheme}
            onLogout={handleLogout}
          />
        ) : null}
      </div>

      <div className={styles.backLinkWrap}>
        <Link to={currentUser?.is_manager ? '/manager' : '/dashboard'} className={styles.backLink}>
          ← Wróć do panelu
        </Link>
      </div>

      {error ? <div className={styles.errorBox}>{error}</div> : null}
      {success ? <div className={styles.successBox}>{success}</div> : null}

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>Dane osobowe</h2>
          <form onSubmit={handleProfileSubmit} className={styles.form}>
            <label>
              Login
              <input type="text" value={currentUser?.username || ''} disabled />
            </label>
            <label>
              Imię
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, first_name: e.target.value }))}
              />
            </label>
            <label>
              Nazwisko
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, last_name: e.target.value }))}
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              />
            </label>
            <label>
              Stawka godzinowa
              <input
                type="text"
                value={currentUser?.hourly_rate != null ? `${currentUser.hourly_rate} zł/h` : '—'}
                disabled
              />
              <small className={styles.fieldHint}>Stawkę ustawia kierownik.</small>
            </label>
            <button type="submit" className={styles.primaryBtn}>
              Zapisz zmiany
            </button>
          </form>
        </section>

        <section className={styles.card}>
          <h2>Zmiana hasła</h2>
          <form onSubmit={handlePasswordSubmit} className={styles.form}>
            <label>
              Obecne hasło
              <input
                type="password"
                value={passwordData.current_password}
                onChange={(e) => setPasswordData((prev) => ({ ...prev, current_password: e.target.value }))}
              />
            </label>
            <label>
              Nowe hasło
              <input
                type="password"
                value={passwordData.new_password}
                onChange={(e) => setPasswordData((prev) => ({ ...prev, new_password: e.target.value }))}
              />
            </label>
            <label>
              Potwierdź nowe hasło
              <input
                type="password"
                value={passwordData.confirm_password}
                onChange={(e) => setPasswordData((prev) => ({ ...prev, confirm_password: e.target.value }))}
              />
            </label>
            <small className={styles.fieldHint}>Minimum 8 znaków.</small>
            <button type="submit" className={styles.primaryBtn}>
              Zmień hasło
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default Profile;
