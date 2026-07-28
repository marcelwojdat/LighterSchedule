import React from 'react';
import { Link } from 'react-router-dom';
import { PLAN_ORDER, PLANS, SHARED_FEATURES } from './plans';
import styles from './Pricing.module.css';

const FAQ = [
  {
    q: 'Jak wygląda rozliczenie?',
    a: 'Subskrypcja miesięczna w PLN. Płatność online na kolejnym kroku (karta, BLIK lub przelew — w przygotowaniu).',
  },
  {
    q: 'Co oznaczają limity kont?',
    a: 'Basic: 1 kierownik i do 10 pracowników. Extended: 2 kierowników i do 100 pracowników. Liczymy aktywne konta w organizacji.',
  },
  {
    q: 'Co, jeśli przekroczę 10 lub 100 osób?',
    a: 'Nie dodasz kolejnego konta ponad limit planu. Możesz przejść na Extended albo zmniejszyć liczbę aktywnych użytkowników.',
  },
  {
    q: 'Czy mogę zmienić plan później?',
    a: 'Tak — upgrade lub downgrade będzie dostępny z panelu po uruchomieniu płatności. Na razie wybierasz plan przy zakupie.',
  },
];

const Pricing = () => (
  <div className={styles.page}>
    <header className={styles.intro}>
      <p className={styles.eyebrow}>Cennik</p>
      <h1 className={styles.title}>Proste plany, jasne limity</h1>
      <p className={styles.lead}>
        Wybierz wariant dopasowany do wielkości zespołu. Ceny w złotych polskich (PLN), rozliczenie
        miesięczne.
      </p>
    </header>

    <div className={styles.planGrid}>
      {PLAN_ORDER.map((id) => {
        const plan = PLANS[id];
        return (
          <article
            key={plan.id}
            className={`${styles.planCard}${plan.popular ? ` ${styles.planPopular}` : ''}`}
          >
            {plan.popular ? <span className={styles.badge}>Najpopularniejszy</span> : null}
            <h2 className={styles.planName}>{plan.name}</h2>
            <p className={styles.planSummary}>{plan.summary}</p>
            <p className={styles.price}>
              <span className={styles.priceValue}>{plan.priceDisplay}</span>
              <span className={styles.priceMeta}> {plan.currency} / {plan.period}</span>
            </p>
            <p className={styles.priceHint}>{plan.pricePln.toFixed(2)} PLN / miesiąc</p>

            <ul className={styles.limits}>
              <li>
                <strong>{plan.managers}</strong> {plan.managers === 1 ? 'kierownik' : 'kierowników'}
              </li>
              <li>
                do <strong>{plan.employees}</strong> pracowników
              </li>
            </ul>

            <Link to={`/checkout?plan=${plan.id}`} className={styles.planCta}>
              Wybierz {plan.name}
            </Link>
          </article>
        );
      })}
    </div>

    <section className={styles.sharedSection} aria-labelledby="shared-features">
      <h2 id="shared-features" className={styles.sectionTitle}>
        W obu planach
      </h2>
      <ul className={styles.sharedList}>
        {SHARED_FEATURES.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </section>

    <section className={styles.faqSection} aria-labelledby="pricing-faq">
      <h2 id="pricing-faq" className={styles.sectionTitle}>
        FAQ
      </h2>
      <dl className={styles.faqList}>
        {FAQ.map((item) => (
          <div key={item.q} className={styles.faqItem}>
            <dt>{item.q}</dt>
            <dd>{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>

    <p className={styles.backLink}>
      <Link to="/">← Wróć na stronę główną</Link>
    </p>
  </div>
);

export default Pricing;
