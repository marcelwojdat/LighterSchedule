import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTheme } from '../../hooks/useTheme';
import styles from './PublicLayout.module.css';

const PublicLayout = () => {
  const { darkMode, toggleTheme } = useTheme();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  return (
    <div className={styles.shell} data-marketing="true">
      <a className={styles.skipLink} href="#main">
        Przejdź do treści
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.logo} aria-label="ProstyGrafik — strona główna">
            <span className={styles.logoMark}>LS</span>
            <span className={styles.logoText}>ProstyGrafik</span>
          </Link>

          <button
            type="button"
            className={styles.menuToggle}
            aria-expanded={menuOpen}
            aria-controls="public-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? 'Zamknij' : 'Menu'}
          </button>

          <nav
            id="public-nav"
            className={`${styles.nav}${menuOpen ? ` ${styles.navOpen}` : ''}`}
            aria-label="Główna"
          >
            <NavLink to="/" end className={({ isActive }) => (isActive ? styles.navActive : undefined)}>
              Start
            </NavLink>
            <a href="/#jak-dziala">Jak działa</a>
            <a href="/#funkcje">Funkcje</a>
            <NavLink
              to="/pricing"
              className={({ isActive }) => (isActive ? styles.navActive : undefined)}
            >
              Cennik
            </NavLink>
            <NavLink to="/login" className={({ isActive }) => (isActive ? styles.navActive : undefined)}>
              Zaloguj
            </NavLink>
            <Link to="/pricing" className={styles.navCta}>
              Wypróbuj
            </Link>
            <button
              type="button"
              className={styles.themeBtn}
              onClick={toggleTheme}
              aria-label={darkMode ? 'Włącz jasny motyw' : 'Włącz ciemny motyw'}
            >
              {darkMode ? 'Jasny' : 'Ciemny'}
            </button>
          </nav>
        </div>
      </header>

      <main id="main" className={styles.main}>
        <Outlet />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <div className={styles.logoText}>ProstyGrafik</div>
            <p>Grafik zmianowy bez Excela i chaosu w wiadomościach.</p>
          </div>
          <div className={styles.footerLinks}>
            <Link to="/pricing">Cennik</Link>
            <Link to="/login">Logowanie</Link>
            <Link to="/terms">Regulamin</Link>
            <Link to="/privacy">Prywatność</Link>
            <a href="mailto:kontakt@prostygrafik.pl">Kontakt</a>
          </div>
          <p className={styles.copyright}>
            © {new Date().getFullYear()} ProstyGrafik. Wszelkie prawa zastrzeżone.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PublicLayout;
