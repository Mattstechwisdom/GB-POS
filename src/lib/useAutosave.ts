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
  const lastChangeAtRef = useRef<number>(0);
  const saveRef = useRef(save);
  const shouldSaveRef = useRef(shouldSave);
  const onSavedRef = useRef(onSaved);
  const equalsRef = useRef(equals);
  const getLastSavedValueRef = useRef(getLastSavedValue);
  const enabledRef = useRef(enabled);
  const debounceMsRef = useRef(debounceMs);
  const initializedRef = useRef(false);
  const savingRef = useRef(false);
  const queuedValueRef = useRef<T | null>(null);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => { shouldSaveRef.current = shouldSave; }, [shouldSave]);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);
  useEffect(() => { equalsRef.current = equals; }, [equals]);
  useEffect(() => { getLastSavedValueRef.current = getLastSavedValue; }, [getLastSavedValue]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { debounceMsRef.current = debounceMs; }, [debounceMs]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  async function runSave(pendingValue: T) {
    if (!mountedRef.current) return;

    // Guard via predicate (important for queued/stale timers).
    if (shouldSaveRef.current && !shouldSaveRef.current(pendingValue)) return;

    // If a save is already running, remember the latest value and let the in-flight save finish.
    if (savingRef.current) {
      queuedValueRef.current = pendingValue;
      return;
    }

    // Skip if we believe this exact value is already saved.
    if (lastSavedRef.current !== null && equalsRef.current(lastSavedRef.current, pendingValue)) return;

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
        // If autosave is disabled now, drop the queued value.
        if (!enabledRef.current) return;

        // Respect debounce after the *last* change (prevents back-to-back saves while typing).
        if (timerRef.current) clearTimeout(timerRef.current);
        const dueAt = (lastChangeAtRef.current || Date.now()) + Math.max(0, debounceMsRef.current || 0);
        const delay = Math.max(0, dueAt - Date.now());
        timerRef.current = setTimeout(() => {
          void runSave(queued);
        }, delay);
      }
    }
  }

  useEffect(() => {
    // Always cancel any pending timer when inputs/options change.
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!enabled) {
      queuedValueRef.current = null;
      return;
    }

    // Guard via predicate
    if (shouldSaveRef.current && !shouldSaveRef.current(value)) {
      queuedValueRef.current = null;
      return;
    }

    lastChangeAtRef.current = Date.now();

    if (!initializedRef.current) {
      initializedRef.current = true;
      if (skipInitialSave) {
        lastSavedRef.current = value;
        return;
      }
    }

    // If a save is in-flight, only queue the latest value and let the completion path
    // schedule the next save after the debounce window.
    if (savingRef.current) {
      queuedValueRef.current = value;
      return;
    }

    const pendingValue = value;
    timerRef.current = setTimeout(async () => {
      void runSave(pendingValue);
    }, Math.max(0, debounceMs));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled, debounceMs]);
}

export default useAutosave;
