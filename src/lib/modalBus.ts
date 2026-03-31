/**
 * A simple publish-subscribe bus that lets any code dispatch a "open modal"
 * request to the running App without needing React context or prop-drilling.
 *
 * Usage:
 *   import { dispatchOpenModal } from './modalBus';
 *   dispatchOpenModal('newWorkOrder', { workOrderId: 5 });
 *
 * The App registers its handler once on mount via registerOpenModal().
 */
type OpenModalFn = (type: string, payload?: any) => void;

let _handler: OpenModalFn | null = null;

export function registerOpenModal(fn: OpenModalFn): void {
  _handler = fn;
}

export function unregisterOpenModal(): void {
  _handler = null;
}

export function dispatchOpenModal(type: string, payload?: any): void {
  if (_handler) _handler(type, payload);
}
