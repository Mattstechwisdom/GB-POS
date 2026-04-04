import { canDispatchOpenModal, dispatchOpenModal } from '../lib/modalBus';

export function openRepairCategoriesWindow() {
  // Internal window (modal) inside the main POS UI.
  if (canDispatchOpenModal()) {
    dispatchOpenModal('repairCategories');
    return;
  }

  // Fallback (e.g. opened from a standalone child window route)
  try {
    const api = (window as any).api;
    if (api?.openRepairCategories) void api.openRepairCategories();
  } catch {}
}

export default openRepairCategoriesWindow;
