const LONG_PRESS_DELAY_MS = 560;
const MOVE_TOLERANCE_PX = 12;
const CLICK_SUPPRESSION_MS = 900;

const EXCLUDED_TARGETS = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'option',
  '[contenteditable="true"]',
  '[data-mobile-long-press="managed"]',
].join(',');

type ActivePress = {
  pointerId: number;
  target: HTMLElement;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  timer: number;
};

type SuppressedClick = {
  target: HTMLElement;
  until: number;
};

function elementFromTarget(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target;
  if (target instanceof Text) return target.parentElement;
  return null;
}

function relatedTarget(source: HTMLElement, target: HTMLElement) {
  return source === target || source.contains(target) || target.contains(source);
}

/**
 * Converts a deliberate touch hold into the same bubbling contextmenu event
 * used by the desktop right-click handlers. Non-touch pointers are untouched.
 */
export function installMobileLongPressContextMenu(doc: Document = document) {
  let active: ActivePress | null = null;
  let suppressedClick: SuppressedClick | null = null;

  const clearActive = () => {
    if (active) window.clearTimeout(active.timer);
    active = null;
  };

  const suppressNextClick = (target: HTMLElement) => {
    suppressedClick = { target, until: Date.now() + CLICK_SUPPRESSION_MS };
    try { navigator.vibrate?.(18); } catch {}
  };

  const openContextMenu = (press: Omit<ActivePress, 'timer'>) => {
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: press.clientX,
      clientY: press.clientY,
      button: 2,
      buttons: 2,
    });

    press.target.dispatchEvent(event);
    // Existing POS context-menu handlers call preventDefault. Only consume the
    // following tap when a real menu handled this synthetic right click.
    if (event.defaultPrevented) suppressNextClick(press.target);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !event.isPrimary || event.button !== 0) return;
    const target = elementFromTarget(event.target);
    if (!target || target.closest(EXCLUDED_TARGETS)) return;

    clearActive();
    const pending = {
      pointerId: event.pointerId,
      target,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    const timer = window.setTimeout(() => {
      if (!active || active.pointerId !== pending.pointerId) return;
      const press = { ...active };
      clearActive();
      openContextMenu(press);
    }, LONG_PRESS_DELAY_MS);
    active = { ...pending, timer };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) {
      clearActive();
      return;
    }
    active.clientX = event.clientX;
    active.clientY = event.clientY;
  };

  const onPointerEnd = (event: PointerEvent) => {
    if (active?.pointerId === event.pointerId) clearActive();
  };

  const onNativeContextMenu = (event: Event) => {
    if (!active) return;
    const target = elementFromTarget(event.target);
    if (!target || !relatedTarget(active.target, target)) return;
    const pressedTarget = active.target;
    clearActive();
    // Android may provide a native contextmenu before the fallback timer. Let
    // it bubble through React, then suppress its matching click if handled.
    window.setTimeout(() => {
      if (event.defaultPrevented) suppressNextClick(pressedTarget);
    }, 0);
  };

  const onClick = (event: MouseEvent) => {
    if (!suppressedClick || Date.now() > suppressedClick.until) {
      suppressedClick = null;
      return;
    }
    const target = elementFromTarget(event.target);
    if (!target || !relatedTarget(suppressedClick.target, target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    suppressedClick = null;
  };

  const onScroll = () => clearActive();

  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('pointermove', onPointerMove, true);
  doc.addEventListener('pointerup', onPointerEnd, true);
  doc.addEventListener('pointercancel', onPointerEnd, true);
  doc.addEventListener('contextmenu', onNativeContextMenu, false);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('scroll', onScroll, true);

  return () => {
    clearActive();
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('pointerup', onPointerEnd, true);
    doc.removeEventListener('pointercancel', onPointerEnd, true);
    doc.removeEventListener('contextmenu', onNativeContextMenu, false);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('scroll', onScroll, true);
  };
}
