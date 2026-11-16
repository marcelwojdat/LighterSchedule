import { renderHook } from '@testing-library/react';
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning';

/** Fires the event the browser sends before leaving; true when the page asked to stay. */
const leavingIsQuestioned = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

test('leaving is questioned while there are unsaved changes', () => {
  renderHook(() => useUnsavedChangesWarning(true));

  expect(leavingIsQuestioned()).toBe(true);
});

test('leaving is free when there is nothing to lose', () => {
  renderHook(() => useUnsavedChangesWarning(false));

  expect(leavingIsQuestioned()).toBe(false);
});

test('the warning goes away once the changes are saved', () => {
  const { rerender } = renderHook(({ dirty }) => useUnsavedChangesWarning(dirty), {
    initialProps: { dirty: true },
  });

  rerender({ dirty: false });

  expect(leavingIsQuestioned()).toBe(false);
});

test('the warning goes away with the component', () => {
  const { unmount } = renderHook(() => useUnsavedChangesWarning(true));

  unmount();

  expect(leavingIsQuestioned()).toBe(false);
});
