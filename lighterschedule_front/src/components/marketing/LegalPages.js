import React from 'react';
import { Link } from 'react-router-dom';
import styles from './MarketingStub.module.css';

const LegalPage = ({ title, children }) => (
  <div className={styles.stub}>
    <p className={styles.eyebrow}>Dokumenty</p>
    <h1>{title}</h1>
    <div className={styles.legalBody}>{children}</div>
    <div className={styles.actions}>
      <Link to="/" className={styles.secondary}>
        Wróć na start
      </Link>
    </div>
  </div>
);

export const TermsPage = () => (
  <LegalPage title="Regulamin">
    <p>
      Draft regulaminu korzystania z LighterSchedule. Pełna treść prawna pojawi się przed
      uruchomieniem sprzedaży.
    </p>
    <p>W razie pytań: kontakt@lighterschedule.pl</p>
  </LegalPage>
);

export const PrivacyPage = () => (
  <LegalPage title="Polityka prywatności">
    <p>
      Draft informacji o przetwarzaniu danych (RODO). Finalna wersja będzie dostępna przed
      startem płatności online.
    </p>
    <p>Kontakt w sprawie danych: kontakt@lighterschedule.pl</p>
  </LegalPage>
);
