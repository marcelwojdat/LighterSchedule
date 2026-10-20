import { displayName } from './people';

test.each([
  [{ first_name: 'Anna', last_name: 'Nowak', username: 'anna' }, 'Anna Nowak'],
  [{ first_name: 'Anna', last_name: '', username: 'anna' }, 'Anna'],
  [{ first_name: '', last_name: '', username: 'anna' }, 'anna'],
  [{ first_name: null, last_name: undefined, username: 'anna' }, 'anna'],
  [null, ''],
])('displayName(%o) is "%s"', (user, expected) => {
  expect(displayName(user)).toBe(expected);
});
