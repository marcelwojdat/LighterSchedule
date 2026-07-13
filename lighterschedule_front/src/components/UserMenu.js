import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Settings2, SunMoon, LogOut, ChevronDown, LayoutDashboard, Shield } from 'lucide-react';
import styles from './UserMenu.module.css';

const UserMenu = ({ user, isManager, darkMode, onToggleTheme, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = user.name?.trim() || user.username || 'Użytkownik';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const closeMenu = () => setIsOpen(false);

  return (
    <div className={styles.menuWrapper} ref={menuRef}>
      <button
        type="button"
        className={styles.avatarButton}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <span className={styles.avatarInitials}>{initials}</span>
        <ChevronDown size={16} className={styles.chevron} />
      </button>

      <div className={`${styles.dropdown} ${isOpen ? styles.open : ''}`}>
        <div className={styles.menuHeader}>
          <div className={styles.iconCircle}>
            <User size={18} />
          </div>
          <div>
            <p className={styles.userName}>{displayName}</p>
            <p className={styles.userEmail}>{user.email || user.username}</p>
          </div>
        </div>

        <Link to="/dashboard" className={styles.menuLink} onClick={closeMenu}>
          <LayoutDashboard size={16} className={styles.linkIcon} />
          Panel pracownika
        </Link>

        {isManager ? (
          <Link to="/manager" className={styles.menuLink} onClick={closeMenu}>
            <Shield size={16} className={styles.linkIcon} />
            Panel kierownika
          </Link>
        ) : null}

        <Link to="/profile" className={styles.menuLink} onClick={closeMenu}>
          <Settings2 size={16} className={styles.linkIcon} />
          Ustawienia profilu
        </Link>

        <button type="button" className={styles.menuButton} onClick={onToggleTheme}>
          <SunMoon size={16} className={styles.linkIcon} />
          <span>{darkMode ? 'Tryb jasny' : 'Tryb ciemny'}</span>
          <span className={styles.stateTag}>{darkMode ? 'Włączony' : 'Wyłączony'}</span>
        </button>

        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => {
            closeMenu();
            onLogout();
          }}
        >
          <LogOut size={16} className={styles.linkIcon} />
          Wyloguj
        </button>
      </div>
    </div>
  );
};

export default UserMenu;
