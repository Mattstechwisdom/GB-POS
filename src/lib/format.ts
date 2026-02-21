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

export function formatMoney(amount: number) {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString();
}
