import { act, renderHook } from '@testing-library/react';
import { useDismissibleList } from './useDismissibleList';

const FIRST_MS = 7000;
const STEP_MS = 3000;

const getKey = (entry) => entry;
const visibleKeys = (result) => result.current.visible.map(({ key }) => key);

const renderList = (entries) =>
  renderHook(({ items }) => useDismissibleList(items, getKey, FIRST_MS, STEP_MS), {
    initialProps: { items: entries },
  });

const advance = (ms) => act(() => jest.advanceTimersByTime(ms));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('entries disappear one after another, not all at once', () => {
  const { result } = renderList(['a', 'b', 'c']);

  advance(FIRST_MS - 1);
  expect(visibleKeys(result)).toEqual(['a', 'b', 'c']);

  advance(1);
  expect(visibleKeys(result)).toEqual(['b', 'c']);

  advance(STEP_MS);
  expect(visibleKeys(result)).toEqual(['c']);

  advance(STEP_MS);
  expect(visibleKeys(result)).toEqual([]);
});

test('entries added at the end do not restart the countdown of the first one', () => {
  const { result, rerender } = renderList(['a']);

  advance(FIRST_MS - 1000);
  rerender({ items: ['a', 'b'] });
  advance(1000);

  expect(visibleKeys(result)).toEqual(['b']);
});

test('closing the first entry by hand moves the queue on', () => {
  const { result } = renderList(['a', 'b']);

  act(() => result.current.dismiss('a'));
  expect(visibleKeys(result)).toEqual(['b']);

  advance(FIRST_MS);
  expect(visibleKeys(result)).toEqual([]);
});

test('a new batch after an empty list gets the full reading time again', () => {
  const { result, rerender } = renderList(['a']);
  advance(FIRST_MS);
  expect(visibleKeys(result)).toEqual([]);

  rerender({ items: ['a', 'x'] });
  advance(STEP_MS);
  expect(visibleKeys(result)).toEqual(['x']);

  advance(FIRST_MS - STEP_MS);
  expect(visibleKeys(result)).toEqual([]);
});
