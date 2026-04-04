import { canDispatchOpenModal, dispatchOpenModal } from '../lib/modalBus';

export function openRepairCategoriesWindow() {
  if (canDispatchOpenModal()) {
    dispatchOpenModal('repairCategories');
    return;
  }
  try {
    const api = (window as any).api;
    if (api?.openRepairCategories) void api.openRepairCategories();
  } catch {}
}

export default openRepairCategoriesWindow;
