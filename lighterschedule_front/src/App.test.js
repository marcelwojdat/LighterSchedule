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
