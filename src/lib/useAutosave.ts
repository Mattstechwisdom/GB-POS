import { useEffect, useRef } from 'react';

type Options<T> = {
  debounceMs?: number; // wait time after last change
  enabled?: boolean;
  shouldSave?: (val: T) => boolean; // additional guard
  onSaved?: (val: T) => void; // callback after successful save
  equals?: (a: T, b: T) => boolean; // custom equality
  getLastSavedValue?: (pendingValue: T, saveResult: any) => T; // derive last-saved marker from save() result
  skipInitialSave?: boolean;
};

// Simple JSON hashing fallback for deep equality
function jsonEqual(a: any, b: any) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

export function useAutosave<T>(value: T, save: (val: T) => Promise<any> | any, opts: Options<T> = {}) {
  const { debounceMs = 1000, enabled = true, shouldSave, onSaved, equals = jsonEqual, getLastSavedValue, skipInitialSave = false } = opts;
  const timerRef = useRef<any>(null);
  const lastSavedRef = useRef<T | null>(null);
  const mountedRef = useRef(true);
  const saveRef = useRef(save);
  const shouldSaveRef = useRef(shouldSave);
  const onSavedRef = useRef(onSaved);
  const equalsRef = useRef(equals);
  const getLastSavedValueRef = useRef(getLastSavedValue);
  const initializedRef = useRef(false);
  const savingRef = useRef(false);
  const queuedValueRef = useRef<T | null>(null);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => { shouldSaveRef.current = shouldSave; }, [shouldSave]);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);
  useEffect(() => { equalsRef.current = equals; }, [equals]);
  useEffect(() => { getLastSavedValueRef.current = getLastSavedValue; }, [getLastSavedValue]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  async function runSave(pendingValue: T) {
    if (!mountedRef.current) return;

    // If a save is already running, remember the latest value and let the in-flight save finish.
    if (savingRef.current) {
      queuedValueRef.current = pendingValue;
      return;
    }

    // Skip if we believe this exact value is already saved.
    if (lastSavedRef.current && equalsRef.current(lastSavedRef.current, pendingValue)) return;

    savingRef.current = true;
    queuedValueRef.current = null;
    try {
      const result = await saveRef.current(pendingValue);
      const nextLastSaved = getLastSavedValueRef.current ? getLastSavedValueRef.current(pendingValue, result) : pendingValue;
      lastSavedRef.current = nextLastSaved;
      if (onSavedRef.current) onSavedRef.current(pendingValue);
    } catch {
      // swallow; caller can handle their own notifications/logging
      // intentionally no retry loop
    } finally {
      savingRef.current = false;
      if (!mountedRef.current) return;
      const queued = queuedValueRef.current;
      if (queued) {
        queuedValueRef.current = null;
        // Save the most recent queued value promptly after the in-flight save finishes.
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          void runSave(queued);
        }, 0);
      }
    }
  }

  useEffect(() => {
    if (!enabled) return;
    // Guard via predicate
    if (shouldSaveRef.current && !shouldSaveRef.current(value)) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      if (skipInitialSave) {
        lastSavedRef.current = value;
        return;
      }
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    const pendingValue = value;
    timerRef.current = setTimeout(async () => {
      void runSave(pendingValue);
    }, Math.max(0, debounceMs));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled, debounceMs]);
}

export default useAutosave;
