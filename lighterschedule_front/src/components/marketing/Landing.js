import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Landing.module.css';

const STEPS = [
  {
    title: 'Deklaracja',
    text: 'Pracownik zaznacza dostępność w kalendarzu i wysyła propozycje zmian.',
  },
  {
    title: 'Akceptacja',
    text: 'Kierownik zatwierdza, odrzuca lub poprawia godziny — z limitem miejsc na zmianę.',
  },
  {
    title: 'Zamiany',
    text: 'Oddanie lub wymiana zmiany z kolegą, potem szybkie potwierdzenie kierownika.',
  },
  {
    title: 'Gotowy grafik',
    text: 'Zespół widzi zatwierdzony plan, eksport do kalendarza i raporty godzin.',
  },
];

const FEATURES = [
  {
    title: 'Limity na zmianę',
    text: 'Ustaw max. osób na Poranną czy Wieczorną — bez przypadkowego przepełnienia.',
  },
  {
    title: 'Szablony zmian',
    text: 'Nazwane zmiany z godzinami na dni tygodnia. Pracownik wybiera nazwę, nie wpisuje godzin.',
  },
  {
    title: 'Panel kierownika',
    text: 'Kolejka akceptacji, widok zespołu, dziury w grafiku i masowe zatwierdzanie.',
  },
  {
    title: 'Eksport i raporty',
    text: 'iCal / subskrypcja kalendarza oraz PDF payroll dla rozliczeń.',
  },
  {
    title: 'Deadline deklaracji',
    text: 'Po terminie tylko kierownik edytuje grafik — koniec spóźnionych zgłoszeń.',
  },
  {
    title: 'Powiadomienia e-mail',
    text: 'Akceptacja, odrzucenie i prośby o zamianę trafiają na skrzynkę.',
  },
];

const AUDIENCES = [
  {
    title: 'Sklep i retail',
    text: 'Rotacja kas i magazynu, jasne obsadzenie każdej zmiany.',
  },
  {
    title: 'Gastronomia',
    text: 'Poranne i wieczorne brygady bez chaosu w grupie na Messengerze.',
  },
  {
    title: 'Mały zespół zmianowy',
    text: 'Od kilku do kilkudziesięciu osób — jeden wspólny grafik online.',
  },
];

const Landing = () => (
  <div className={styles.page}>
    <section className={styles.hero} aria-labelledby="hero-brand">
      <div className={styles.heroInner}>
        <p id="hero-brand" className={styles.brand}>
          ProstyGrafik
        </p>
        <h1 className={styles.heroTitle}>Grafik zmianowy, który ogarnia zespół</h1>
        <p className={styles.heroLead}>
          Deklaracje, akceptacje i zamiany w jednym miejscu — zamiast Excela, kartek i
          niedomówień.
        </p>
        <div className={styles.heroCtas}>
          <Link to="/pricing" className={styles.btnPrimary}>
            Zobacz plany
          </Link>
          <Link to="/login" className={styles.btnGhost}>
            Zaloguj
          </Link>
        </div>
      </div>
      <div className={styles.heroVisual} aria-hidden="true">
        <div className={styles.heroGlow} />
        <div className={styles.schedulePreview}>
          <div className={styles.previewRow}>
            <span>Pon</span>
            <span className={styles.previewChip}>Poranna · 2/2</span>
          </div>
          <div className={styles.previewRow}>
            <span>Wt</span>
            <span className={styles.previewChipOpen}>Wieczorna · 1/2</span>
          </div>
          <div className={styles.previewRow}>
            <span>Śr</span>
            <span className={styles.previewChip}>Poranna · zatwierdzona</span>
          </div>
        </div>
      </div>
    </section>

    <section id="jak-dziala" className={styles.section}>
      <div className={styles.sectionInner}>
        <p className={styles.eyebrow}>Jak działa</p>
        <h2 className={styles.sectionTitle}>Od deklaracji do gotowego grafiku</h2>
        <p className={styles.sectionLead}>
          Cztery proste kroki — bez szkolenia z Excela i bez gubienia wiadomości.
        </p>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNum}>{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>

    <section id="funkcje" className={`${styles.section} ${styles.sectionAlt}`}>
      <div className={styles.sectionInner}>
        <p className={styles.eyebrow}>Funkcje</p>
        <h2 className={styles.sectionTitle}>Wszystko, czego potrzebuje grafik zmianowy</h2>
        <p className={styles.sectionLead}>
          Narzędzia dla pracowników i kierownika — w jednym, spójnym panelu.
        </p>
        <div className={styles.featureGrid}>
          {FEATURES.map((feature) => (
            <article key={feature.title} className={styles.featureItem}>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section id="dla-kogo" className={styles.section}>
      <div className={styles.sectionInner}>
        <p className={styles.eyebrow}>Dla kogo</p>
        <h2 className={styles.sectionTitle}>Zespoły, które żyją zmianami</h2>
        <div className={styles.audienceGrid}>
          {AUDIENCES.map((item) => (
            <article key={item.title} className={styles.audienceItem}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section id="opinie" className={`${styles.section} ${styles.sectionAlt}`}>
      <div className={styles.sectionInner}>
        <p className={styles.eyebrow}>Opinie</p>
        <h2 className={styles.sectionTitle}>Co mówią zespoły</h2>
        <p className={styles.sectionLead}>Wkrótce opinie klientów — miejsce przygotowane na prawdziwe historie.</p>
        <div className={styles.testimonialGrid} aria-label="Placeholdery opinii">
          {[1, 2, 3].map((slot) => (
            <div key={slot} className={styles.testimonialSkeleton}>
              <div className={styles.skeletonLine} />
              <div className={`${styles.skeletonLine} ${styles.skeletonShort}`} />
              <div className={styles.skeletonMeta}>Wkrótce opinia klienta</div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section id="porownanie" className={styles.section}>
      <div className={styles.sectionInner}>
        <p className={styles.eyebrow}>Dlaczego warto</p>
        <h2 className={styles.sectionTitle}>Excel i chaos vs ProstyGrafik</h2>
        <div className={styles.compare}>
          <div className={styles.compareCol}>
            <h3>Bez systemu</h3>
            <ul>
              <li>Arkusze, które się rozjeżdżają</li>
              <li>Prośby o zamianę giną w czacie</li>
              <li>Nikt nie wie, kto jest na zmianie</li>
              <li>Raporty godzin robione ręcznie</li>
            </ul>
          </div>
          <div className={`${styles.compareCol} ${styles.compareAccent}`}>
            <h3>Z ProstyGrafik</h3>
            <ul>
              <li>Jedna wspólna prawda o grafiku</li>
              <li>Zamiany z akceptacją kierownika</li>
              <li>Alerty o brakach obsady</li>
              <li>Eksport do kalendarza i PDF</li>
            </ul>
          </div>
        </div>
        <div className={styles.compareCta}>
          <Link to="/pricing" className={styles.btnPrimary}>
            Zobacz plany
          </Link>
        </div>
      </div>
    </section>
  </div>
);

export default Landing;
