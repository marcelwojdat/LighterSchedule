import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPlan } from './plans';
import styles from './MarketingStub.module.css';

/**
 * Temporary checkout placeholder until the payments page ships.
 * Keeps /checkout?plan=basic|extended reachable from pricing CTAs.
 */
const CheckoutStub = () => {
  const [params] = useSearchParams();
  const plan = getPlan(params.get('plan'));

  if (!plan) {
    return (
      <div className={styles.stub}>
        <p className={styles.eyebrow}>Płatność</p>
        <h1>Wybierz plan</h1>
        <p>Aby przejść do płatności, najpierw wybierz plan Basic lub Extended.</p>
        <div className={styles.actions}>
          <Link to="/pricing" className={styles.primary}>
            Zobacz cennik
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stub}>
      <p className={styles.eyebrow}>Płatność</p>
      <h1>Checkout — {plan.name}</h1>
      <p>
        Wybrano plan <strong>{plan.name}</strong> za{' '}
        <strong>
          {plan.priceDisplay} {plan.currency}
        </strong>{' '}
        / {plan.period} ({plan.managers}{' '}
        {plan.managers === 1 ? 'kierownik' : 'kierowników'}, do {plan.employees} pracowników).
      </p>
      <p>Pełny formularz płatności (mock / bramka) pojawi się w kolejnym kroku wdrożenia.</p>
      <div className={styles.actions}>
        <Link to="/pricing" className={styles.secondary}>
          Zmień plan
        </Link>
        <Link to="/" className={styles.secondary}>
          Strona główna
        </Link>
      </div>
    </div>
  );
};

export default CheckoutStub;
