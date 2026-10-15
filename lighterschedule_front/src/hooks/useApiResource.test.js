import { act, renderHook, waitFor } from '@testing-library/react';
import { useApiResource } from './useApiResource';

/** A promise that the test resolves by hand, to control the order of responses. */
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('loads data on mount and reports loading', async () => {
  const fetcher = jest.fn().mockResolvedValue(['a']);
  const { result } = renderHook(() => useApiResource(fetcher, undefined, { initial: [] }));

  expect(result.current).toMatchObject({ data: [], loading: true });
  await waitFor(() => expect(result.current).toMatchObject({ data: ['a'], loading: false }));
  expect(fetcher).toHaveBeenCalledWith();
});

test('passes params and refetches when they change', async () => {
  const fetcher = jest.fn((month) => Promise.resolve(`stats ${month}`));
  const { result, rerender } = renderHook(({ month }) => useApiResource(fetcher, month), {
    initialProps: { month: '2030-01' },
  });
  await waitFor(() => expect(result.current.data).toBe('stats 2030-01'));

  rerender({ month: '2030-02' });

  await waitFor(() => expect(result.current.data).toBe('stats 2030-02'));
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('does not refetch when params are equal but a new object', async () => {
  const fetcher = jest.fn().mockResolvedValue([]);
  const { rerender } = renderHook(() => useApiResource(fetcher, { status: 'proposed' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

  rerender();

  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('reload fetches again', async () => {
  const fetcher = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
  const { result } = renderHook(() => useApiResource(fetcher));
  await waitFor(() => expect(result.current.data).toBe('first'));

  await act(() => result.current.reload());

  expect(result.current.data).toBe('second');
});

test('empty response falls back to the initial value', async () => {
  const fetcher = jest.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() => useApiResource(fetcher, undefined, { initial: { items: [] } }));

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ items: [] });
});

test('on error keeps previous data and reports the message', async () => {
  const onError = jest.fn();
  const fetcher = jest.fn().mockResolvedValueOnce(['kept']).mockRejectedValueOnce({});
  const { result } = renderHook(() =>
    useApiResource(fetcher, undefined, { initial: [], errorMessage: 'Nie udało się pobrać', onError }),
  );
  await waitFor(() => expect(result.current.data).toEqual(['kept']));

  await act(() => result.current.reload());

  expect(result.current.data).toEqual(['kept']);
  expect(onError).toHaveBeenCalledWith('Nie udało się pobrać');
});

test('without errorMessage errors are silent', async () => {
  const onError = jest.fn();
  const fetcher = jest.fn().mockRejectedValue(new Error('boom'));
  const { result } = renderHook(() => useApiResource(fetcher, undefined, { onError }));

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(onError).not.toHaveBeenCalled();
});

test('ignores a slow response of an outdated request', async () => {
  const slow = deferred();
  const fast = deferred();
  const fetcher = jest.fn((month) => (month === 'old' ? slow.promise : fast.promise));
  const { result, rerender } = renderHook(({ month }) => useApiResource(fetcher, month), {
    initialProps: { month: 'old' },
  });

  rerender({ month: 'new' });
  await act(async () => fast.resolve('new data'));
  await act(async () => slow.resolve('old data'));

  expect(result.current.data).toBe('new data');
});

test('does not fetch while disabled', async () => {
  const fetcher = jest.fn().mockResolvedValue(['x']);
  const { result } = renderHook(() => useApiResource(fetcher, 5, { initial: [], enabled: false }));

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(fetcher).not.toHaveBeenCalled();
  expect(result.current.data).toEqual([]);
});
