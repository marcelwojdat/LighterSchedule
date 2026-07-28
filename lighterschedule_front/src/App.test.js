import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

jest.mock('./components/Login', () => () => <h2>Zaloguj się</h2>);
jest.mock('./components/Register', () => () => (
  <>
    <h2>Zarejestruj się</h2>
    <label htmlFor="firstName">Imię</label>
    <input id="firstName" />
    <label htmlFor="passwordConfirm">Potwierdź hasło</label>
    <input id="passwordConfirm" />
  </>
));
jest.mock('./components/Dashboard', () => () => <div>Dashboard mock</div>);
jest.mock('./components/Manager', () => () => <div>Manager mock</div>);
jest.mock('./components/Profile', () => () => <div>Profile mock</div>);
jest.mock('./components/ProtectedRoute', () => ({ children }) => children);
jest.mock('./components/RoleRedirect', () => () => <div>Role redirect</div>);
jest.mock('./components/marketing/PublicLayout', () => {
  const { Outlet } = require('react-router-dom');
  return function PublicLayoutMock() {
    return (
      <div>
        <nav>Public nav</nav>
        <Outlet />
      </div>
    );
  };
});
jest.mock('./components/marketing/Landing', () => () => (
  <h1>Grafik zmianowy, który ogarnia zespół</h1>
));
jest.mock('./components/marketing/Pricing', () => () => <h1>Proste plany, jasne limity</h1>);
jest.mock('./components/marketing/Checkout', () => () => <h1>Dane kupującego</h1>);
jest.mock('./components/marketing/CheckoutResult', () => ({
  CheckoutSuccess: () => <h1>Dziękujemy za zakup</h1>,
  CheckoutCancel: () => <h1>Płatność nie została dokończona</h1>,
}));
jest.mock('./components/marketing/LegalPages', () => ({
  TermsPage: () => <h1>Regulamin</h1>,
  PrivacyPage: () => <h1>Polityka prywatności</h1>,
}));

test('renders login route', () => {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByRole('heading', { name: /zaloguj się/i })).toBeInTheDocument();
});

test('renders register route', () => {
  render(
    <MemoryRouter initialEntries={['/register']}>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByRole('heading', { name: /zarejestruj się/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/imię/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/potwierdź hasło/i)).toBeInTheDocument();
});

test('renders public landing without login', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>
  );

  expect(
    screen.getByRole('heading', { name: /grafik zmianowy, który ogarnia zespół/i })
  ).toBeInTheDocument();
});

test('renders pricing page without login', () => {
  render(
    <MemoryRouter initialEntries={['/pricing']}>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByRole('heading', { name: /proste plany, jasne limity/i })).toBeInTheDocument();
});

test('renders checkout with plan without login', () => {
  render(
    <MemoryRouter initialEntries={['/checkout?plan=basic']}>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByRole('heading', { name: /dane kupującego/i })).toBeInTheDocument();
});

test('renders checkout success page', () => {
  render(
    <MemoryRouter initialEntries={['/checkout/success?plan=basic']}>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByRole('heading', { name: /dziękujemy za zakup/i })).toBeInTheDocument();
});
