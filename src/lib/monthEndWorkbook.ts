export type WorkbookMetric = { label: string; value: string; tone?: 'default' | 'positive' | 'negative' | 'accent' };
export type WorkbookSection = { title: string; rows: Array<Record<string, any>> };

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sectionTable(section: WorkbookSection) {
  const columns = Array.from(new Set(section.rows.flatMap(row => Object.keys(row))));
  if (!columns.length) return `<h2>${escapeHtml(section.title)}</h2><p class="empty">No entries.</p>`;
  const header = columns.map(column => `<th>${escapeHtml(column)}</th>`).join('');
  const body = section.rows.map((row, index) => `<tr class="${index % 2 ? 'alt' : ''}">${columns.map(column => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`).join('');
  return `<h2>${escapeHtml(section.title)}</h2><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

export function buildMonthEndWorkbookHtml(input: { monthLabel: string; summary: WorkbookMetric[]; sections: WorkbookSection[] }) {
  const metrics = input.summary.map(metric => `<td class="metric ${metric.tone || 'default'}"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong></td>`).join('');
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>
    body{font-family:Calibri,Arial,sans-serif;color:#18181b;background:#fff;margin:24px}h1{background:#09090b;color:#39ff14;padding:18px;font-size:24px;margin:0 0 8px}h1 small{display:block;color:#d4d4d8;font-size:13px;margin-top:5px}h2{background:#27272a;color:#fff;padding:9px 12px;margin:24px 0 0;font-size:16px;border-left:5px solid #bc13fe}.summary{width:100%;border-collapse:separate;border-spacing:8px;margin:10px 0 18px}.metric{border:1px solid #d4d4d8;background:#fafafa;padding:12px}.metric span{display:block;color:#52525b;font-size:11px;text-transform:uppercase}.metric strong{display:block;font-size:19px;margin-top:5px}.metric.positive strong{color:#15803d}.metric.negative strong{color:#b91c1c}.metric.accent strong{color:#7e22ce}table{width:100%;border-collapse:collapse;margin:0 0 18px}th{background:#3f3f46;color:#fff;font-weight:700;text-align:left;border:1px solid #52525b;padding:7px}td{border:1px solid #d4d4d8;padding:6px;mso-number-format:"\@"}.alt td{background:#f4f4f5}.empty{color:#71717a;border:1px solid #e4e4e7;padding:12px;margin-top:0}
  </style></head><body><h1>GadgetBoy POS<small>End of Month Report — ${escapeHtml(input.monthLabel)}</small></h1><table class="summary"><tr>${metrics}</tr></table>${input.sections.map(sectionTable).join('')}</body></html>`;
}
