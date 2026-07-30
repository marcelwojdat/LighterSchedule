import React, { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { getPlan } from './plans';
import { runCheckoutPayment } from './mockPayment';
import styles from './Checkout.module.css';

const PAYMENT_METHODS = [
  { id: 'card', label: 'Karta' },
  { id: 'blik', label: 'BLIK' },
  { id: 'transfer', label: 'Przelew' },
];

const emptyForm = {
  companyOrName: '',
  email: '',
  nip: '',
  paymentMethod: 'card',
  acceptTerms: false,
};

const Checkout = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const plan = useMemo(() => getPlan(params.get('plan')), [params]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!plan) {
    return <Navigate to="/pricing" replace />;
  }

  const updateField = (field) => (event) => {
    const value = field === 'acceptTerms' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.companyOrName.trim()) {
      setError('Podaj nazwę firmy lub imię i nazwisko.');
      return;
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Podaj poprawny adres e-mail.');
      return;
    }
    if (!form.acceptTerms) {
      setError('Zaakceptuj regulamin i informację o RODO.');
      return;
    }

    setBusy(true);
    try {
      const result = await runCheckoutPayment({
        planId: plan.id,
        companyOrName: form.companyOrName.trim(),
        email: form.email.trim().toLowerCase(),
        nip: form.nip.trim(),
        paymentMethod: form.paymentMethod,
      });
      if (result.redirecting && result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      navigate(`/checkout/success?plan=${plan.id}&order=${result.orderId}`);
    } catch (err) {
      const message =
        err?.response?.data?.error ||
        err?.message ||
        'Nie udało się rozpocząć płatności.';
      setError(message);
      if (!err?.response?.data?.error) {
        navigate(`/checkout/cancel?plan=${plan.id}&reason=payment_error`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        <section className={styles.summary} aria-labelledby="checkout-summary">
          <p className={styles.eyebrow}>Podsumowanie</p>
          <h1 id="checkout-summary" className={styles.title}>
            Plan {plan.name}
          </h1>
          <p className={styles.price}>
            <span className={styles.priceValue}>{plan.priceDisplay}</span>
            <span className={styles.priceMeta}>
              {' '}
              {plan.currency} / {plan.period}
            </span>
          </p>
          <p className={styles.priceHint}>{plan.pricePln.toFixed(2)} PLN miesięcznie</p>
          <ul className={styles.limits}>
            <li>
              <strong>{plan.managers}</strong>{' '}
              {plan.managers === 1 ? 'kierownik' : 'kierowników'}
            </li>
            <li>
              do <strong>{plan.employees}</strong> pracowników
            </li>
          </ul>
          <p className={styles.summaryNote}>{plan.summary}</p>
          <Link to="/pricing" className={styles.changePlan}>
            Zmień plan
          </Link>
        </section>

        <section className={styles.formSection} aria-labelledby="checkout-form-title">
          <h2 id="checkout-form-title" className={styles.formTitle}>
            Dane kupującego
          </h2>
          <p className={styles.formLead}>
            Po „Zapłać” przejdziesz do bezpiecznej płatności (mock lokalnie albo Stripe na
            produkcji).
          </p>

          {error ? <div className={styles.errorBox}>{error}</div> : null}

          <form className={`${styles.form} lsFields`} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span>Firma / imię i nazwisko</span>
              <input
                type="text"
                value={form.companyOrName}
                onChange={updateField('companyOrName')}
                autoComplete="organization"
                required
                maxLength={120}
              />
            </label>

            <label className={styles.field}>
              <span>E-mail</span>
              <input
                type="email"
                value={form.email}
                onChange={updateField('email')}
                autoComplete="email"
                required
                maxLength={120}
              />
            </label>

            <label className={styles.field}>
              <span>NIP (opcjonalnie)</span>
              <input
                type="text"
                value={form.nip}
                onChange={updateField('nip')}
                inputMode="numeric"
                maxLength={13}
                placeholder="np. 1234567890"
              />
            </label>

            <fieldset className={styles.methods}>
              <legend>Metoda płatności</legend>
              <div className={styles.methodRow}>
                {PAYMENT_METHODS.map((method) => (
                  <label key={method.id} className={styles.methodOption}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method.id}
                      checked={form.paymentMethod === method.id}
                      onChange={updateField('paymentMethod')}
                    />
                    <span>{method.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className={`checkboxRow ${styles.terms}`}>
              <input
                type="checkbox"
                checked={form.acceptTerms}
                onChange={updateField('acceptTerms')}
              />
              <span>
                Akceptuję{' '}
                <Link to="/terms" target="_blank" rel="noreferrer">
                  regulamin
                </Link>{' '}
                oraz{' '}
                <Link to="/privacy" target="_blank" rel="noreferrer">
                  politykę prywatności (RODO)
                </Link>
                .
              </span>
            </label>

            <div className={styles.actions}>
              <button type="submit" className={styles.payBtn} disabled={busy}>
                {busy ? 'Przetwarzanie…' : `Zapłać ${plan.priceDisplay} ${plan.currency}`}
              </button>
              <Link
                to={`/checkout/cancel?plan=${plan.id}&reason=user_cancel`}
                className={styles.cancelLink}
              >
                Anuluj płatność
              </Link>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};

export default Checkout;
