export async function finishSuccessfulQuickCheckout(closeWindow: () => void | Promise<void>): Promise<void> {
  await closeWindow();
}
