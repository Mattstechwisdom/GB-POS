export async function deliverCheckoutResult(api: any, result: any): Promise<void> {
  if (typeof api?.completeCheckout === 'function') {
    const acknowledgement = await api.completeCheckout(result);
    if (!acknowledgement?.ok) throw new Error(acknowledgement?.error || 'Checkout could not be completed.');
    return;
  }
  if (typeof api?._emitCheckoutSave === 'function') {
    api._emitCheckoutSave(result);
    return;
  }
  throw new Error('The desktop checkout bridge is unavailable. Close this window and reopen checkout.');
}
