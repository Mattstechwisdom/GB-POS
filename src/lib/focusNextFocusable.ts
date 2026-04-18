export function focusNextFocusable(from: HTMLElement, direction: 1 | -1 = 1): boolean {
  try {
    const doc = from?.ownerDocument || document;

    const candidates = Array.from(
      doc.querySelectorAll<HTMLElement>(
        'input, select, textarea, button, a[href], [tabindex]'
      )
    )
      .filter((el) => {
        if (!el) return false;
        if (el.tabIndex < 0) return false;
        const anyEl: any = el as any;
        if (anyEl.disabled) return false;
        if (el.getAttribute('aria-disabled') === 'true') return false;
        // Visible-ish check
        if (el.getClientRects().length === 0) return false;
        return true;
      });

    if (!candidates.length) return false;

    const idx = candidates.indexOf(from);
    if (idx < 0) {
      // If the element isn't in the list (rare), just focus the first/last.
      const fallback = direction === 1 ? candidates[0] : candidates[candidates.length - 1];
      fallback?.focus?.();
      return true;
    }

    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= candidates.length) return false;

    const next = candidates[nextIdx];
    next?.focus?.();
    return true;
  } catch {
    return false;
  }
}
