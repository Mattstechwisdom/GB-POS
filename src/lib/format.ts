export function formatPhone(phone?: string) {
  if (!phone) return '';
  const raw = String(phone).trim();
  if (!raw) return '';

  // Keep any obvious extension; formatting focuses on the main 10-digit number.
  const extMatch = raw.match(/\b(?:ext\.?|x)\s*(\d{1,6})\b/i);
  const ext = extMatch?.[1] ? ` x${extMatch[1]}` : '';

  const digits = raw.replace(/\D/g, '');
  let ten = '';
  if (digits.length === 10) ten = digits;
  else if (digits.length === 11 && digits.startsWith('1')) ten = digits.slice(1);
  else if (digits.length > 10) ten = digits.slice(-10);
  else return raw;

  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}${ext}`;
}

// Formats a phone number as the user types (partial-friendly).
// Keeps digits only and inserts dashes for the common 10-digit US format.
export function formatPhoneTyping(input?: string) {
  const raw = String(input ?? '');
  if (!raw) return '';

  const digits = raw.replace(/\D/g, '');
  let ten = '';
  if (digits.length <= 10) ten = digits;
  else if (digits.length >= 11 && digits.startsWith('1')) ten = digits.slice(1, 11);
  else ten = digits.slice(0, 10);

  if (ten.length <= 3) return ten;
  if (ten.length <= 6) return `${ten.slice(0, 3)}-${ten.slice(3)}`;
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
}

// Basic name casing: first letter uppercase, rest lowercase (per word).
export function formatNameCase(input?: string) {
  const raw = String(input ?? '');
  if (!raw) return '';
  return raw.replace(/\b([A-Za-z])([A-Za-z']*)\b/g, (_m, first: string, rest: string) => {
    return `${first.toUpperCase()}${rest.toLowerCase()}`;
  });
}

export function formatMoney(amount: number) {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString();
}
