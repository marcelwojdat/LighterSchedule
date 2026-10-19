import { useCallback, useState } from 'react';
import { useAutoDismiss } from './useAutoDismiss';
import { getErrorMessage } from '../api/client';

const MESSAGE_TIMEOUT_MS = 7000;

/**
 * One success and one error message for a page, both cleared automatically.
 *
 * `runAction(action, { success, failure, after })` runs a server action, shows the outcome
 * (`success` may be a function of the action result), then runs `after` (e.g. a reload).
 * It resolves to true on success, so sections know whether to close their forms.
 */
export const useMessages = () => {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useAutoDismiss(success, setSuccess, MESSAGE_TIMEOUT_MS);
  useAutoDismiss(error, setError, MESSAGE_TIMEOUT_MS);

  const notifySuccess = useCallback((message) => {
    setSuccess(message);
    setError('');
  }, []);

  const runAction = useCallback(
    async (action, { success: successMessage, failure, after }) => {
      try {
        const result = await action();
        notifySuccess(typeof successMessage === 'function' ? successMessage(result) : successMessage);
        if (after) await after();
        return true;
      } catch (err) {
        setError(getErrorMessage(err, failure));
        return false;
      }
    },
    [notifySuccess],
  );

  return { error, success, setError, setSuccess, notifySuccess, runAction };
};
