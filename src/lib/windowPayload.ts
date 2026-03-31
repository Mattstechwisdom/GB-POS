/**
 * A lightweight key-value store for passing payloads to modal window components
 * that normally read from URL query-string parameters.
 *
 * When dispatching a modal from within the main app (no URL change), store the
 * payload here before rendering. Window components call consumeWindowPayload()
 * once on mount, which returns the stored value and frees the slot.
 *
 * Usage (dispatcher):
 *   storeWindowPayload('newWorkOrder', { workOrderId: 42 });
 *   dispatchOpenModal('newWorkOrder');
 *
 * Usage (component – called once, typically inside useMemo or at module level):
 *   const payload = consumeWindowPayload('newWorkOrder') ?? readFromUrlParams();
 */
const store: Record<string, any> = {};

export function storeWindowPayload(key: string, data: any): void {
  store[key] = data;
}

/** Returns the stored payload and removes it from the store. */
export function consumeWindowPayload(key: string): any {
  const value = store[key];
  delete store[key];
  return value ?? null;
}

/** Returns the stored payload WITHOUT removing it (use for components whose
 *  initialisation spans multiple renders). */
export function peekWindowPayload(key: string): any {
  return store[key] ?? null;
}
