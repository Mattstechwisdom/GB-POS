export function formatPhone(phone?: string) {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length !== 10) return phone;
  return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
}

export function formatMoney(amount: number) {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString();
}
