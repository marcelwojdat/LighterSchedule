import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import Auth from './Auth';

jest.mock('./Auth', () => ({
  __esModule: true,
  default: {
    getRegistrationStatus: jest.fn(),
    register: jest.fn(),
  },
}));

const fillBaseFields = () => {
  fireEvent.change(screen.getByLabelText(/^login$/i), { target: { value: 'anna' } });
  fireEvent.change(screen.getByLabelText(/^imię$/i), { target: { value: 'Anna' } });
  fireEvent.change(screen.getByLabelText(/^nazwisko$/i), { target: { value: 'Kowalska' } });
  fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'anna@example.com' } });
};

const renderRegister = () =>
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );

describe('Register', () => {
  beforeEach(() => {
    Auth.getRegistrationStatus.mockResolvedValue({ open: true, invite_required: false });
    Auth.register.mockReset();
  });

  test('rejects short password before calling API', async () => {
    renderRegister();
    await screen.findByRole('heading', { name: /zarejestruj się/i });

    fillBaseFields();
    fireEvent.change(screen.getByLabelText(/^hasło$/i), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText(/potwierdź hasło/i), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /załóż konto/i }));

    expect(await screen.findByText(/co najmniej 8 znaków/i)).toBeInTheDocument();
    expect(Auth.register).not.toHaveBeenCalled();
  });

  test('rejects mismatched passwords', async () => {
    renderRegister();
    await screen.findByRole('heading', { name: /zarejestruj się/i });

    fillBaseFields();
    fireEvent.change(screen.getByLabelText(/^hasło$/i), { target: { value: 'haslo1234' } });
    fireEvent.change(screen.getByLabelText(/potwierdź hasło/i), { target: { value: 'haslo9999' } });
    fireEvent.click(screen.getByRole('button', { name: /załóż konto/i }));

    expect(await screen.findByText(/hasła nie są takie same/i)).toBeInTheDocument();
    expect(Auth.register).not.toHaveBeenCalled();
  });

  test('shows closed registration message when registration is disabled', async () => {
    Auth.getRegistrationStatus.mockResolvedValue({ open: false, invite_required: false });
    renderRegister();

    expect(await screen.findByRole('heading', { name: /rejestracja niedostępna/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /załóż konto/i })).not.toBeInTheDocument();
    });
  });
});
