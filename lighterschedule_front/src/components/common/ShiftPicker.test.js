import { fireEvent, render, screen } from '@testing-library/react';
import ShiftPicker from './ShiftPicker';

const hours = (start, end) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_time: start, end_time: end }));
const MORNING = { id: 1, name: 'Poranna', hours: hours('06:00:00', '14:00:00'), max_slots: 2, slots_remaining: 1, is_full: false };
const EVENING = { id: 2, name: 'Wieczorna', hours: hours('14:00:00', '22:00:00'), max_slots: 1, slots_remaining: 0, is_full: true };

const renderPicker = (props = {}) => {
  const onChange = jest.fn();
  render(<ShiftPicker date="2030-01-10" templates={[MORNING, EVENING]} value="" onChange={onChange} {...props} />);
  return onChange;
};

test('shows hours and free places of each shift', () => {
  renderPicker();

  expect(screen.getByRole('option', { name: 'Poranna (06:00-14:00) · wolne 1/2' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Wieczorna (14:00-22:00) — brak miejsc' })).toBeInTheDocument();
});

test('an employee cannot pick a full shift', () => {
  renderPicker();

  expect(screen.getByRole('option', { name: /Wieczorna/ })).toBeDisabled();
  expect(screen.getByRole('option', { name: /Poranna/ })).toBeEnabled();
});

test('a manager sees a full shift marked but can still pick it', () => {
  const onChange = renderPicker({ allowFull: true });

  expect(screen.getByRole('option', { name: /Wieczorna.*brak miejsc/ })).toBeEnabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Zmiana' }), { target: { value: '2' } });
  expect(onChange).toHaveBeenCalledWith('2');
});
