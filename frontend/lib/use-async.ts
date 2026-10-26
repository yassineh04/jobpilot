"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export const DATA_CHANGED = "jp:data-changed";

/** Tells every loaded page to refetch, e.g. after the agent changed something. */
export function notifyDataChanged() {
  window.dispatchEvent(new Event(DATA_CHANGED));
}

/**
 * Loads data on mount and whenever `deps` change. Ignores responses from stale requests.
 * `reload()` refetches without clearing the current data (no flicker after mutations).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });

  const run = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await fnRef.current();
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching is the external system here
    setLoading(true);
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Something changed the data outside this page (the agent applied an action): refetch quietly
  useEffect(() => {
    window.addEventListener(DATA_CHANGED, run);
    return () => window.removeEventListener(DATA_CHANGED, run);
  }, [run]);

  return { data, setData, error, loading, reload: run };
}

/** Returns `value` once it has stopped changing for `delay` ms. */
export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
