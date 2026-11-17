import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TeamSchedule from './TeamSchedule';
import * as workdaysApi from '../../api/workdays';
import { addDays, formatDateStr, getMonday } from '../../utils/dates';

jest.mock('../../api/workdays');

const monday = formatDateStr(getMonday());
const tuesday = addDays(monday, 1);

const shift = (overrides) => ({
  id: 1,
  employee: 2,
  employee_name: 'Anna Nowak',
  date: monday,
  start_time: '06:00:00',
  end_time: '14:00:00',
  shift_template_name: 'Poranna',
  role_name: 'Kasa',
  ...overrides,
});

test('shows the approved shifts of the current week day by day, own ones marked', async () => {
  workdaysApi.getTeamSchedule.mockResolvedValue([
    shift({}),
    shift({ id: 2, employee: 7, employee_name: 'Jan Kowalski', start_time: '14:00:00', end_time: '22:00:00', shift_template_name: '', role_name: '' }),
  ]);
  render(<TeamSchedule currentUserId={7} />);

  const mondayList = await screen.findByRole('list', { name: `Zmiany ${monday}` });
  const items = within(mondayList).getAllByRole('listitem');
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent('06:00–14:00 Anna NowakPoranna · Kasa');
  expect(items[1]).toHaveTextContent('14:00–22:00 Jan Kowalski (Ty)');
  expect(workdaysApi.getTeamSchedule).toHaveBeenCalledWith({ date_from: monday, date_to: addDays(monday, 6) });
  expect(screen.queryByRole('list', { name: `Zmiany ${tuesday}` })).not.toBeInTheDocument();
  expect(screen.getAllByText('Nikt nie pracuje.')).toHaveLength(6);
  expect(screen.queryByRole('button', { name: /usuń|zmień|zapisz/i })).not.toBeInTheDocument();
});

test('the arrows load the next and previous week', async () => {
  workdaysApi.getTeamSchedule.mockResolvedValue([]);
  render(<TeamSchedule currentUserId={7} />);
  await screen.findAllByText('Nikt nie pracuje.');

  fireEvent.click(screen.getByRole('button', { name: 'Następny tydzień' }));
  await screen.findAllByText('Nikt nie pracuje.');
  expect(workdaysApi.getTeamSchedule).toHaveBeenLastCalledWith({
    date_from: addDays(monday, 7), date_to: addDays(monday, 13),
  });

  fireEvent.click(screen.getByRole('button', { name: 'Poprzedni tydzień' }));
  await screen.findAllByText('Nikt nie pracuje.');
  expect(workdaysApi.getTeamSchedule).toHaveBeenLastCalledWith({ date_from: monday, date_to: addDays(monday, 6) });
});

test('an answer for a week the user already left is ignored', async () => {
  let answerFirstWeek;
  workdaysApi.getTeamSchedule
    .mockReturnValueOnce(new Promise((resolve) => { answerFirstWeek = resolve; }))
    .mockResolvedValueOnce([]);
  render(<TeamSchedule currentUserId={7} />);

  fireEvent.click(screen.getByRole('button', { name: 'Następny tydzień' }));
  await screen.findAllByText('Nikt nie pracuje.');
  // A late answer dated inside the week now on screen: only the "active" guard keeps it out.
  await act(async () => answerFirstWeek([shift({ date: addDays(monday, 7) })]));

  expect(screen.queryByText(/Anna Nowak/)).not.toBeInTheDocument();
});

test('renders nothing when the manager hid the team schedule', async () => {
  workdaysApi.getTeamSchedule.mockRejectedValue({ response: { status: 403 } });
  render(<TeamSchedule currentUserId={7} />);

  expect(screen.getByText('Ładowanie grafiku zespołu…')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Grafik zespołu' })).not.toBeInTheDocument());
});

test('any other failure shows a message in the section', async () => {
  workdaysApi.getTeamSchedule.mockRejectedValue({ response: { status: 500 } });
  render(<TeamSchedule currentUserId={7} />);

  expect(await screen.findByText('Nie udało się pobrać grafiku zespołu.')).toBeInTheDocument();
});

