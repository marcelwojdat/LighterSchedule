import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPlan } from './plans';
import { readMockOrder } from './mockPayment';
import styles from './CheckoutResult.module.css';

export const CheckoutSuccess = () => {
  const [params] = useSearchParams();
  const plan = useMemo(() => getPlan(params.get('plan')), [params]);
  const order = readMockOrder();
  const orderId =
    params.get('order') || params.get('session_id') || order?.orderId;
  const isStripeReturn = Boolean(params.get('session_id'));

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>Sukces</p>
      <h1 className={styles.title}>Dziękujemy za zakup</h1>
      <p className={styles.lead}>
        {isStripeReturn
          ? 'Płatność została przyjęta. Subskrypcja aktywuje się po potwierdzeniu z bramki (zwykle w kilka sekund).'
          : 'To była płatność testowa (mock). Nic nie zostało pobrane z karty ani konta.'}
      </p>

      <div className={styles.box}>
        {plan ? (
          <p>
            Plan: <strong>{plan.name}</strong> — {plan.priceDisplay} {plan.currency} / {plan.period}
          </p>
        ) : null}
        {orderId ? (
          <p>
            Numer zamówienia: <code>{orderId}</code>
          </p>
        ) : null}
        {order?.email ? (
          <p>
            Potwierdzenie wyślemy na <strong>{order.email}</strong> (gdy podłączymy wysyłkę).
          </p>
        ) : null}
      </div>

      <h2 className={styles.nextTitle}>Co dalej?</h2>
      <ol className={styles.nextList}>
        <li>Załóż konto kierownika (rejestracja lub zaproszenie od nas).</li>
        <li>Dodaj pracowników w panelu i ustaw szablony zmian.</li>
        <li>Sprawdź e-mail — w produkcji pojawi się link aktywacyjny subskrypcji.</li>
      </ol>

      <div className={styles.actions}>
        <Link to="/register" className={styles.primary}>
          Załóż konto
        </Link>
        <Link to="/login" className={styles.secondary}>
          Zaloguj się
        </Link>
        <Link to="/" className={styles.secondary}>
          Strona główna
        </Link>
      </div>
    </div>
  );
};

export const CheckoutCancel = () => {
  const [params] = useSearchParams();
  const plan = useMemo(() => getPlan(params.get('plan')), [params]);
  const reason = params.get('reason');

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>Anulowano</p>
      <h1 className={styles.title}>Płatność nie została dokończona</h1>
      <p className={styles.lead}>
        {reason === 'mock_error' || reason === 'payment_error'
          ? 'Wystąpił błąd płatności. Możesz spróbować ponownie.'
          : 'Anulowałeś proces albo wróciłeś z bramki płatności bez potwierdzenia.'}
      </p>
      {plan ? (
        <p className={styles.meta}>
          Wybrany plan: <strong>{plan.name}</strong>
        </p>
      ) : null}

      <div className={styles.actions}>
        <Link
          to={plan ? `/checkout?plan=${plan.id}` : '/pricing'}
          className={styles.primary}
        >
          Spróbuj ponownie
        </Link>
        <Link to="/pricing" className={styles.secondary}>
          Wróć do cennika
        </Link>
      </div>
    </div>
  );
};
