export async function finishSuccessfulQuickCheckout(
  closeWindow: () => any | Promise<any>,
  closeFallback?: () => void | Promise<void>,
): Promise<void> {
  const result = await closeWindow();
  if (result && result.ok === false && closeFallback) await closeFallback();
}
