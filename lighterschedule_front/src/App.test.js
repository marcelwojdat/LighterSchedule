import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

// Routing test: every page is replaced by a stub, so only the route table is checked.
jest.mock('./components/Login', () => () => <h1>Zaloguj się</h1>);
jest.mock('./components/Register', () => () => <h1>Załóż konto firmy</h1>);
jest.mock('./components/Dashboard', () => () => <h1>Dashboard</h1>);
jest.mock('./components/Manager', () => () => <h1>Panel managera</h1>);
jest.mock('./components/Profile', () => () => <h1>Profil</h1>);
jest.mock('./components/ProtectedRoute', () => ({ children }) => children);
jest.mock('./components/RoleRedirect', () => () => <h1>Przekierowanie</h1>);
jest.mock('./components/marketing/PublicLayout', () => {
  const { Outlet } = require('react-router-dom');
  return function PublicLayoutStub() {
    return <Outlet />;
  };
});
jest.mock('./components/marketing/Landing', () => () => <h1>Strona główna</h1>);
jest.mock('./components/marketing/LegalPages', () => ({
  TermsPage: () => <h1>Regulamin</h1>,
  PrivacyPage: () => <h1>Polityka prywatności</h1>,
}));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

test.each([
  ['/', 'Strona główna'],
  ['/login', 'Zaloguj się'],
  ['/register', 'Załóż konto firmy'],
  ['/terms', 'Regulamin'],
  ['/privacy', 'Polityka prywatności'],
  ['/dashboard', 'Dashboard'],
  ['/manager', 'Panel managera'],
])('route %s renders "%s"', (path, heading) => {
  renderAt(path);
  expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
});

test.each(['/pricing', '/checkout', '/nie-istnieje'])('unknown route %s redirects to home page', (path) => {
  renderAt(path);
  expect(screen.getByRole('heading', { name: 'Strona główna' })).toBeInTheDocument();
});
