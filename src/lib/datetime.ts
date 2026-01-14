export function toLocalDatetimeInput(iso?: string | null) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    // omit milliseconds for compatibility
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
  } catch (e) { return ''; }
}

export function fromLocalDatetimeInput(value: string) {
  if (!value) return null;
  // value is like 'yyyy-MM-ddThh:mm' or with seconds
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Format an "HH:MM" 24h time string to 12-hour display like "1:05 PM"
export function formatTime12FromHHmm(t?: string | null) {
  if (!t) return '';
  try {
    const [hh, mm] = t.split(':').map((v) => parseInt(v, 10));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
    const period = hh >= 12 ? 'PM' : 'AM';
    const h12 = ((hh % 12) || 12);
    const m2 = mm.toString().padStart(2, '0');
    return `${h12}:${m2} ${period}`;
  } catch {
    return '';
  }
}

// Format a Date to a 12-hour local date-time string, e.g., "MM/DD/YYYY, 1:05 PM"
export function formatLocalDateTime12(d: Date) {
  try {
    return d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

export default { toLocalDatetimeInput, fromLocalDatetimeInput, formatTime12FromHHmm, formatLocalDateTime12 };
