/**
 * Characterization test for the employee dashboard: pins down what is shown and which API
 * calls user actions make, so the dashboard can be split into smaller components safely.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import Auth from './Auth';
import * as workdaysApi from '../api/workdays';
import * as swapsApi from '../api/swaps';
import * as usersApi from '../api/users';
import * as taskTypesApi from '../api/taskTypes';
import * as shiftTemplatesApi from '../api/shiftTemplates';
import * as notificationsApi from '../api/notifications';
import * as scheduleSettingsApi from '../api/scheduleSettings';
import { formatDateStr } from '../utils/dates';

// react-calendar ships ESM only (not transpiled by CRA's Jest). The stub offers one clickable
// day per popup kind (approved, pending, empty) and renders their tiles, so tile callbacks run too.
const mockCalendarDays = [new Date(2030, 0, 8), new Date(2030, 0, 9), new Date(2030, 0, 10)];
jest.mock('react-calendar', () => ({ onChange, tileClassName, tileContent }) => (
  <div data-testid="calendar">
    {mockCalendarDays.map((day) => (
      <div key={day.getDate()} className={tileClassName?.({ date: day, view: 'month' }) || ''}>
        <button type="button" onClick={() => onChange(day)}>
          {`Dzień ${day.getDate()}`}
        </button>
        {tileContent?.({ date: day, view: 'month' })}
      </div>
    ))}
  </div>
));
jest.mock('react-calendar/dist/Calendar.css', () => ({}));
jest.mock('./Auth', () => ({
  __esModule: true,
  default: { fetchCurrentUser: jest.fn(), logout: jest.fn() },
}));
// CRA resets mock implementations before every test (resetMocks: true), so return values are set in beforeEach.
jest.mock('../api/workdays');
jest.mock('../api/swaps');
jest.mock('../api/users');
jest.mock('../api/taskTypes');
jest.mock('../api/shiftTemplates');
jest.mock('../api/notifications');
jest.mock('../api/scheduleSettings');

const ME = { id: 2, username: 'anna', first_name: 'Anna', last_name: 'Nowak', email: 'anna@example.com', is_manager: false };
const COLLEAGUE = { id: 3, username: 'piotr', first_name: 'Piotr', last_name: 'Lis', is_manager: false };
const MORNING = {
  id: 7, name: 'Poranna', is_active: true, is_full: false,
  hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_time: '06:00:00', end_time: '14:00:00' })),
};
const day = (fields) => ({
  role: null, role_name: null, note: '', shift_template: 7, shift_template_name: 'Poranna',
  start_time: '06:00:00', end_time: '14:00:00', total_hours: 8, earnings: 160, ...fields,
});
const APPROVED = day({ id: 40, date: '2030-01-08', status: 'approved' });
const PROPOSED = day({ id: 41, date: '2030-01-09', status: 'proposed' });
const THIS_MONTH = day({ id: 42, date: `${formatDateStr(new Date()).slice(0, 7)}-01`, status: 'approved' });
const RECEIVED_SWAP = {
  id: 50, status: 'pending_target', requested_by: 3, target_user: 2, requested_by_name: 'piotr',
  is_two_way: false, work_day: 99, work_day_details: { date: '2030-01-12', start_time: '14:00:00', end_time: '22:00:00' },
};

let settings;

beforeEach(() => {
  settings = { declarations_closed: false, declaration_close_label: null };
  Element.prototype.scrollIntoView = jest.fn(); // jsdom has no layout, so it lacks scrollIntoView
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  Auth.fetchCurrentUser.mockResolvedValue(ME);
  workdaysApi.getWorkdays.mockResolvedValue([APPROVED, PROPOSED, THIS_MONTH]);
  workdaysApi.saveWorkdaysBatch.mockResolvedValue({ saved: [], saved_count: 1 });
  workdaysApi.deleteWorkday.mockResolvedValue({});
  workdaysApi.getTeamSchedule.mockResolvedValue([]);
  workdaysApi.copyWorkdays.mockResolvedValue({ created_count: 3, skipped_count: 0, updated_count: 0 });
  workdaysApi.getCalendarFeedInfo.mockResolvedValue({ url: 'https://example.com/feed.ics', webcal_url: 'webcal://example.com/feed.ics' });
  workdaysApi.downloadWorkdaysIcs.mockResolvedValue();
  swapsApi.getSwaps.mockResolvedValue([RECEIVED_SWAP]);
  swapsApi.createSwap.mockResolvedValue({});
  swapsApi.acceptSwap.mockResolvedValue({});
  swapsApi.rejectSwap.mockResolvedValue({});
  usersApi.getUsers.mockResolvedValue([ME, COLLEAGUE]);
  usersApi.getSwappableWorkdays.mockResolvedValue([]);
  taskTypesApi.getTaskTypes.mockResolvedValue([{ id: 1, name: 'Kasa' }]);
  shiftTemplatesApi.getShiftTemplates.mockResolvedValue([MORNING]);
  notificationsApi.getNotifications.mockResolvedValue({ total: 0, items: [] });
  scheduleSettingsApi.getScheduleSettings.mockImplementation(() => Promise.resolve(settings));
});

afterEach(() => jest.restoreAllMocks());

const renderDashboard = async () => {
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
  // The received swap is listed once all initial requests have resolved.
  await screen.findByText('Od: piotr · przekazanie');
};

const openDay = (dayOfMonth) => fireEvent.click(screen.getByRole('button', { name: `Dzień ${dayOfMonth}` }));
const shiftSelect = () => screen.getByRole('option', { name: /Poranna/ }).closest('select');

test('shows month stats and received swaps', async () => {
  await renderDashboard();

  expect(screen.getByText('8.00')).toBeInTheDocument();
  expect(screen.getByText('160,00 zł')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Akceptuję' })).toBeInTheDocument();
});

test('shows the team schedule, or nothing when the manager hid it', async () => {
  const { unmount } = render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(await screen.findByRole('region', { name: 'Grafik zespołu' })).toBeInTheDocument();
  unmount();

  workdaysApi.getTeamSchedule.mockRejectedValue({ response: { status: 403 } });
  await renderDashboard();
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Grafik zespołu' })).not.toBeInTheDocument());
  expect(screen.queryByText('Nie udało się pobrać grafiku zespołu.')).not.toBeInTheDocument();
});

test('declaring a new day with a shift template and sending it', async () => {
  await renderDashboard();

  openDay(10);
  expect(screen.getByRole('heading', { name: '2030-01-10' })).toBeInTheDocument();
  fireEvent.change(shiftSelect(), { target: { value: '7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj deklarację' }));
  fireEvent.click(screen.getByRole('button', { name: 'Wyślij deklaracje' }));

  await waitFor(() =>
    expect(workdaysApi.saveWorkdaysBatch).toHaveBeenCalledWith([
      { date: '2030-01-10', shift_template: 7, start_time: '06:00:00', end_time: '14:00:00', note: '' },
    ]),
  );
  expect(await screen.findByText('Deklaracje zostały wysłane.')).toBeInTheDocument();
});

test('an edit and a new day go in one request, and a failed batch keeps them to be fixed', async () => {
  workdaysApi.saveWorkdaysBatch.mockRejectedValue({
    response: { data: { error: '2030-01-10: Zmiana Poranna jest już obsadzona. Nic nie zostało zapisane.' } },
  });
  await renderDashboard();

  openDay(9);
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj' }));
  openDay(10);
  fireEvent.change(shiftSelect(), { target: { value: '7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj deklarację' }));
  fireEvent.click(screen.getByRole('button', { name: 'Wyślij deklaracje' }));

  expect(await screen.findByText(/2030-01-10: Zmiana Poranna jest już obsadzona/)).toBeInTheDocument();
  expect(workdaysApi.saveWorkdaysBatch).toHaveBeenCalledTimes(1);
  expect(workdaysApi.saveWorkdaysBatch.mock.calls[0][0].map((entry) => entry.date)).toEqual(['2030-01-09', '2030-01-10']);
  // The drafts were not cleared, so sending again retries both days.
  fireEvent.click(screen.getByRole('button', { name: 'Wyślij deklaracje' }));
  await waitFor(() => expect(workdaysApi.saveWorkdaysBatch).toHaveBeenCalledTimes(2));
  expect(workdaysApi.saveWorkdaysBatch.mock.calls[1][0]).toHaveLength(2);
});

test('a shift template must be chosen when the organization has templates', async () => {
  await renderDashboard();

  openDay(10);
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj deklarację' }));

  expect(await screen.findByText('Wybierz zmianę zdefiniowaną przez kierownika.')).toBeInTheDocument();
});

test('editing a pending declaration sends that day again', async () => {
  await renderDashboard();

  openDay(9);
  expect(screen.getByRole('heading', { name: 'Oczekująca deklaracja' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj' }));
  fireEvent.click(screen.getByRole('button', { name: 'Wyślij deklaracje' }));

  // The server finds the existing entry by date and updates it instead of adding a second one.
  await waitFor(() =>
    expect(workdaysApi.saveWorkdaysBatch).toHaveBeenCalledWith([
      { date: '2030-01-09', shift_template: 7, start_time: '06:00:00', end_time: '14:00:00', note: '' },
    ]),
  );
});

test('deleting a pending declaration', async () => {
  await renderDashboard();

  openDay(9);
  fireEvent.click(screen.getByRole('button', { name: 'Usuń' }));

  await waitFor(() => expect(workdaysApi.deleteWorkday).toHaveBeenCalledWith(41));
});

test('giving away an approved shift to a colleague', async () => {
  await renderDashboard();

  openDay(8);
  expect(screen.getByRole('heading', { name: 'Zatwierdzony grafik' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Chcę oddać zmianę' }));
  await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled()); // jumps to the swap form
  fireEvent.change(screen.getByRole('option', { name: 'Piotr Lis' }).closest('select'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Wyślij prośbę' }));

  expect(usersApi.getSwappableWorkdays).toHaveBeenCalledWith('3');
  await waitFor(() => expect(swapsApi.createSwap).toHaveBeenCalledWith({ work_day: 40, target_user: 3 }));
  expect(await screen.findByText('Prośba o przejęcie zmiany została wysłana.')).toBeInTheDocument();
});

test('accepting and rejecting a received swap', async () => {
  await renderDashboard();

  fireEvent.click(screen.getByRole('button', { name: 'Akceptuję' }));
  await waitFor(() => expect(swapsApi.acceptSwap).toHaveBeenCalledWith(50));

  fireEvent.click(screen.getByRole('button', { name: 'Odrzucam' }));
  await waitFor(() => expect(swapsApi.rejectSwap).toHaveBeenCalledWith(50));
});

test('open declaration window shows the deadline as a short note', async () => {
  settings = { declarations_closed: false, declaration_close_label: 'sobota 23:59' };
  await renderDashboard();

  expect(await screen.findByText('Deklaracje wysyłasz do: sobota 23:59')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Wyślij deklaracje' })).toBeEnabled();
});

test('closed declaration window blocks sending', async () => {
  settings = { declarations_closed: true, declaration_close_label: 'sobota 23:59' };
  await renderDashboard();

  expect(
    await screen.findByText('Termin minął (sobota 23:59) — do poniedziałku grafik zmienia kierownik.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Termin deklaracji minął' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Kopiuj poprzedni tydzień' })).toBeDisabled();
});

test('copying the previous week', async () => {
  await renderDashboard();

  fireEvent.click(screen.getByRole('button', { name: 'Kopiuj poprzedni tydzień' }));

  await waitFor(() =>
    expect(workdaysApi.copyWorkdays).toHaveBeenCalledWith(expect.objectContaining({ mode: 'week', on_conflict: 'skip' })),
  );
  expect(await screen.findByText('Skopiowano poprzedni tydzień: dodano 3.')).toBeInTheDocument();
});

test('calendar export: subscription link and .ics download', async () => {
  await renderDashboard();

  fireEvent.click(screen.getByRole('button', { name: 'Dodaj do kalendarza' }));
  expect(await screen.findByText('https://example.com/feed.ics')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pobierz .ics (nadchodzące)' }));

  await waitFor(() => expect(workdaysApi.downloadWorkdaysIcs).toHaveBeenCalledWith({}));
  expect(await screen.findByText('Pobrano nadchodzące zatwierdzone zmiany (.ics).')).toBeInTheDocument();
});

test('the pending declaration shows in its calendar tile', async () => {
  await renderDashboard();

  const tile = screen.getByRole('button', { name: 'Dzień 9' }).parentElement;
  expect(tile).toHaveClass('custom-proposed-day');
  expect(within(tile).getByText('Oczekuje')).toBeInTheDocument();
});

describe('hours changed by the manager', () => {
  const CHANGED = day({
    id: 40, date: '2030-01-08', status: 'approved', start_time: '14:00:00', end_time: '20:00:00',
    previous_start_time: '12:00:00', previous_end_time: '20:00:00',
    hours_changed_at: '2030-01-01T10:00:00Z', hours_change_seen_at: null,
  });
  const SEEN = { ...CHANGED, hours_change_seen_at: '2030-01-02T08:00:00Z' };
  const changeDot = () => screen.queryByRole('img', { name: /było 12:00–20:00/ });

  test('opening the day shows the old and new hours and shrinks the marker', async () => {
    workdaysApi.getWorkdays.mockResolvedValue([CHANGED, PROPOSED, THIS_MONTH]);
    workdaysApi.markHoursChangeSeen.mockResolvedValue(SEEN);
    await renderDashboard();
    expect(screen.getByText('zmiana godzin')).toBeInTheDocument();
    expect(changeDot()).not.toBeInTheDocument();

    openDay(8);

    expect(screen.getByText(/Kierownik zmienił godziny: było 12:00 - 20:00, jest 14:00 - 20:00/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('zmiana godzin')).not.toBeInTheDocument());
    expect(workdaysApi.markHoursChangeSeen).toHaveBeenCalledWith(40);
    expect(changeDot()).toBeInTheDocument();
    await waitFor(() => expect(notificationsApi.getNotifications).toHaveBeenCalledTimes(2)); // the notice is refreshed
  });

  test('an already seen change keeps a small dot and is not confirmed again', async () => {
    workdaysApi.getWorkdays.mockResolvedValue([SEEN, PROPOSED, THIS_MONTH]);
    await renderDashboard();

    expect(changeDot()).toBeInTheDocument();
    expect(screen.queryByText('zmiana godzin')).not.toBeInTheDocument();
    openDay(8);

    // findBy waits until the popup has also loaded its shift templates (no update after the test).
    expect(await screen.findByText(/było 12:00 - 20:00, jest 14:00 - 20:00/)).toBeInTheDocument();
    expect(workdaysApi.markHoursChangeSeen).not.toHaveBeenCalled();
  });

  test('a day without changed hours is not confirmed', async () => {
    await renderDashboard();

    openDay(9);

    expect(await screen.findByRole('heading', { name: 'Oczekująca deklaracja' })).toBeInTheDocument();
    expect(workdaysApi.markHoursChangeSeen).not.toHaveBeenCalled();
  });

  test('when confirming fails, the big marker simply stays and no error is shown', async () => {
    workdaysApi.getWorkdays.mockResolvedValue([CHANGED, PROPOSED, THIS_MONTH]);
    workdaysApi.markHoursChangeSeen.mockRejectedValue(new Error('Network Error'));
    await renderDashboard();

    openDay(8);

    await waitFor(() => expect(workdaysApi.markHoursChangeSeen).toHaveBeenCalled());
    expect(screen.getByText('zmiana godzin')).toBeInTheDocument();
    expect(screen.queryByText('Network Error')).not.toBeInTheDocument();
  });
});
