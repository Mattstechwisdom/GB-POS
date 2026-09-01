export const CONTEXT_MENU_LAYER = 100600;

export function resolveContextMenuZIndex(requested?: number): number {
  const value = Number(requested);
  return Number.isFinite(value) ? Math.max(CONTEXT_MENU_LAYER, value) : CONTEXT_MENU_LAYER;
}
