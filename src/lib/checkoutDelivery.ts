export async function deliverCheckoutResult(api: any, result: any, options: { acknowledgementTimeoutMs?: number } = {}): Promise<void> {
  if (typeof api?.completeCheckout === 'function') {
    const timeoutMs = Math.max(1, Number(options.acknowledgementTimeoutMs || 4000));
    const timedOut = Symbol('checkout-acknowledgement-timeout');
    const acknowledgement = await Promise.race([
      Promise.resolve(api.completeCheckout(result)),
      new Promise(resolve => setTimeout(() => resolve(timedOut), timeoutMs)),
    ]);
    if (acknowledgement === timedOut && typeof api?._emitCheckoutSave === 'function') {
      api._emitCheckoutSave(result);
      return;
    }
    if (acknowledgement === timedOut) throw new Error('Checkout did not respond. Close this window and reopen checkout.');
    if (!acknowledgement?.ok) throw new Error(acknowledgement?.error || 'Checkout could not be completed.');
    return;
  }
  if (typeof api?._emitCheckoutSave === 'function') {
    api._emitCheckoutSave(result);
    return;
  }
  throw new Error('The desktop checkout bridge is unavailable. Close this window and reopen checkout.');
}
