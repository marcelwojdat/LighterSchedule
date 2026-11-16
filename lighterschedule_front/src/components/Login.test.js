import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from './Login';
import Auth from './Auth';

jest.mock('./Auth', () => ({
  __esModule: true,
  default: { login: jest.fn(), fetchCurrentUser: jest.fn(), isAuthenticated: jest.fn() },
}));

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/manager" element={<h1>Panel kierownika</h1>} />
        <Route path="/dashboard" element={<h1>Panel pracownika</h1>} />
      </Routes>
    </MemoryRouter>,
  );

describe('Login', () => {
  beforeEach(() => jest.resetAllMocks());

  test('a signed-in manager goes straight to the manager panel', async () => {
    Auth.isAuthenticated.mockReturnValue(true);
    Auth.fetchCurrentUser.mockResolvedValue({ is_manager: true });

    renderLogin();

    expect(await screen.findByRole('heading', { name: 'Panel kierownika' })).toBeInTheDocument();
  });

  test('a signed-in employee goes straight to the employee panel', async () => {
    Auth.isAuthenticated.mockReturnValue(true);
    Auth.fetchCurrentUser.mockResolvedValue({ is_manager: false });

    renderLogin();

    expect(await screen.findByRole('heading', { name: 'Panel pracownika' })).toBeInTheDocument();
  });

  test('when the session cannot be confirmed, the form is shown instead of redirecting', async () => {
    Auth.isAuthenticated.mockReturnValue(true);
    Auth.fetchCurrentUser.mockRejectedValue(new Error('Network Error'));

    renderLogin();

    expect(await screen.findByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
  });

  test('without a stored session the form shows at once and the server is not asked', () => {
    Auth.isAuthenticated.mockReturnValue(false);

    renderLogin();

    expect(screen.getByRole('heading', { name: 'Zaloguj się' })).toBeInTheDocument();
    expect(Auth.fetchCurrentUser).not.toHaveBeenCalled();
  });
});
