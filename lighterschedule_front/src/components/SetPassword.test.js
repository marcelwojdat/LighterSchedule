import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SetPassword from './SetPassword';
import * as authApi from '../api/auth';

jest.mock('../api/auth');

const renderAt = (path = '/set-password/MTI/abc-123') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/set-password/:uid/:token" element={<SetPassword />} />
        <Route path="/login" element={<p>Strona logowania</p>} />
      </Routes>
    </MemoryRouter>,
  );

const fill = (password, confirm = password) => {
  fireEvent.change(screen.getByLabelText('Nowe hasło'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Powtórz hasło'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Ustaw hasło' }));
};

test('sends the uid and token from the link and shows the login afterwards', async () => {
  authApi.setPasswordFromLink.mockResolvedValue({ message: 'ok', username: 'ola.nowak' });
  renderAt();

  fill('Moje#Nowe#Haslo9');

  expect(await screen.findByRole('status')).toHaveTextContent('Hasło ustawione. Twój login: ola.nowak');
  expect(authApi.setPasswordFromLink).toHaveBeenCalledWith({ uid: 'MTI', token: 'abc-123', password: 'Moje#Nowe#Haslo9' });
  expect(screen.queryByLabelText('Nowe hasło')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Przejdź do logowania' }));
  expect(screen.getByText('Strona logowania')).toBeInTheDocument();
});

test('different or too short passwords are not sent', () => {
  renderAt();

  fill('Moje#Nowe#Haslo9', 'Moje#Inne#Haslo9');
  expect(screen.getByRole('alert')).toHaveTextContent('Hasła nie są takie same.');

  fill('krotkie');
  expect(screen.getByRole('alert')).toHaveTextContent('co najmniej 8 znaków');
  expect(authApi.setPasswordFromLink).not.toHaveBeenCalled();
});

test('a used or expired link shows the reason from the server and keeps the form', async () => {
  authApi.setPasswordFromLink.mockRejectedValue({
    response: { status: 400, data: { error: 'Link jest nieprawidłowy, został już użyty albo wygasł. Poproś kierownika o nowy.' } },
  });
  renderAt();

  fill('Moje#Nowe#Haslo9');

  expect(await screen.findByRole('alert')).toHaveTextContent('Poproś kierownika o nowy.');
  expect(screen.getByRole('button', { name: 'Ustaw hasło' })).toBeEnabled();
});
