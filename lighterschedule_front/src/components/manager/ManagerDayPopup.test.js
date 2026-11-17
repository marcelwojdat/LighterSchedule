import { fireEvent, render, screen } from '@testing-library/react';
import ManagerDayPopup from './ManagerDayPopup';
import * as shiftTemplatesApi from '../../api/shiftTemplates';

jest.mock('../../api/shiftTemplates');

const hours = (start, end) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_time: start, end_time: end }));
const MORNING = { id: 7, name: 'Poranna', hours: hours('06:00:00', '14:00:00'), max_slots: 2, slots_remaining: 1, is_full: false };
const EVENING = { id: 8, name: 'Wieczorna', hours: hours('14:00:00', '22:00:00'), max_slots: 1, slots_remaining: 0, is_full: true };
const DATE = '2030-01-10';

let props;

beforeEach(() => {
  // CRA resets mock implementations before every test, so the day's templates are set here.
  shiftTemplatesApi.getShiftTemplates.mockResolvedValue([MORNING, EVENING]);
  props = {
    date: DATE,
    shiftTemplates: [MORNING, EVENING],
    taskTypes: [{ id: 1, name: 'Kasa' }],
    onAddDraft: jest.fn(),
    onRemoveDraft: jest.fn(),
    onClose: jest.fn(),
    onError: jest.fn(),
  };
});

const renderPopup = async (extra = {}) => {
  render(<ManagerDayPopup {...props} {...extra} />);
  // Wait until the day's templates (with free places) have loaded.
  await screen.findByRole('option', { name: /Poranna.*wolne 1\/2/ });
};

const shiftSelect = () => screen.getByRole('combobox', { name: 'Zmiana' });
const setTime = (label, value) => {
  const [hour, minute] = value.split(':');
  fireEvent.change(screen.getByRole('combobox', { name: `${label} – godzina` }), { target: { value: hour } });
  fireEvent.change(screen.getByRole('combobox', { name: `${label} – minuty` }), { target: { value: minute } });
};
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));

test('a template suggests its hours, and the hours the manager sets are the ones saved', async () => {
  await renderPopup();

  fireEvent.change(shiftSelect(), { target: { value: '7' } });
  expect(screen.getByRole('combobox', { name: 'Początek zmiany – godzina' })).toHaveValue('06');
  setTime('Początek zmiany', '07:30');
  click('Dodaj do zapisu');

  expect(props.onAddDraft).toHaveBeenCalledWith(DATE, {
    start_time: '07:30:00', end_time: '14:00:00', role: null, note: '', shift_template: 7,
  });
});

test('own hours without a template', async () => {
  await renderPopup();

  setTime('Początek zmiany', '09:00');
  setTime('Koniec zmiany', '13:00');
  click('Dodaj do zapisu');

  expect(props.onAddDraft).toHaveBeenCalledWith(DATE, expect.objectContaining({
    start_time: '09:00:00', end_time: '13:00:00', shift_template: null,
  }));
});

test('a full shift can be picked but the manager is warned', async () => {
  await renderPopup();

  fireEvent.change(shiftSelect(), { target: { value: '8' } });

  expect(screen.getByText(/ma już komplet osób/)).toBeInTheDocument();
});

test('no warning when the person already holds a place on that full shift', async () => {
  const existing = {
    id: 30, date: DATE, start_time: '14:00:00', end_time: '22:00:00', status: 'approved',
    shift_template: 8, role: null, note: '',
  };
  await renderPopup({ existing });

  expect(screen.getByText(/W grafiku: 14:00 - 22:00/)).toBeInTheDocument();
  expect(shiftSelect()).toHaveValue('8');
  expect(screen.queryByText(/ma już komplet osób/)).not.toBeInTheDocument();
});

test('end before start is refused at once', async () => {
  await renderPopup();

  setTime('Początek zmiany', '18:00');
  setTime('Koniec zmiany', '10:00');
  click('Dodaj do zapisu');

  expect(props.onError).toHaveBeenCalledWith('Godzina końcowa musi być później niż początkowa.');
  expect(props.onAddDraft).not.toHaveBeenCalled();
});

test('a day with a draft can be taken out of the save', async () => {
  const draft = { start_time: '06:00:00', end_time: '14:00:00', role: null, note: '', shift_template: 7 };
  await renderPopup({ draft });

  click('Usuń z zapisu');

  expect(props.onRemoveDraft).toHaveBeenCalledWith(DATE);
  expect(screen.getByRole('button', { name: 'Zmień w zapisie' })).toBeInTheDocument();
});
