import { useCallback, useRef } from 'react';

/**
 * Wraps a promise so that only the most recent call delivers its result.
 * If a slower, older request finishes after a newer one (fast filter changes, switching
 * conversations, polling), its result is silently dropped instead of overwriting fresh data.
 */
export default function useLatest() {
  const counter = useRef(0);
  return useCallback((promise) => {
    const mine = ++counter.current;
    return new Promise((resolve, reject) => {
      promise.then(
        (v) => { if (mine === counter.current) resolve(v); },
        (e) => { if (mine === counter.current) reject(e); },
      );
    });
  }, []);
}
