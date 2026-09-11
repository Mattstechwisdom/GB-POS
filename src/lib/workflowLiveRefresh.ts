export const WORK_ORDER_UPDATED_EVENT = 'gbpos:work-order-updated';

export function publishWorkOrderUpdate(record: any, target: EventTarget = window) {
  if (!record || record.id == null) throw new Error('A saved work order is required.');
  target.dispatchEvent(new CustomEvent(WORK_ORDER_UPDATED_EVENT, { detail: record }));
}

export function subscribeWorkOrderUpdates(listener: (record: any) => void, target: EventTarget = window) {
  const handler = (event: Event) => listener((event as CustomEvent).detail);
  target.addEventListener(WORK_ORDER_UPDATED_EVENT, handler);
  return () => target.removeEventListener(WORK_ORDER_UPDATED_EVENT, handler);
}
