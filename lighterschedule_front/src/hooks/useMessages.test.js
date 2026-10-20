import { act, renderHook } from '@testing-library/react';
import { useMessages } from './useMessages';

test('a successful action shows its message, runs `after` and resolves to true', async () => {
  const after = jest.fn();
  const { result } = renderHook(() => useMessages());

  let ok;
  await act(async () => {
    ok = await result.current.runAction(() => Promise.resolve({ count: 2 }), {
      success: (data) => `Dodano ${data.count}.`,
      failure: 'Błąd',
      after,
    });
  });

  expect(ok).toBe(true);
  expect(result.current.success).toBe('Dodano 2.');
  expect(after).toHaveBeenCalled();
});

test('a failed action shows the fallback message and resolves to false', async () => {
  const after = jest.fn();
  const { result } = renderHook(() => useMessages());

  let ok;
  await act(async () => {
    ok = await result.current.runAction(() => Promise.reject(new Error('')), { success: 'OK', failure: 'Nie udało się.', after });
  });

  expect(ok).toBe(false);
  expect(result.current.error).toBe('Nie udało się.');
  expect(after).not.toHaveBeenCalled();
});

test('a new success message clears the previous error', () => {
  const { result } = renderHook(() => useMessages());

  act(() => result.current.setError('Stary błąd'));
  act(() => result.current.notifySuccess('Zapisano.'));

  expect(result.current).toMatchObject({ error: '', success: 'Zapisano.' });
});
