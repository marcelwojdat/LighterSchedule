import React from 'react';
import { Link } from 'react-router-dom';
import styles from './MarketingStub.module.css';

/** Temporary stub until pricing page ships in the next commit. */
const PricingStub = () => (
  <div className={styles.stub}>
    <p className={styles.eyebrow}>Cennik</p>
    <h1>Plany LighterSchedule</h1>
    <p>
      Strona planów Basic i Extended jest w przygotowaniu. Wróć na start albo zaloguj się do
      istniejącego konta.
    </p>
    <div className={styles.actions}>
      <Link to="/" className={styles.primary}>
        Strona główna
      </Link>
      <Link to="/login" className={styles.secondary}>
        Zaloguj
      </Link>
    </div>
  </div>
);

export default PricingStub;
