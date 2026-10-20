/**
 * Characterization test for the manager panel.
 *
 * It pins down current behaviour (what is shown, which API calls user actions make)
 * so the panel can be split into smaller components safely: these tests must keep
 * passing unchanged after every refactoring step.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Manager from './Manager';
import Auth from './Auth';
import * as usersApi from '../api/users';
import * as workdaysApi from '../api/workdays';
import * as swapsApi from '../api/swaps';
import * as statsApi from '../api/stats';
import * as scheduleSettingsApi from '../api/scheduleSettings';
import * as scheduleHolesApi from '../api/scheduleHoles';
import * as taskTypesApi from '../api/taskTypes';
import * as shiftTemplatesApi from '../api/shiftTemplates';
import * as notificationsApi from '../api/notifications';
import * as rejectionReasonsApi from '../api/rejectionReasons';

// react-calendar ships ESM only (not transpiled by CRA's Jest); this test covers the panel, not the calendar.
// The stub offers one clickable day and renders that day's tile, so tile callbacks run too.
const mockCalendarDay = new Date(2030, 0, 10);
jest.mock('react-calendar', () => ({ onChange, tileClassName, tileContent }) => (
  <div data-testid="calendar" className={tileClassName?.({ date: mockCalendarDay, view: 'month' }) || ''}>
    <button type="button" onClick={() => onChange(mockCalendarDay)}>
      Wybierz 2030-01-10
    </button>
    {tileContent?.({ date: mockCalendarDay, view: 'month' })}
  </div>
));
jest.mock('react-calendar/dist/Calendar.css', () => ({}));
jest.mock('./Auth', () => ({
  __esModule: true,
  default: { fetchCurrentUser: jest.fn(), logout: jest.fn() },
}));
// CRA resets mock implementations before every test (resetMocks: true), so return values are set in beforeEach.
jest.mock('../api/users');
jest.mock('../api/workdays');
jest.mock('../api/swaps');
jest.mock('../api/stats');
jest.mock('../api/taskTypes');
jest.mock('../api/shiftTemplates');
jest.mock('../api/notifications');
jest.mock('../api/scheduleSettings');
jest.mock('../api/rejectionReasons');
jest.mock('../api/scheduleHoles');

const MANAGER = { id: 1, username: 'szef', first_name: 'Jan', last_name: 'Szef', email: 'szef@example.com', is_manager: true, is_active: true, hourly_rate: '30.00' };
const EMPLOYEE = { id: 2, username: 'anna', first_name: 'Anna', last_name: 'Nowak', email: 'anna@example.com', is_manager: false, is_active: true, hourly_rate: '20.00' };

const PROPOSAL = {
  id: 10, employee: 2, employee_name: 'anna', date: '2030-01-07',
  start_time: '08:00:00', end_time: '16:00:00', status: 'proposed',
  role: null, role_name: null, note: '', shift_template: null, shift_template_name: null, shift_slots: null,
};
const SWAP = {
  id: 20, status: 'pending_manager', is_two_way: false,
  requested_by_name: 'anna', target_user_name: 'piotr',
  work_day_details: { date: '2030-01-08', start_time: '06:00:00', end_time: '14:00:00' },
  target_work_day_details: null,
};
const HOLES = {
  count: 1, date_from: '2030-01-07', date_to: '2030-01-13',
  items: [{
    date: '2030-01-09', shift_template_id: 5, shift_template_name: 'Poranna',
    start_time: '06:00:00', end_time: '14:00:00', needed: 1, max_slots: 2, filled: 1,
    holders: [{ id: 2, name: 'Anna Nowak' }],
  }],
};

const card = (heading) => screen.getByRole('heading', { name: heading }).closest('.sectionCard');

let employeeDays = []; // schedule of the employee opened in the editor

beforeEach(() => {
  employeeDays = [];
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  Auth.fetchCurrentUser.mockResolvedValue(MANAGER);
  usersApi.getUsers.mockResolvedValue([MANAGER, EMPLOYEE]);
  usersApi.createUser.mockResolvedValue({});
  workdaysApi.getWorkdays.mockImplementation((params = {}) => {
    if (params.employee) return Promise.resolve(employeeDays);
    return Promise.resolve(params.status === 'proposed' ? [PROPOSAL] : []);
  });
  workdaysApi.approveWorkday.mockResolvedValue({});
  workdaysApi.rejectWorkday.mockResolvedValue({});
  workdaysApi.bulkApproveWorkdays.mockResolvedValue({ approved_count: 1, skipped_count: 0 });
  swapsApi.getSwaps.mockResolvedValue([SWAP]);
  swapsApi.approveSwap.mockResolvedValue({});
  statsApi.getTeamStats.mockResolvedValue({ employee_count: 1, approved_days: 3, total_hours: 24, total_earnings: 480 });
  scheduleSettingsApi.getScheduleSettings.mockResolvedValue({ declaration_close_weekday: null, declaration_close_time: null });
  scheduleSettingsApi.updateScheduleSettings.mockResolvedValue({
    declaration_close_weekday: 5, declaration_close_time: '23:59:00', declaration_close_label: 'sobota 23:59',
  });
  scheduleHolesApi.getScheduleHoles.mockResolvedValue(HOLES);
  taskTypesApi.getTaskTypes.mockResolvedValue([{ id: 1, name: 'Kasa' }]);
  shiftTemplatesApi.getShiftTemplates.mockResolvedValue([]);
  notificationsApi.getNotifications.mockResolvedValue({ total: 0, items: [] });
  rejectionReasonsApi.getRejectionReasons.mockResolvedValue([{ id: 1, text: 'Za dużo osób' }]);
});

afterEach(() => jest.restoreAllMocks());

const renderManager = async () => {
  render(
    <MemoryRouter>
      <Manager />
    </MemoryRouter>,
  );
  // The queues are the last data to arrive; once the proposal is listed, initial loading is done.
  await within(card('Do akceptacji')).findByText('Anna Nowak');
};

test('shows team stats, schedule holes, approval and swap queues', async () => {
  await renderManager();

  expect(screen.getByText('24.00')).toBeInTheDocument();
  expect(screen.getByText('480.00 zł')).toBeInTheDocument();
  expect(within(card('Braki w grafiku')).getByText('Poranna')).toBeInTheDocument();
  expect(within(card('Do akceptacji')).getByText('08:00 - 16:00')).toBeInTheDocument();
  expect(within(card('Zamiany do zatwierdzenia')).getByText('piotr')).toBeInTheDocument();
  expect(within(card('Zarządzanie kontami')).getAllByText(/Anna Nowak/).length).toBeGreaterThan(0);
});

test('approving a proposal sends its hours and reports success', async () => {
  await renderManager();

  fireEvent.click(within(card('Do akceptacji')).getByRole('button', { name: 'Zatwierdź' }));

  await waitFor(() =>
    expect(workdaysApi.approveWorkday).toHaveBeenCalledWith(10, {
      start_time: '08:00:00', end_time: '16:00:00', role: null,
    }),
  );
  expect(await screen.findByText('Zatwierdzono grafik anna na 2030-01-07.')).toBeInTheDocument();
});

test('rejecting a proposal with a ready-made reason', async () => {
  await renderManager();
  const queue = card('Do akceptacji');

  fireEvent.click(within(queue).getByRole('button', { name: 'Odrzuć' }));
  fireEvent.change(within(queue).getByLabelText('Gotowy powód odrzucenia'), { target: { value: 'Za dużo osób' } });
  fireEvent.click(within(queue).getByRole('button', { name: 'Potwierdź odrzucenie' }));

  await waitFor(() =>
    expect(workdaysApi.rejectWorkday).toHaveBeenCalledWith(10, { rejection_reason: 'Za dużo osób' }),
  );
});

test('bulk approval of selected proposals', async () => {
  await renderManager();
  const queue = card('Do akceptacji');

  fireEvent.click(within(queue).getByRole('button', { name: 'Zaznacz dostępne (1)' }));
  fireEvent.click(within(queue).getByRole('button', { name: 'Zatwierdź zaznaczone (1)' }));

  await waitFor(() => expect(workdaysApi.bulkApproveWorkdays).toHaveBeenCalledWith({ ids: [10] }));
});

test('approving a swap', async () => {
  await renderManager();

  fireEvent.click(within(card('Zamiany do zatwierdzenia')).getByRole('button', { name: 'Zatwierdź zamianę' }));

  await waitFor(() => expect(swapsApi.approveSwap).toHaveBeenCalledWith(20));
});

test('rejecting a swap with an own note', async () => {
  swapsApi.rejectSwap.mockResolvedValue({});
  await renderManager();
  const queue = card('Zamiany do zatwierdzenia');

  fireEvent.click(within(queue).getByRole('button', { name: 'Odrzuć' }));
  fireEvent.click(within(queue).getByRole('button', { name: 'Dodaj uwagę' }));
  fireEvent.change(within(queue).getByPlaceholderText(/Własna uwaga/), { target: { value: '  Brak zastępstwa  ' } });
  fireEvent.click(within(queue).getByRole('button', { name: 'Potwierdź odrzucenie' }));

  await waitFor(() => expect(swapsApi.rejectSwap).toHaveBeenCalledWith(20, { rejection_reason: 'Brak zastępstwa' }));
  expect(await screen.findByText('Odrzucono zamianę zmiany z dnia 2030-01-08.')).toBeInTheDocument();
});

test('approving a proposal after editing its hours and role', async () => {
  await renderManager();
  const queue = card('Do akceptacji');

  fireEvent.click(within(queue).getByRole('button', { name: 'Edytuj godziny' }));
  const [start, end] = queue.querySelectorAll('input[type="time"]');
  fireEvent.change(start, { target: { value: '09:30' } });
  fireEvent.change(end, { target: { value: '15:00' } });
  fireEvent.change(within(queue).getByRole('combobox'), { target: { value: '1' } });
  fireEvent.click(within(queue).getByRole('button', { name: 'Zatwierdź' }));

  await waitFor(() =>
    expect(workdaysApi.approveWorkday).toHaveBeenCalledWith(10, {
      start_time: '09:30:00', end_time: '15:00:00', role: 1,
    }),
  );
});

test('adding an employee', async () => {
  await renderManager();
  const accounts = card('Zarządzanie kontami');

  fireEvent.click(within(accounts).getByRole('button', { name: 'Dodaj pracownika' }));
  const fields = {
    Login: 'ewa', 'Imię': 'Ewa', Nazwisko: 'Lis', 'E-mail': 'ewa@example.com',
    'Hasło (min. 8 znaków)': 'Bezpieczne#1', 'Stawka zł/h': '25',
  };
  Object.entries(fields).forEach(([placeholder, value]) => {
    fireEvent.change(within(accounts).getByPlaceholderText(placeholder), { target: { value } });
  });
  fireEvent.click(within(accounts).getByRole('button', { name: 'Dodaj osobę' }));

  await waitFor(() =>
    expect(usersApi.createUser).toHaveBeenCalledWith({
      username: 'ewa', first_name: 'Ewa', last_name: 'Lis', email: 'ewa@example.com',
      password: 'Bezpieczne#1', is_manager: false, hourly_rate: 25,
    }),
  );
});

test('changing an hourly rate saves it on blur', async () => {
  usersApi.updateUserProfile.mockResolvedValue({ ...EMPLOYEE, hourly_rate: '25.00' });
  await renderManager();
  const row = within(card('Zarządzanie kontami')).getByText('anna').closest('tr');

  const rate = within(row).getByRole('spinbutton');
  fireEvent.change(rate, { target: { value: '25' } });
  fireEvent.blur(rate);

  await waitFor(() => expect(usersApi.updateUserProfile).toHaveBeenCalledWith(2, { hourly_rate: '25' }));
  expect(await screen.findByText('Stawka godzinowa zaktualizowana.')).toBeInTheDocument();
});

test('deactivating an account after confirmation', async () => {
  usersApi.deleteUser.mockResolvedValue({});
  await renderManager();
  const row = within(card('Zarządzanie kontami')).getByText('anna').closest('tr');

  fireEvent.click(within(row).getByRole('button', { name: 'Więcej opcji' }));
  fireEvent.click(within(row).getByRole('button', { name: 'Dezaktywuj' }));

  expect(window.confirm).toHaveBeenCalled();
  await waitFor(() => expect(usersApi.deleteUser).toHaveBeenCalledWith(2, { permanent: false }));
  expect(await screen.findByText('Dezaktywowano konto „Anna Nowak".')).toBeInTheDocument();
});

test('switching schedule holes to 14 days refetches them', async () => {
  await renderManager();

  fireEvent.click(within(card('Braki w grafiku')).getByRole('button', { name: '14 dni' }));

  await waitFor(() => expect(scheduleHolesApi.getScheduleHoles).toHaveBeenCalledWith({ days: 14 }));
});

test('saving the weekly declaration deadline', async () => {
  await renderManager();

  fireEvent.change(screen.getByLabelText('Dzień tygodnia zamknięcia'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz termin' }));

  await waitFor(() =>
    expect(scheduleSettingsApi.updateScheduleSettings).toHaveBeenCalledWith({
      declaration_close_weekday: 5, declaration_close_time: '23:59:00',
    }),
  );
  expect(await screen.findByText(/sobota 23:59/)).toBeInTheDocument();
});

describe('employee schedule editor', () => {
  const openSchedule = async () => {
    await renderManager();
    const row = within(card('Zarządzanie kontami')).getByText('anna').closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Grafik' }));
    await waitFor(() => expect(workdaysApi.getWorkdays).toHaveBeenCalledWith({ employee: 2 }));
    return card('Szczegóły pracownika');
  };

  const pickDayAndAdd = (editor, times) => {
    fireEvent.click(within(editor).getByRole('button', { name: 'Wybierz 2030-01-10' }));
    if (times) {
      const [from, to] = editor.querySelectorAll('input[type="time"]');
      fireEvent.change(from, { target: { value: times[0] } });
      fireEvent.change(to, { target: { value: times[1] } });
    }
    fireEvent.click(within(editor).getByRole('button', { name: 'Dodaj zmianę' }));
  };

  test('a new day is created when saved', async () => {
    workdaysApi.createWorkday.mockResolvedValue({ id: 60 }); // the API returns the created entry
    const editor = await openSchedule();

    pickDayAndAdd(editor, ['07:00', '15:00']);
    expect(within(editor).getByText('Wybrany dzień: 2030-01-10')).toBeInTheDocument();
    expect(await screen.findByText('Zmiana dodana do zapisu.')).toBeInTheDocument();
    fireEvent.click(within(editor).getByRole('button', { name: 'Zapisz zmiany' }));

    await waitFor(() =>
      expect(workdaysApi.createWorkday).toHaveBeenCalledWith({
        date: '2030-01-10', start_time: '07:00:00', end_time: '15:00:00', employee: 2, note: '',
      }),
    );
    expect(await screen.findByText('Grafik pracownika zapisany.')).toBeInTheDocument();
  });

  test('saving over a pending proposal approves it with the existing hours', async () => {
    employeeDays = [{
      id: 30, employee: 2, date: '2030-01-10', start_time: '10:00:00', end_time: '18:00:00',
      status: 'proposed', role: null, role_name: null, note: '', shift_template: null,
    }];
    const editor = await openSchedule();
    expect(await within(editor).findByText(/2030-01-10 — 10:00 - 18:00/)).toBeInTheDocument();

    pickDayAndAdd(editor);
    fireEvent.click(within(editor).getByRole('button', { name: 'Zapisz zmiany' }));

    await waitFor(() =>
      expect(workdaysApi.approveWorkday).toHaveBeenCalledWith(30, {
        date: '2030-01-10', start_time: '10:00:00', end_time: '18:00:00', employee: 2, note: '',
      }),
    );
    expect(workdaysApi.createWorkday).not.toHaveBeenCalled();
  });

  test('copying the previous week', async () => {
    workdaysApi.copyWorkdays.mockResolvedValue({ created_count: 2, skipped_count: 0, updated_count: 0 });
    const editor = await openSchedule();

    fireEvent.click(within(editor).getByRole('button', { name: 'Kopiuj poprzedni tydzień' }));

    await waitFor(() =>
      expect(workdaysApi.copyWorkdays).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'week', employee: 2, on_conflict: 'skip' }),
      ),
    );
    expect(await screen.findByText('Skopiowano poprzedni tydzień: dodano 2.')).toBeInTheDocument();
  });
});

describe('settings: deadline and shift templates', () => {
  const openTemplates = async () => {
    await renderManager();
    const settings = card('Ustawienia');
    fireEvent.click(within(settings).getByRole('button', { name: 'Szablony zmian' }));
    return settings;
  };

  test('clearing the declaration deadline', async () => {
    await renderManager();
    fireEvent.change(screen.getByLabelText('Dzień tygodnia zamknięcia'), { target: { value: '5' } });

    fireEvent.click(within(card('Ustawienia')).getByRole('button', { name: 'Wyczyść' }));

    await waitFor(() =>
      expect(scheduleSettingsApi.updateScheduleSettings).toHaveBeenCalledWith({
        declaration_close_weekday: null, declaration_close_time: null,
      }),
    );
    expect(await screen.findByText('Usunięto termin deklaracji.')).toBeInTheDocument();
  });

  test('creating a shift template', async () => {
    shiftTemplatesApi.createShiftTemplate.mockResolvedValue({});
    const settings = await openTemplates();

    fireEvent.change(within(settings).getByPlaceholderText('Nazwa zmiany (np. Poranna)'), { target: { value: ' Poranna ' } });
    fireEvent.change(within(settings).getByRole('spinbutton'), { target: { value: '2' } });
    fireEvent.click(within(settings).getByRole('checkbox', { name: 'Pon' }));
    fireEvent.click(within(settings).getByRole('button', { name: 'Dodaj szablon' }));

    await waitFor(() =>
      expect(shiftTemplatesApi.createShiftTemplate).toHaveBeenCalledWith({
        name: 'Poranna',
        is_active: true,
        max_slots: 2,
        hours: [{ weekday: 0, start_time: '06:00:00', end_time: '14:00:00' }],
      }),
    );
    expect(await screen.findByText('Dodano zmianę „Poranna".')).toBeInTheDocument();
  });

  test('a template needs at least one day', async () => {
    const settings = await openTemplates();

    fireEvent.change(within(settings).getByPlaceholderText('Nazwa zmiany (np. Poranna)'), { target: { value: 'Pusta' } });
    fireEvent.click(within(settings).getByRole('button', { name: 'Dodaj szablon' }));

    expect(await screen.findByText('Włącz godziny przynajmniej dla jednego dnia tygodnia.')).toBeInTheDocument();
    expect(shiftTemplatesApi.createShiftTemplate).not.toHaveBeenCalled();
  });

  test('editing an existing template', async () => {
    shiftTemplatesApi.getShiftTemplates.mockResolvedValue([{
      id: 5, name: 'Wieczorna', is_active: true, max_slots: 1,
      hours: [{ weekday: 4, start_time: '16:00:00', end_time: '22:00:00' }],
    }]);
    shiftTemplatesApi.updateShiftTemplate.mockResolvedValue({});
    const settings = await openTemplates();

    fireEvent.click(await within(settings).findByRole('button', { name: 'Edytuj' }));
    fireEvent.click(within(settings).getByRole('button', { name: 'Zapisz zmiany szablonu' }));

    await waitFor(() =>
      expect(shiftTemplatesApi.updateShiftTemplate).toHaveBeenCalledWith(5, {
        name: 'Wieczorna',
        is_active: true,
        max_slots: 1,
        hours: [{ weekday: 4, start_time: '16:00:00', end_time: '22:00:00' }],
      }),
    );
  });
});
