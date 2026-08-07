export const SHOP_CONSULTATION_LOCATION = 'At Shop Location';

const SHOP_LOCATION_ALIASES = /^(?:in[\s-]?store|shop|at shop location)$/i;

export function consultationLocationDisplay(input: {
  consultationType?: unknown;
  consultationAddress?: unknown;
  location?: unknown;
}) {
  const type = String(input.consultationType || '').trim().toLowerCase();
  const address = String(input.consultationAddress || input.location || '').trim();
  const atHome = /^(?:athome|at[\s-]?home)$/.test(type);

  if (atHome) return address || 'At Home';
  if (!address || SHOP_LOCATION_ALIASES.test(address)) return SHOP_CONSULTATION_LOCATION;
  return address;
}
