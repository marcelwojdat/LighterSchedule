/** Shared plan catalog for pricing + checkout. */

export const PLANS = {
  basic: {
    id: 'basic',
    name: 'Basic',
    pricePln: 39.99,
    priceDisplay: '39,99',
    currency: 'PLN',
    period: 'miesiąc',
    managers: 1,
    employees: 10,
    popular: false,
    summary: 'Dla małego zespołu i jednego kierownika.',
  },
  extended: {
    id: 'extended',
    name: 'Extended',
    pricePln: 48.99,
    priceDisplay: '48,99',
    currency: 'PLN',
    period: 'miesiąc',
    managers: 2,
    employees: 100,
    popular: true,
    summary: 'Więcej kont — sklepy i większe brygady.',
  },
};

export const PLAN_ORDER = ['basic', 'extended'];

export const SHARED_FEATURES = [
  'Deklaracje dyspozycyjności i akceptacja kierownika',
  'Szablony zmian z limitami miejsc',
  'Zamiany i oddawanie zmian',
  'Eksport do kalendarza (iCal)',
  'Raport PDF godzin / payroll',
  'Alerty niedoboru i e-mail o decyzjach',
];

export const getPlan = (planId) => {
  if (!planId) return null;
  return PLANS[String(planId).toLowerCase()] || null;
};
