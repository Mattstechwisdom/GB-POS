import { useEffect, useRef } from 'react';

type Options<T> = {
  debounceMs?: number; // wait time after last change
  enabled?: boolean;
  shouldSave?: (val: T) => boolean; // additional guard
  onSaved?: (val: T) => void; // callback after successful save
  equals?: (a: T, b: T) => boolean; // custom equality
};

// Simple JSON hashing fallback for deep equality
function jsonEqual(a: any, b: any) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

export function useAutosave<T>(value: T, save: (val: T) => Promise<any> | any, opts: Options<T> = {}) {
  const { debounceMs = 2000, enabled = true, shouldSave, onSaved, equals = jsonEqual } = opts;
  const timerRef = useRef<any>(null);
  const lastSavedRef = useRef<T | null>(null);
  const mountedRef = useRef(true);
  const saveRef = useRef(save);
  const shouldSaveRef = useRef(shouldSave);
  const onSavedRef = useRef(onSaved);
  const equalsRef = useRef(equals);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => { shouldSaveRef.current = shouldSave; }, [shouldSave]);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);
  useEffect(() => { equalsRef.current = equals; }, [equals]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    if (!enabled) return;
    // Guard via predicate
    if (shouldSaveRef.current && !shouldSaveRef.current(value)) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const pendingValue = value;
    timerRef.current = setTimeout(async () => {
      try {
        if (lastSavedRef.current && equalsRef.current(lastSavedRef.current, pendingValue)) return;
        await saveRef.current(pendingValue);
        lastSavedRef.current = pendingValue;
        if (onSavedRef.current) onSavedRef.current(pendingValue);
      } catch (e) {
        // swallow; caller can handle their own notifications/logging
        // intentionally no retry loop
      }
    }, Math.max(0, debounceMs));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled, debounceMs]);
}

export default useAutosave;
