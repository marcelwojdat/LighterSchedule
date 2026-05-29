import React, { useEffect, useRef, useState } from 'react';
import { User, Settings2, SunMoon, LogOut, ChevronDown } from 'lucide-react';
import styles from './UserMenu.module.css';

const UserMenu = ({ user, darkMode, onToggleTheme, onLogout }) => {
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

  const initials = user.name
    .split(' ')
    .map((segment) => segment[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

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
            <p className={styles.userName}>{user.name}</p>
            <p className={styles.userEmail}>{user.email}</p>
          </div>
        </div>

        <a href="/profile" className={styles.menuLink}>
          <Settings2 size={16} className={styles.linkIcon} />
          Ustawienia profilu
        </a>

        <button type="button" className={styles.menuButton} onClick={onToggleTheme}>
          <SunMoon size={16} className={styles.linkIcon} />
          <span>{darkMode ? 'Tryb jasny' : 'Tryb ciemny'}</span>
          <span className={styles.stateTag}>{darkMode ? 'Włączony' : 'Wyłączony'}</span>
        </button>

        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => {
            setIsOpen(false);
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
