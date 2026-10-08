import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import Auth from './Auth';

jest.mock('./Auth', () => ({
  __esModule: true,
  default: { register: jest.fn() },
}));

const VALID_FORM = {
  'Nazwa firmy': '  Piekarnia  ',
  Login: 'anna',
  'Imię': 'Anna',
  Nazwisko: 'Kowalska',
  'E-mail': 'anna@example.com',
  'Hasło': 'Bezpieczne#1',
  'Potwierdź hasło': 'Bezpieczne#1',
};

const fillForm = (overrides = {}) => {
  Object.entries({ ...VALID_FORM, ...overrides }).forEach(([label, value]) => {
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}$`, 'i')), { target: { value } });
  });
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: /załóż konto/i }));

describe('Register', () => {
  beforeEach(() => {
    Auth.register.mockReset();
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );
  });

  test('sends trimmed data with organization name', async () => {
    Auth.register.mockResolvedValue({ message: 'ok' });
    fillForm();
    submit();

    expect(await screen.findByText(/firma utworzona/i)).toBeInTheDocument();
    expect(Auth.register).toHaveBeenCalledWith({
      organization_name: 'Piekarnia',
      username: 'anna',
      first_name: 'Anna',
      last_name: 'Kowalska',
      email: 'anna@example.com',
      password: 'Bezpieczne#1',
    });
  });

  test('requires organization name', () => {
    fillForm({ 'Nazwa firmy': '   ' });
    submit();

    expect(screen.getByText(/uzupełnij wszystkie pola/i)).toBeInTheDocument();
    expect(Auth.register).not.toHaveBeenCalled();
  });

  test('rejects short password before calling API', () => {
    fillForm({ 'Hasło': 'short', 'Potwierdź hasło': 'short' });
    submit();

    expect(screen.getByText(/co najmniej 8 znaków/i)).toBeInTheDocument();
    expect(Auth.register).not.toHaveBeenCalled();
  });

  test('rejects mismatched passwords', () => {
    fillForm({ 'Potwierdź hasło': 'Inne#Haslo9' });
    submit();

    expect(screen.getByText(/hasła nie są takie same/i)).toBeInTheDocument();
    expect(Auth.register).not.toHaveBeenCalled();
  });

  test('shows validation error returned by the API', async () => {
    Auth.register.mockRejectedValue({ response: { data: { username: ['Użytkownik o tym loginie już istnieje.'] } } });
    fillForm();
    submit();

    expect(await screen.findByText('Użytkownik o tym loginie już istnieje.')).toBeInTheDocument();
  });
});
