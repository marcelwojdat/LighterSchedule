import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../api/client';

/**
 * Loads data from an API function and keeps it in state.
 *
 * - `fetcher` must be stable (a module-level API function); `params` are passed to it
 *   and must be JSON-serializable. Data is refetched whenever `params` change.
 * - `initial` is used until the first response and replaces empty (null/undefined) responses.
 * - On error the previous data is kept; `onError(message)` is called when `errorMessage` is given.
 * - Responses of outdated requests are ignored, so quick param changes can't show stale data.
 */
export const useApiResource = (fetcher, params, { initial, errorMessage, onError, enabled = true } = {}) => {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(enabled);
  const paramsKey = params === undefined ? '' : JSON.stringify(params);
  const latestRequest = useRef(0);
  const options = useRef({ initial, errorMessage, onError });
  options.current = { initial, errorMessage, onError };

  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    setLoading(true);
    try {
      const args = paramsKey === '' ? [] : [JSON.parse(paramsKey)];
      const result = await fetcher(...args);
      if (request === latestRequest.current) {
        setData(result ?? options.current.initial);
      }
    } catch (err) {
      if (request === latestRequest.current && options.current.errorMessage) {
        options.current.onError?.(getErrorMessage(err, options.current.errorMessage));
      }
    } finally {
      if (request === latestRequest.current) {
        setLoading(false);
      }
    }
  }, [fetcher, paramsKey]);

  useEffect(() => {
    if (enabled) {
      reload();
    } else {
      latestRequest.current += 1; // drop any request still in flight
      setData(options.current.initial);
      setLoading(false);
    }
  }, [enabled, reload]);

  // Ignore responses that arrive after unmount.
  useEffect(() => () => {
    latestRequest.current += 1;
  }, []);

  return { data, setData, loading, reload };
};
