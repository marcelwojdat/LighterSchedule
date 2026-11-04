import { fireEvent, render, screen } from '@testing-library/react';
import TimeSelect from './TimeSelect';

const hourSelect = () => screen.getByRole('combobox', { name: 'Start – godzina' });
const minuteSelect = () => screen.getByRole('combobox', { name: 'Start – minuty' });

test('changing the hour or the minute reports the whole HH:MM value', () => {
  const onChange = jest.fn();
  render(<TimeSelect label="Start" value="06:30" onChange={onChange} />);

  fireEvent.change(hourSelect(), { target: { value: '09' } });
  fireEvent.change(minuteSelect(), { target: { value: '45' } });

  expect(onChange).toHaveBeenNthCalledWith(1, '09:30');
  expect(onChange).toHaveBeenNthCalledWith(2, '06:45');
});

test('a minute off the 5-minute step stays selectable', () => {
  render(<TimeSelect label="Start" value="23:59" onChange={() => {}} />);

  expect(minuteSelect()).toHaveValue('59');
  expect(screen.getAllByRole('option', { name: '55' })).toHaveLength(1);
});
