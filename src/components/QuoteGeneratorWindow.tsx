import { publicAsset } from '../lib/publicAsset';
import React, { useEffect, useMemo, useState } from 'react';
import { getOsOptions } from '../lib/osVersions';
import { deviceTypes as DEVICE_TYPE_DEFS } from '../lib/deviceTypes';

// Minimal types to satisfy this component
type SaleItem = {
  expanded?: boolean;
  images?: string[];
  dynamic?: Record<string, any>;
  deviceType?: string;
  brand?: string;
  model?: string;
  description?: string;
  condition?: string;
  accessories?: string;
  url?: string; // new: source or ordering URL
  prompt?: string;
  price?: string | number;
  inStock?: boolean; // new: track whether this item is in stock
};

type SalesState = {
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  items: SaleItem[];
};

type RepairLine = { description: string; partPrice?: string | number; laborPrice?: string | number };
type RepairsState = {
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  lines: RepairLine[];
  selectedCategoryId?: string;
  selectedRepairId?: string;
};

const PERIPHERAL_TYPE_OPTIONS: string[] = [
  'Monitor',
  'Keyboard',
  'Mouse',
  'Keyboard/Mouse Combo',
  'Headset',
  'Speakers',
  'External Storage Device',
  'Controller',
  'Webcam',
  'Microphone',
  'USB Hub/Dock',
  'Other',
];

// Lightweight Field and ComboInput used in this window
const Field: React.FC<{ label: string; value: any; onChange: (v: string) => void; type?: string; placeholder?: string }> = ({ label, value, onChange, type, placeholder }) => (
  <div>
    <label className="block text-xs text-zinc-400 mb-1">{label}</label>
    <input
      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      type={type}
      placeholder={placeholder}
    />
  </div>
);

const ComboInput: React.FC<{ value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }> = ({ value, onChange, options, placeholder }) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState('');
  const [highlight, setHighlight] = React.useState<number>(-1);

  const filtered = (options || []).filter((o) => String(o || '').toLowerCase().includes(String(filter || value || '').toLowerCase()));

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && ['ArrowDown','ArrowUp'].includes(e.key)) setOpen(true);
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min((filtered.length - 1), Math.max(0, h + 1))); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
    if (e.key === 'Enter') {
      if (open && highlight >= 0 && highlight < filtered.length) { onChange(filtered[highlight]); setOpen(false); setHighlight(-1); }
    }

    
    if (e.key === 'Escape') { setOpen(false); setHighlight(-1); }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
        value={filter.length > 0 ? filter : (value || '')}
        onChange={(e) => { setFilter(e.target.value); onChange(e.target.value); setOpen(true); setHighlight(-1); }}
        placeholder={placeholder || 'Type or select...'}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded max-h-48 overflow-auto z-50">
          {filtered.map((opt, i) => (
            <div
              key={opt + i}
              className={`px-2 py-1 text-sm cursor-pointer ${i === highlight ? 'bg-zinc-700' : 'hover:bg-zinc-700'}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setFilter(''); setOpen(false); setHighlight(-1); }}
            >{opt}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// Simple autosave with debounce
function useAutosave<T>(value: T, cb: () => void, opts?: { debounceMs?: number; enabled?: boolean }) {
  useEffect(() => {
    if (opts && opts.enabled === false) return;
    const t = setTimeout(() => { try { cb(); } catch {} }, opts?.debounceMs ?? 2000);
    return () => clearTimeout(t);
  // stringify as a coarse change detector
  }, [JSON.stringify(value), opts?.debounceMs, opts?.enabled]);
}

function QuoteGeneratorWindow(): JSX.Element {
  // Mode: sales-only UI, but keep repairs code path intact
  const [mode, setMode] = useState<'sales' | 'repairs'>('sales');
  const [sales, setSales] = useState<SalesState>({ items: [] });
  const [repairs, setRepairs] = useState<RepairsState>({ lines: [] });
  const [quotes, setQuotes] = useState<any[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [htmlPreviewUrl, setHtmlPreviewUrl] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailFromName, setEmailFromName] = useState('GadgetBoy Repair & Retail');
  const [emailAppPassword, setEmailAppPassword] = useState('');
  const [emailHasPassword, setEmailHasPassword] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailSettingsSaving, setEmailSettingsSaving] = useState(false);
  const [emailSettingsErr, setEmailSettingsErr] = useState<string | null>(null);
  const [printPreviewUrl, setPrintPreviewUrl] = useState<string | null>(null);
  const [quoteId, setQuoteId] = useState<number | undefined>(undefined);
  // Track expanded categories per item for Custom PC (keyed by item index string)
  const [openCats, setOpenCats] = useState<Record<string, Record<string, boolean>>>({});

  // Use the full device type catalog from lib so all dropdowns are available
  const deviceTypes = useMemo(() => DEVICE_TYPE_DEFS, []);
  // Options for the Device Type dropdown: remove 'Custom Build' and force 'Custom PC' to the end
  const deviceTypeOptions = useMemo(() => {
    try {
      const all = (deviceTypes || []).map((d: any) => d.type).filter(Boolean) as string[];
      const filtered = all.filter((t) => t !== 'Custom Build' && t !== 'Custom PC' && t !== 'Other');
      // Ensure Custom PC and Other are last (Other at the very bottom)
      return [...filtered, 'Custom PC', 'Other'];
    } catch { return (deviceTypes || []).map((d: any) => d.type).concat(['Custom PC','Other']); }
  }, [deviceTypes]);

  const salesTotals = useMemo(() => {
    try {
      const subtotal = (sales.items || []).reduce((acc, it) => acc + (Number(it.price) || 0), 0);
      return { subtotal, total: subtotal } as any;
    } catch { return { subtotal: 0, total: 0 } as any; }
  }, [sales]);

  const repairTotals = useMemo(() => {
    try {
      const parts = (repairs.lines || []).reduce((acc, ln) => acc + (Number(ln.partPrice) || 0), 0);
      const labor = (repairs.lines || []).reduce((acc, ln) => acc + (Number(ln.laborPrice) || 0), 0);
      const total = parts + labor;
      return { parts, labor, total } as any;
    } catch { return { parts: 0, labor: 0, total: 0 } as any; }
  }, [repairs]);

  function buildInteractiveSalesHtml(logoDataUrl?: string): string {
      const fallbackLogo = publicAsset('logo-spin.gif');
    const esc = (s: string) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const cust = `${sales.customerName || ''}`.trim();
    const phone = `${sales.customerPhone || ''}`.trim();
    const ts = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const mm = pad(ts.getMonth() + 1), dd = pad(ts.getDate()), yy = String(ts.getFullYear()).slice(-2);
  const h24 = ts.getHours(), h12 = h24 % 12 === 0 ? 12 : h24 % 12; const hh = pad(h12), mi = pad(ts.getMinutes()), ss = pad(ts.getSeconds());
  const nowDate = `${mm}/${dd}/${yy}`;
  const stampTitle = `${mm}${dd}${yy} ${hh}${mi}${ss}`; // full timestamp for document title
  const stampShort = `${mm}${dd}${yy} ${hh}${mi}`; // for filenames (no seconds)

    // Final page for non-custom devices: Notes box + checklist + terms + signature/date (single page)
    const finalPageInteractive = () => {
      const labels = sales.items.map((it, i) => {
        const model = String(((it.model ?? (it as any).dynamic?.model) || '')).trim();
        return (model ? [it.brand, model].filter(Boolean).join(' ').trim() : '') || `Item ${i + 1}`;
      });
      const checklistHtml = labels
        .map((label, i) => {
          const safe = esc(label);
          return `<label style="display:flex; align-items:flex-start; gap:8px; margin:0 0 6px 0"><input type="checkbox" style="margin-top:2px"/> <span>${safe || `Item ${i + 1}`}</span></label>`;
        })
        .join('');

      return `
      <div class="print-page" style="width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:12mm">
        <div class="page-inner" style="display:flex; flex-direction:column; min-height:273mm; padding-top:8px">
          <div style="font-weight:800; margin-bottom:10px; font-size:14pt; text-align:center">Notes, Checklist, Terms</div>

          <div style="font-weight:700; margin-bottom:6px; font-size:12pt">Notes</div>
          <textarea id="clientNotes" placeholder="Notes, requested changes, questions, or preferences..." style="width:100%; height:52mm; border:2px solid #f00; border-radius:4px; padding:10px; font: 11pt system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; box-sizing:border-box; resize:vertical"></textarea>

          <div style="font-weight:700; margin-top:14px; margin-bottom:6px; font-size:12pt">Checklist</div>
          <div style="border:2px solid #f00; border-radius:4px; padding:10px; font-size:11pt; line-height:1.35">
            <div style="columns:2; column-gap:16px">${checklistHtml || '<div style="color:#666">No items listed.</div>'}</div>
          </div>
          <div style="margin-top:auto">
            <div style="font-weight:700; margin-top:14px; margin-bottom:6px; font-size:12pt">Terms and Conditions</div>
            <div style="border:2px solid #f00; border-radius:4px; padding:12px; font-size:11pt; line-height:1.45">
              <ul style="padding-left:1.1rem; margin:0">
                <li style="margin-bottom:6px"><b>Quote Validity & Availability:</b> Pricing is provided as of the date issued and may change prior to purchase.</li>
                <li style="margin-bottom:6px"><b>Warranty & Exclusions:</b> 90-day limited hardware warranty for defects under normal use; exclusions include physical/impact damage, liquid exposure, unauthorized repairs/modifications, abuse/neglect, loss/theft, and third-party accessories.</li>
                <li style="margin-bottom:6px"><b>Data & Software:</b> Client is responsible for backups and licensing. Service may require updates/reinstall/reset; we are not responsible for data loss.</li>
                <li style="margin-bottom:6px"><b>Deposits & Special Orders:</b> Deposits may be required to order parts/products. Special-order items may be non-returnable and subject to supplier restocking policies.</li>
                <li style="margin-bottom:6px"><b>Returns & Cancellations:</b> Returns/cancellations are subject to manufacturer/vendor policies and may incur restocking/processing fees. Labor and time spent is non-refundable.</li>
                <li style="margin-bottom:6px"><b>Taxes & Fees:</b> Sales tax and applicable fees may apply at checkout; printed totals may be shown before tax.</li>
                <li style="margin-bottom:0"><b>Limitation of Liability:</b> Liability is limited to amounts paid; incidental or consequential damages are excluded where permitted by law.</li>
              </ul>
            </div>

            <div style="margin-top:16px">
              <div style="font-weight:700; margin-bottom:6px; font-size:12pt">Signature</div>
              <div id="sigSection" style="display:flex; gap:24px; align-items:flex-start; break-inside: avoid; page-break-inside: avoid">
                <div style="flex:1">
                  <canvas id="sigPad" style="width:100%; height:96px; display:block; background:#ffffff; border:1px solid #000; border-radius:4px"></canvas>
                  <div class="sig-actions no-print" style="margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap">
                    <input id="sigName" type="text" placeholder="Type full name to sign" style="flex:1; padding:6px; font-size:12px" />
                    <button id="sigApply" type="button" style="padding:6px; font-size:12px">Apply Typed</button>
                    <button id="sigClear" type="button" style="padding:6px; font-size:12px">Clear</button>
                    <button id="finalize" type="button" style="padding:6px; font-size:12px">Finalize</button>
                  </div>
                </div>
                <div style="width:220px">
                  <div id="dateBox" style="border-bottom:2px solid #000; height:0; margin-bottom:4px"></div>
                  <div style="font-size:12pt">Date</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    };

    // -------- Device pages (mirror print layout) --------
    const specRowsInteractive = (item: SaleItem) => {
      const rows: Array<[string, string]> = [];
      const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').split(' ').filter(Boolean).map((w) => { const up = w.toUpperCase(); return (w.length <= 3 && w === up) ? up : (w.charAt(0).toUpperCase() + w.slice(1)); }).join(' ');
      if (item.deviceType) rows.push(['Device Type', item.deviceType]);
      const appleFamily = (item.dynamic || ({} as any)).device as string | undefined;
      if (appleFamily) rows.push(['Apple Family', appleFamily]);
      if (item.model) rows.push(['Model', item.model]);
      if (item.condition) rows.push(['Condition', item.condition]);
      if (item.accessories) rows.push(['Accessories', item.accessories]);
      try {
        Object.entries(item.dynamic || {}).forEach(([k, v]) => { if (k !== 'device') rows.push([titleCase(k), String(v ?? '')]); });
      } catch {}
      return rows.map(([k, v]) => `<tr><td style="border:1px solid #f00; padding:6px 14px; font-weight:600; white-space:nowrap">${esc(k)}</td><td style="border:1px solid #f00; padding:6px 14px">${esc(v)}</td></tr>`).join('');
    };

    const devicePageInteractive = (item: SaleItem, title: string, standalone: boolean = true) => {
      const images = (item.images || []).slice(0, 3);
      const base = parseFloat((item.price || '').toString());
      const shown = Number.isFinite(base) && base > 0 ? (base * 1.15) : null;
      const inner = `
        <div class=\"text-base\" style=\"text-align:center; font-weight:600; margin-bottom:8px\">${esc(title)}</div>
        ${images.length ? `
          <div style=\"margin-bottom:10px; display:flex; gap:12px; flex-wrap:wrap; justify-content:center; align-items:center\">
            ${images.map((src) => `<img src=\"${src}\" style=\"max-height:55mm; max-width:55mm; object-fit:contain; border:1px solid #e5e7eb; border-radius:4px; padding:2px\" />`).join('')}
          </div>` : ''}
        <div style=\"display:grid; grid-template-columns:1fr auto 1fr; align-items:end; column-gap:12px; width:100%\">
          <div style=\"grid-column:2; text-align:center; justify-self:center; margin-left:auto; margin-right:auto\">
            <div style=\"font-size:12pt; border:2px solid #f00; display:inline-block; padding:12px 14px; border-radius:4px\">
              <div style=\"font-weight:600; margin-bottom:6px; text-align:center\">Specifications</div>
              <table style=\"border-collapse:collapse; display:inline-table; width:auto; table-layout:auto\"><tbody>
                ${specRowsInteractive(item)}
              </tbody></table>
            </div>
          </div>
          ${shown != null ? `<div style=\"grid-column:3; justify-self:end\">
            <div style=\"display:inline-block; border:1px solid #f00; padding:6px 10px; border-radius:4px; font-size:10pt; white-space:nowrap; font-weight:700\">Total (before tax): $${shown.toFixed(2)}</div>
          </div>` : ``}
        </div>
        ${item.prompt && String(item.prompt).trim().length > 0 ? `
          <div style=\"text-align:center; font-size:13pt; line-height:1.45; max-width:180mm; margin:18px auto 0 auto; border:2px solid #f00; border-radius:4px; padding:10px 12px\">${esc(item.prompt || '')}</div>
        ` : ''}`;
      return standalone
        ? `<div class=\"print-page\" style=\"width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:10mm\"><div class=\"page-inner\">${inner}</div></div>`
        : inner;
    };

    const pages: string[] = [];
    // Page 1 header + first device
    const first = sales.items[0];
    const firstTitleModel = first ? String(((first.model ?? (first as any).dynamic?.model) || '')).trim() : '';
    const firstTitle = firstTitleModel ? [first?.brand, firstTitleModel].filter(Boolean).join(' ').trim() : 'First Device';

    // -------------------------------------------------------------
    // Custom Build: entirely separate print pipeline
    // Trigger for any deviceType containing "custom" (e.g., "Custom Build", "Custom PC")
    // -------------------------------------------------------------
    if (first && /custom/i.test(String((first as any).deviceType || (first as any).deviceCategory || (first as any).category || ''))) {
      const TAX_RATE = 0.08; // configurable sales tax (8%)
      const dyn: any = first.dynamic || {};
      type Part = { label: string; key: string; desc: string; priceRaw: number; priceMarked: number; image?: string; image2?: string };
      const baseParts: Array<{ key: string; label: string }> = [
        { key: 'case', label: 'Case' },
        { key: 'motherboard', label: 'Motherboard' },
        { key: 'cpu', label: 'Processor' },
        { key: 'cooling', label: 'Cooling' },
        { key: 'ram', label: 'Memory' },
        { key: 'gpu', label: 'Graphics Card' },
        { key: 'storage', label: 'Storage' },
        { key: 'psu', label: 'PSU' },
        { key: 'os', label: 'Operating System' },
      ];
      const parts: Part[] = [];
      const buildDesc = (key: string) => {
        const raw = String(dyn[key] || dyn[`${key}Info`] || '').trim();
        const combine = (parts: (string|undefined)[]) => parts.filter(Boolean).map(String).map(s=>s.trim()).filter(Boolean).join(' | ');
        switch (key) {
          case 'cpu':
            return combine([raw, dyn.cpuGen && `Gen ${dyn.cpuGen}`, dyn.cpuCores && `${dyn.cpuCores} cores`, dyn.cpuClock && `${dyn.cpuClock}`]) || raw;
          case 'ram':
            return combine([raw, dyn.ramSize && `${dyn.ramSize}`, dyn.ramSpeed && `${dyn.ramSpeed}`, dyn.ramType && `${dyn.ramType}`]) || raw;
          case 'gpu':
            return combine([raw, dyn.gpuModel || dyn.gpu, dyn.gpuVram && `${dyn.gpuVram}`]) || raw;
          case 'storage':
            return combine([raw, dyn.storageType || dyn.bootDriveType, dyn.storageSize || dyn.bootDriveStorage]) || raw;
          case 'motherboard':
            return combine([raw, dyn.moboChipset && `Chipset: ${dyn.moboChipset}`, dyn.formFactor && `${dyn.formFactor}`]) || raw;
          case 'psu':
            return combine([raw, dyn.psuWatt && `${dyn.psuWatt}W`]) || raw;
          case 'cooling':
            return combine([raw, dyn.coolingType]) || raw;
          case 'case':
            return combine([raw, dyn.caseFormFactor && `${dyn.caseFormFactor}`]) || raw;
          case 'os':
            return raw || dyn.os || '';
          default:
            return raw;
        }
      };
      baseParts.forEach(p => {
        const desc = buildDesc(p.key);
        const priceRaw = Number(dyn[`${p.key}Price`] || 0) || 0;
        const imagesArr = Array.isArray(dyn[`${p.key}Images`]) ? dyn[`${p.key}Images`] : [];
        let image: string | undefined = dyn[`${p.key}Image`] ? String(dyn[`${p.key}Image`]) : undefined;
        let image2: string | undefined = dyn[`${p.key}Image2`] ? String(dyn[`${p.key}Image2`]) : undefined;
        if (!image && imagesArr[0]) image = String(imagesArr[0]);
        if (!image2 && imagesArr[1]) image2 = String(imagesArr[1]);
        if (!desc && !priceRaw && !image && !image2) return; // skip completely empty
        parts.push({ label: p.label, key: p.key, desc, priceRaw, priceMarked: priceRaw * 1.05, image, image2 });
      });

      // Peripherals (Custom PC) - render as line items directly under OS
      const pcExtras = Array.isArray(dyn.pcExtras) ? dyn.pcExtras : [];
      pcExtras.forEach((e: any, i: number) => {
        const label = String(e?.label || e?.type || e?.name || '').trim() || 'Peripheral';
        const desc = String(e?.desc || '').trim();
        const priceRaw = Number(e?.price || 0) || 0;
        const imagesArr = Array.isArray(e?.images) ? e.images : [];
        let image: string | undefined = e?.image ? String(e.image) : undefined;
        let image2: string | undefined = e?.image2 ? String(e.image2) : undefined;
        if (!image && imagesArr[0]) image = String(imagesArr[0]);
        if (!image2 && imagesArr[1]) image2 = String(imagesArr[1]);
        if (!desc && !priceRaw && !image && !image2) return;
        parts.push({ label, key: `pc-extra-${i}`, desc, priceRaw, priceMarked: priceRaw * 1.05, image, image2 });
      });
      // Extra parts (array)
      const extras = Array.isArray(dyn.extraParts) ? dyn.extraParts : [];
      extras.forEach((e: any) => {
        const label = String(e?.name || 'Extra');
        const desc = String(e?.desc || '').trim();
        const priceRaw = Number(e?.price || 0) || 0;
        const imagesArr = Array.isArray(e?.images) ? e.images : [];
        let image: string | undefined = e?.image ? String(e.image) : undefined;
        let image2: string | undefined = e?.image2 ? String(e.image2) : undefined;
        if (!image && imagesArr[0]) image = String(imagesArr[0]);
        if (!image2 && imagesArr[1]) image2 = String(imagesArr[1]);
        if (!label && !desc && !priceRaw && !image && !image2) return;
        parts.push({ label, key: `extra-${label}`, desc, priceRaw, priceMarked: priceRaw * 1.05, image, image2 });
      });
      const laborRaw = Number(dyn.buildLabor || 0) || 0; // no markup

      // Paginate parts with images first (show rows regardless of image; up to 4 per page)
      const chunk = <T,>(arr: T[], size: number) => {
        const out: T[][] = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out;
      };
      const partPages = chunk(parts, 6);

      const headerBlock = () => `
        <div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:12px">
           <img src="${logoDataUrl || fallbackLogo}" alt="GadgetBoy" style="height:30mm; width:auto" />
          <div style="line-height:1.15; flex:1">
            <div style="font-size:18pt; font-weight:700; letter-spacing:0.3px">Custom PC Build Quote</div>
            <div style="font-size:12pt; font-weight:700">GADGETBOY Repair & Retail</div>
            <div style="font-size:11pt">2822 Devine Street, Columbia, SC 29205</div>
            <div style="font-size:11pt">(803) 708-0101 | gadgetboysc@gmail.com</div>
            <div style="margin-top:6px; font-size:11pt"><b>Customer:</b> ${esc(cust || '-')} | <b>Phone:</b> ${esc(phone)}</div>
            <div style="font-size:11pt; color:#555">Generated: ${esc(nowDate)}</div>
          </div>
        </div>`;

      // Render a single part as a bordered box with two columns: images (up to 2) | description with price under
      const partBox = (p: Part) => {
        // OS: text-only box (no images, no price)
        if (String(p.key).toLowerCase() === 'os' || String(p.label).toLowerCase().includes('operating system')) {
          return `
        <div style=\"display:grid; grid-template-columns:42mm 1fr; column-gap:10px; align-items:stretch; margin-bottom:8px\">
          <div></div>
            <div style=\"border:2px solid #f00; border-radius:6px; padding:8px; min-height:22mm\">
            <div style=\"font-weight:700; margin-bottom:2px\">${esc(p.label)}</div>
            <div style=\"font-size:10.5pt; line-height:1.35\">${esc(p.desc || '-') }</div>
          </div>
        </div>`;
        }
        const imgs = [p.image, p.image2].filter(Boolean) as string[];
          const leftCol = imgs.length >= 2
          ? `
            <div style="width:44mm; height:34mm; display:flex; flex-direction:column; gap:4px; background:#fff; border:1px solid #e5e7eb; border-radius:4px; padding:4px; box-sizing:border-box">
              <div style="flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden"><img src="${imgs[0]}" style="max-width:100%; max-height:100%; object-fit:contain; display:block" /></div>
              <div style="flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden"><img src="${imgs[1]}" style="max-width:100%; max-height:100%; object-fit:contain; display:block" /></div>
            </div>`
          : (imgs.length === 1
            ? `<div style="width:44mm; height:34mm; display:flex; align-items:center; justify-content:center; background:#fff; border:1px solid #e5e7eb; border-radius:4px; overflow:hidden"><img src="${imgs[0]}" style="max-width:100%; max-height:100%; object-fit:contain; display:block" /></div>`
            : `<div style="width:44mm; height:34mm; display:flex; align-items:center; justify-content:center; background:#fff; border:1px solid #e5e7eb; border-radius:4px; overflow:hidden"><div style=\"font-size:9pt; color:#888\">No Image</div></div>`);

        return `
        <div style="display:grid; grid-template-columns:44mm 1fr; column-gap:8px; align-items:stretch; margin-bottom:6px">
          ${leftCol}
          <div style="border:2px solid #f00; border-radius:6px; padding:6px; min-height:14mm; display:flex; align-items:center; justify-content:center; text-align:center; flex-direction:column">
            <div style="font-weight:700; margin-bottom:4px">${esc(p.label)}</div>
            <div style="font-size:10.5pt; line-height:1.35; margin-bottom:4px">${esc(p.desc || '-') }</div>
            <div style="font-weight:700; font-size:11pt">$${(p.priceMarked || 0).toFixed(2)}</div>
          </div>
        </div>`;
      };

      // First page shows up to 6 boxes under the header; subsequent pages show up to 6 boxes per page
      const firstPageParts = parts.slice(0, 6);
      const remainingParts = parts.slice(6);
      const remainingChunks = chunk(remainingParts, 6);

      const firstPageHtml = `
        <div class=\"print-page\" style=\"width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:11mm\">
          <div class=\"page-inner\">
            ${headerBlock()}
            ${firstPageParts.length ? firstPageParts.map(partBox).join('') : `<div style=\"border:1px dashed #f00; padding:10px; text-align:center; color:#666\">No parts listed.</div>`}
          </div>
        </div>`;

      const promptHtmlBlock = first && first.prompt && String(first.prompt).trim().length > 0
        ? `\n            <div style="text-align:center; font-size:12.5pt; line-height:1.45; max-width:180mm; margin:12px auto 0 auto; border:2px solid #f00; border-radius:4px; padding:10px 12px">${esc(first.prompt || '')}</div>`
        : '';

      let otherPagesHtml = '';
      if (remainingChunks.length > 0) {
        otherPagesHtml = remainingChunks.map((group, i) => `
        <div class="print-page" style="width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:11mm">
          <div class="page-inner">
            ${group.map(partBox).join('')}${i === 0 ? promptHtmlBlock : ''}
          </div>
        </div>`).join('');
      } else if (promptHtmlBlock) {
        // No remaining part pages - create a dedicated second page for the AI summary
        otherPagesHtml = `
        <div class="print-page" style="width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:11mm">
          <div class="page-inner">
            ${promptHtmlBlock}
          </div>
        </div>`;
      }

      let partPagesHtml = firstPageHtml + otherPagesHtml;

      // Summary page (labor + totals)
      const pricedParts = parts.filter(p => !(String(p.key).toLowerCase() === 'os' || String(p.label).toLowerCase().includes('operating system')));
      const partsSubtotal = pricedParts.reduce((acc, p) => acc + (p.priceMarked || 0), 0);
      const taxableParts = partsSubtotal; // Labor is NOT taxed
      const taxAmount = taxableParts * TAX_RATE;
      const subtotalBeforeTax = taxableParts; // clarify: before tax means parts only
      const totalAfterTax = taxableParts + taxAmount + laborRaw;
      const summaryPage = `
        <div class="print-page" style="width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:11mm">
          <div class="page-inner">
            <div style="font-weight:700; font-size:13pt; margin-bottom:6px; text-align:center">Itemized Summary</div>
            <table style="border-collapse:collapse; width:100%; font-size:10pt">
              <thead>
                <tr><th style="border:1px solid #f00; padding:6px; text-align:left">Component</th><th style="border:1px solid #f00; padding:6px; text-align:right">Price</th></tr>
              </thead>
              <tbody>
                ${pricedParts.map(p => `<tr><td style=\"border:1px solid #f00; padding:6px\"><b>${esc(p.label)}</b>${p.desc ? ` - ${esc(p.desc)}` : ''}</td><td style=\"border:1px solid #f00; padding:6px; text-align:right\">$${(p.priceMarked || 0).toFixed(2)}</td></tr>`).join('') || '<tr><td colspan=\"2\" style=\"border:1px solid #f00; padding:8px; text-align:center; color:#666\">No components listed.</td></tr>'}
              </tbody>
              <tfoot>
                <tr><td style="border:1px solid #f00; padding:6px; text-align:right; font-weight:600">Parts Subtotal</td><td style="border:1px solid #f00; padding:6px; text-align:right; font-weight:600">$${partsSubtotal.toFixed(2)}</td></tr>
                <tr><td style="border:1px solid #f00; padding:6px; text-align:right">Build Labor (not taxed)</td><td style="border:1px solid #f00; padding:6px; text-align:right">$${laborRaw.toFixed(2)}</td></tr>
                <tr><td style="border:1px solid #f00; padding:6px; text-align:right; font-weight:600">Subtotal (before tax)</td><td style="border:1px solid #f00; padding:6px; text-align:right; font-weight:600">$${subtotalBeforeTax.toFixed(2)}</td></tr>
                <tr><td style="border:1px solid #f00; padding:6px; text-align:right">Tax on Parts (${(TAX_RATE*100).toFixed(0)}%)</td><td style="border:1px solid #f00; padding:6px; text-align:right">$${taxAmount.toFixed(2)}</td></tr>
                <tr><td style="border:1px solid #f00; padding:6px; text-align:right; font-weight:700">Total (after tax)</td><td style="border:1px solid #f00; padding:6px; text-align:right; font-weight:700">$${totalAfterTax.toFixed(2)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>`;

      // Final page: Client notes + approval checklist + terms + optional signature/date + download button
      const checklistHtml = (parts || []).map((p, i) => {
        const line = `<b>${esc(p.label || '')}</b>${p.desc ? ` - ${esc(p.desc)}` : ''}`;
        return `
          <label style="display:block; break-inside:avoid; margin:0 0 6px 0; font-size:10.5pt; line-height:1.25">
            <input type="checkbox" class="approve-box" data-approve-index="${i}" style="width:14px; height:14px; vertical-align:middle; margin-right:8px" />
            <span style="vertical-align:middle">${line}</span>
          </label>`;
      }).join('');
      const approvalPage = `
        <div class="print-page" style="width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:11mm">
          <div class="page-inner">
            <div style="font-weight:700; font-size:13pt; margin-bottom:10px; text-align:center">Client Notes & Parts Approval</div>

            <div style="font-weight:700; margin-bottom:6px; font-size:12pt">Client Notes</div>
            <textarea id="clientNotes" placeholder="Notes, requested changes, questions, or preferences..." style="width:100%; min-height:60mm; border:2px solid #f00; border-radius:4px; padding:10px; font: 11pt system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; box-sizing:border-box; resize:vertical"></textarea>

            <div style="font-weight:700; margin-top:14px; margin-bottom:6px; font-size:12pt">Parts Approval Checklist</div>
            <div style="border:2px solid #f00; border-radius:4px; padding:10px">
              <div style="font-size:10.5pt; color:#444; margin-bottom:8px">Check the components you approve. Leave items unchecked if you do not approve them yet or require changes.</div>
              <div style="columns:2; column-gap:16px">${checklistHtml || '<div style="color:#666">No parts listed.</div>'}</div>
            </div>

            <div style="font-weight:700; margin-top:14px; margin-bottom:6px; font-size:12pt">Terms and Conditions</div>
            <div style="border:2px solid #f00; border-radius:4px; padding:12px; font-size:11pt; line-height:1.45">
              <ul style="padding-left:1.1rem; margin:0">
                <li style="margin-bottom:6px"><b>Quote Validity & Availability:</b> Quoted pricing is provided as of the date issued, is subject to parts availability, and is subject to change prior to purchase. Special-order items may require a deposit and may be non-returnable.</li>
                <li style="margin-bottom:6px"><b>Warranty, Exclusions & Limitation of Liability:</b> We provide a 90-day limited warranty covering defects in parts and workmanship under normal use. At our discretion, warranty remedies may include repair, replacement with an equivalent part, or refund. This warranty does not cover physical/impact damage, liquid exposure, cosmetic wear, loss or theft, abuse or neglect, unauthorized repairs/modifications, or damage caused by third-party accessories. Damage or conditions outside warranty may result in additional diagnostic and/or repair charges, subject to client approval. To the maximum extent permitted by law, our total liability is limited to the amount paid for the applicable device or service, and we are not liable for incidental, indirect, special, or consequential damages.</li>
                <li style="margin-bottom:0"><b>Data & Software:</b> The client is responsible for backing up all data prior to service. Service may require software updates, configuration changes, operating system reinstall, and/or factory reset, which may result in partial or total data loss. We do not guarantee data retention or recovery and are not responsible for data loss. The client is responsible for software licensing, activation, account credentials, and access to third-party services.</li>
              </ul>
            </div>

            <div id="sigSection" style="display:flex; gap:24px; align-items:flex-start; margin-top:16px">
              <div style="flex:1">
                <div style="font-weight:700; margin-bottom:6px; font-size:12pt">Optional Signature</div>
                <div style="border:2px solid #f00; border-radius:4px; padding:10px">
                  <canvas id="sigPad" style="width:100%; height:96px; border:1px solid #000; border-radius:4px; background:#fff"></canvas>
                  <div id="typedSigBox" style="display:none; width:100%; height:96px; border:1px solid #000; border-radius:4px; background:#fff; box-sizing:border-box; align-items:center; justify-content:center; font-family:'Alex Brush','Segoe Script','Edwardian Script ITC','Brush Script MT','Lucida Handwriting',cursive; font-size:40px; font-style:normal; line-height:1; letter-spacing:0.2px; text-align:center; padding:6px"></div>
                  <div class="sig-actions no-print" style="display:flex; gap:8px; align-items:center; margin-top:8px">
                    <button id="sigToggle" type="button" style="padding:6px 10px; border:1px solid #000; border-radius:4px; background:#efefef; font-weight:600">Type Instead</button>
                    <input id="sigName" type="text" placeholder="Type full name (optional)" style="flex:1; border:1px solid #000; border-radius:4px; padding:6px 8px; font: 11pt system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; display:none" />
                    <button id="sigApply" type="button" style="padding:6px 10px; border:1px solid #000; border-radius:4px; background:#efefef; font-weight:600">Apply</button>
                    <button id="sigClear" type="button" style="padding:6px 10px; border:1px solid #000; border-radius:4px; background:#efefef">Clear</button>
                  </div>
                </div>
              </div>
              <div style="width:220px">
                <div style="font-weight:700; margin-bottom:6px; font-size:12pt">Date</div>
                <div id="dateBox" style="border:2px solid #f00; border-radius:4px; min-height:96px; padding:10px; box-sizing:border-box"></div>
              </div>
            </div>

            <div class="no-print" style="display:flex; justify-content:center; margin-top:14px">
              <button id="finalize" type="button" style="padding:10px 16px; border:2px solid #000; border-radius:6px; background:#39FF14; color:#000; font-weight:800">Preview / Download</button>
            </div>
            <div class="no-print" style="text-align:center; margin-top:6px; color:#333; font-size:10.5pt">Tip: Signature is optional. Use "Preview / Download" to print or save as PDF.</div>
          </div>
        </div>`;

      const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Custom Build Quote</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link href="https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap" rel="stylesheet" />
        <style>
          @media print { @page { size:A4; margin:12mm; } .print-page { page-break-after: always; page-break-inside: avoid; break-inside: avoid; } .print-page:last-of-type { page-break-after: auto; } .no-print { display:none !important; } }
          html,body { margin:0; padding:0; background:#fff; color:#000; font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; }
          /* Mobile drawing reliability */
          #sigPad { touch-action: none; -webkit-user-select: none; user-select: none; }
        </style>
        <script>
          try { window.__GB_CUSTOM_PRINT__ = true; console.log('[GB POS] Custom Build Print active'); } catch(e) {}
        </script>
        <script>
          (function(){
            function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
            ready(function(){
              // Minimal signature pad (optional)
              var canvas = document.getElementById('sigPad');
              var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
              var typedBox = document.getElementById('typedSigBox');
              var sigToggle = document.getElementById('sigToggle');
              var sigInput = document.getElementById('sigName');
              var sigApply = document.getElementById('sigApply');
              var sigClear = document.getElementById('sigClear');
              var dateBox = document.getElementById('dateBox');
              var finalizeBtn = document.getElementById('finalize');
              var drawing=false, last=[0,0], dirty=false;
              var typeMode=false;

              function setMode(isType){
                typeMode = !!isType;
                try {
                  if (canvas && canvas.style) canvas.style.display = typeMode ? 'none' : 'block';
                  if (typedBox && typedBox.style) typedBox.style.display = typeMode ? 'flex' : 'none';
                  if (sigInput && sigInput.style) sigInput.style.display = typeMode ? 'block' : 'none';
                  if (sigToggle) sigToggle.textContent = typeMode ? 'Write Instead' : 'Type Instead';
                } catch(_) {}

                // If switching back to draw mode, the canvas may have been hidden
                // (0x0 rect) - re-measure after layout.
                if (!typeMode) {
                  try { setTimeout(resize, 0); } catch(_) {}
                }
              }

              function resize(){
                if(!canvas || !ctx) return;
                var r = canvas.getBoundingClientRect();
                var parentW = 0;
                try { parentW = canvas.parentElement ? canvas.parentElement.getBoundingClientRect().width : 0; } catch(_) { parentW = 0; }
                var dpr = (window.devicePixelRatio || 1);
                var cssW = r.width || parentW || 600;
                var cssH = r.height || 96;
                canvas.width = Math.max(1, Math.floor(cssW * dpr));
                canvas.height = Math.max(1, Math.floor(cssH * dpr));
                ctx.setTransform(1,0,0,1,0,0);
                ctx.scale(dpr, dpr);
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.strokeStyle = '#000000';
              }
              function pos(e){ if(!canvas) return [0,0]; var r=canvas.getBoundingClientRect(); var pt=(e.touches? e.touches[0] : e); return [pt.clientX - r.left, pt.clientY - r.top]; }
              function start(e){ if(!ctx || typeMode) return; drawing=true; last=pos(e); try{ e.preventDefault(); }catch(_){} }
              function move(e){ if(!drawing || !ctx || typeMode) return; var p=pos(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last=p; dirty=true; try{ e.preventDefault(); }catch(_){} }
              function end(){ drawing=false; }
              function setDate(){
                if(!dateBox) return;
                var now=new Date();
                var pad=function(n){ return String(n).padStart(2,'0'); };
                var mm=pad(now.getMonth()+1), dd=pad(now.getDate()), yy=String(now.getFullYear());
                dateBox.textContent = mm + '/' + dd + '/' + yy;
              }
              function applyTypedSignature(name){
                if(!typedBox) return;
                typedBox.textContent = name;
                setDate();
              }

              if(canvas && ctx){
                window.addEventListener('resize', resize, { passive: true });
                resize();
                try { canvas.style.touchAction = 'none'; } catch(_){}
                canvas.addEventListener('pointerdown', function(e){ start(e); try{ if (typeof canvas.setPointerCapture==='function') canvas.setPointerCapture(e.pointerId); }catch(_){} }, { passive:false });
                canvas.addEventListener('pointermove', move, { passive:false });
                window.addEventListener('pointerup', function(){ end(); });
                window.addEventListener('pointercancel', function(){ end(); });

                // Fallbacks for environments where Pointer Events are flaky
                canvas.addEventListener('mousedown', function(e){ start(e); }, false);
                canvas.addEventListener('mousemove', function(e){ move(e); }, false);
                window.addEventListener('mouseup', function(){ end(); }, false);
                canvas.addEventListener('touchstart', function(e){ start(e); }, { passive:false });
                canvas.addEventListener('touchmove', function(e){ move(e); }, { passive:false });
                window.addEventListener('touchend', function(){ end(); }, false);
                window.addEventListener('touchcancel', function(){ end(); }, false);
                window.addEventListener('pointercancel', function(){ end(); }, false);
              }

              // Default to draw mode
              setMode(false);

              // Live preview typed signature into the signature box
              if (sigInput) sigInput.addEventListener('input', function(){
                try {
                  if (!typeMode) return;
                  var name = (sigInput && sigInput.value ? sigInput.value : '').trim();
                  if (typedBox) typedBox.textContent = name;
                } catch(_) {}
              });

              if(sigToggle) sigToggle.addEventListener('click', function(e){
                try{ e.preventDefault(); }catch(_){}
                setMode(!typeMode);
              });

              if(sigClear) sigClear.addEventListener('click', function(e){
                try{ e.preventDefault(); }catch(_){}
                try {
                  if (canvas && ctx) { ctx.clearRect(0,0,canvas.width,canvas.height); resize(); }
                } catch(_){}
                try { if (typedBox) typedBox.textContent = ''; } catch(_){}
                try { if (sigInput) sigInput.value = ''; } catch(_){}
                dirty=false;
                try { if(dateBox) dateBox.textContent=''; }catch(_){}
              });

              if(sigApply) sigApply.addEventListener('click', function(e){
                try{ e.preventDefault(); }catch(_){}
                // Apply works for both draw and type. Always sets date.
                if (typeMode) {
                  var name = (sigInput && sigInput.value ? sigInput.value : '').trim();
                  if(!name) return;
                  applyTypedSignature(name);
                } else {
                  // Draw mode: don't modify signature; simply lock in the date.
                  setDate();
                }
              });

              // Preview/Download (print dialog). Signature is optional.
              if(finalizeBtn) finalizeBtn.addEventListener('click', function(){
                try {
                  // If user drew or typed but didn't hit Apply, set a date anyway.
                  if ((dirty || typeMode) && (!dateBox || !dateBox.textContent)) { try{ setDate(); }catch(_){} }
                } catch(_) {}
                try { window.print(); } catch(_) {}
              });
            });
          })();
        </script>
      </head>
      <body>
        ${partPagesHtml}
        ${summaryPage}
        ${approvalPage}
      </body>
      </html>`;
      // Debug: attempt to save generated HTML into the app DB for inspection
      try {
        const api = (window as any).api;
        if (api && typeof api.dbAdd === 'function') {
          try { api.dbAdd('quoteFiles', { createdAt: new Date().toISOString(), title: 'debug-interactive-print-html', customerName: cust || null, html: html }); } catch (e) { /* ignore */ }
        }
      } catch {}
      return html;
    }
    pages.push(`
      <div class=\"print-page\" style=\"width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:12mm\">
        <div class=\"page-inner\">
          <div style=\"display:flex; gap:12px; align-items:flex-start; margin-bottom:8px\">
            <img src=\"${logoDataUrl || publicAsset('logo-spin.gif')}\" alt=\"GadgetBoy\" style=\"height:35mm; width:auto\" />
            <div style=\"line-height:1.2; flex:1\">
              <div style=\"font-size:20pt; font-weight:700; letter-spacing:0.2px\">Gadgetboy Quote</div>
              <div style=\"font-size:13pt; font-weight:700\">GADGETBOY Repair & Retail</div>
              <div style=\"font-size:12pt\">2822 Devine Street, Columbia, SC 29205</div>
              <div style=\"font-size:12pt\">(803) 708-0101 | gadgetboysc@gmail.com</div>
              <div style=\"margin-top:8px; font-size:12pt\"><b>Customer:</b> ${esc(cust || '-')} | <b>Phone:</b> ${esc(phone)}</div>
              <div style=\"font-size:12pt; color:#666\">Generated: ${esc(nowDate)}</div>
            </div>
          </div>
          ${first ? devicePageInteractive(first, firstTitle, false) : ''}
        </div>
      </div>`);

    // Additional device pages
    sales.items.slice(1).forEach((item, idx) => {
      const model = String(((item.model ?? (item as any).dynamic?.model) || '')).trim();
      const title = model ? [item.brand, model].filter(Boolean).join(' ').trim() : `Device ${idx + 2}`;
      pages.push(devicePageInteractive(item, title, true));
    });

    // Append final page for all non-custom device quotes
    pages.push(finalPageInteractive());

    return `<!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <title>Quote - ${esc(cust || 'Customer')} - ${stampTitle}</title>
      <style>
        @media print {
          @page { size: A4; margin: 12mm; }
          .print-page { page-break-after: always; page-break-inside: avoid; break-inside: avoid; }
          .print-page:last-of-type { page-break-after: auto; }
          .no-print { display:none !important; }
          html, body { background: #ffffff !important; color: #000000 !important; }
        }
        html, body { margin: 0; padding: 0; background: #1f2937; color: #e5e7eb; font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; -webkit-text-size-adjust: 100%; }
        #mobileHelp { max-width: 920px; margin: 12px auto; padding: 12px; border-radius: 12px; background: #111827; border: 1px solid #374151; color: #e5e7eb; font-size: 11.5pt; line-height: 1.35; }
        #mobileHelp b { color: #ffffff; }
        @media (min-width: 900px) { #mobileHelp { display:none; } }
        /* Mobile drawing reliability */
        #sigPad { touch-action: none; -webkit-user-select: none; user-select: none; }
      </style>
    </head>
    <body>
      <noscript>
        <div style="max-width:920px; margin:12px auto; padding:12px; border-radius:10px; background:#111827; border:1px solid #374151; color:#e5e7eb; font-size:12pt">
          This quote requires JavaScript for signature + PDF export. If you opened it inside a mail-app preview, tap "Open in Browser" (Safari/Chrome), then try again.
        </div>
      </noscript>
      <div id="mobileHelp" class="no-print">
        <b>On mobile:</b> If the signature box doesn't let you draw, tap "Open in Browser" (Safari/Chrome). After you sign, tap <b>Finalize</b>, then use <b>Share PDF</b> to send it back to <b>gadgetboysc@gmail.com</b>.
      </div>
      ${pages.join('\n')}
      <script>
      (function(){
        // Exact single-canvas signature logic (preview parity)
        const canvas = document.getElementById('sigPad');
        const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
        const sigInput = document.getElementById('sigName');
        const sigApply = document.getElementById('sigApply');
        const sigClear = document.getElementById('sigClear');
        const dateBox = document.getElementById('dateBox');
        const finalizeBtn = document.getElementById('finalize');
        // Injected context for recording completed quote in-app
        const CUSTOMER_NAME = ${JSON.stringify(cust)};
        const CUSTOMER_PHONE = ${JSON.stringify(phone)};
        const ITEMS_COUNT = ${JSON.stringify((sales.items || []).length)};
  const STAMP_TITLE = ${JSON.stringify(stampTitle)};
  const STAMP_SHORT = ${JSON.stringify(stampShort)};

        function resize(){
          if (!canvas || !ctx) return;
          const r = canvas.getBoundingClientRect();
          const dpr = (window.devicePixelRatio || 1);
          // On some mobile viewers the first layout pass reports width/height as 0.
          // Fall back to parent width and a fixed height so drawing/typed signature still works.
          let parentW = 0;
          try { parentW = canvas.parentElement ? canvas.parentElement.getBoundingClientRect().width : 0; } catch { parentW = 0; }
          const cssW = (r && r.width >= 2) ? r.width : (parentW >= 2 ? parentW : 600);
          const cssH = (r && r.height >= 2) ? r.height : 96;
          canvas.width = Math.max(1, Math.floor(cssW * dpr));
          canvas.height = Math.max(1, Math.floor(cssH * dpr));
          ctx.setTransform(1,0,0,1,0,0);
          ctx.scale(dpr, dpr);
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#000000';
          try { if (canvas.style) canvas.style.touchAction = 'none'; } catch {}
        }

        let drawing=false, last=[0,0], dirty=false, typed=false;
        function pos(e){
          if (!canvas) return [0,0];
          const r=canvas.getBoundingClientRect();
          const touch = (e && e.touches && e.touches.length) ? e.touches[0]
                       : (e && e.changedTouches && e.changedTouches.length) ? e.changedTouches[0]
                       : null;
          const pt = touch || e || { clientX: 0, clientY: 0 };
          const x = (pt.clientX || 0) - r.left;
          const y = (pt.clientY || 0) - r.top;
          return [x,y];
        }
        function start(e){
          if (!ctx || typed) return;
          try { if (canvas && (canvas.width <= 2 || canvas.height <= 2)) resize(); } catch {}
          drawing=true;
          last=pos(e);
          try{ e.preventDefault(); }catch{}
        }
        function move(e){ if(!drawing||!ctx||typed) return; const p=pos(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last=p; dirty=true; try{ e.preventDefault(); }catch{} }
        function end(){ drawing=false; }

        if (canvas && ctx) {
          window.addEventListener('resize', resize, { passive: true });
          resize();
          // Mobile pinch-zoom doesn't always trigger 'resize'; observe layout changes.
          try {
            if (window.ResizeObserver && canvas.parentElement) {
              const ro = new ResizeObserver(function(){ try { resize(); } catch {} });
              ro.observe(canvas.parentElement);
            }
          } catch {}
          try { window.addEventListener('orientationchange', function(){ setTimeout(function(){ try{ resize(); }catch{} }, 60); }, { passive: true }); } catch {}
          try { setTimeout(function(){ try { resize(); } catch {} }, 80); } catch {}
          try { canvas.style.touchAction = 'none'; } catch {}
          canvas.addEventListener('pointerdown', function(e){ try{ start(e); if (typeof canvas.setPointerCapture==='function') canvas.setPointerCapture(e.pointerId); } catch{} }, { passive: false });
          canvas.addEventListener('pointermove', move, { passive: false });
          window.addEventListener('pointerup', function(e){ try{ end(); if (typeof canvas.releasePointerCapture==='function') canvas.releasePointerCapture(e.pointerId); } catch{} });
          window.addEventListener('pointercancel', function(){ try{ end(); } catch{} });
          canvas.addEventListener('mousedown', start);
          canvas.addEventListener('mousemove', move);
          window.addEventListener('mouseup', end);
          canvas.addEventListener('touchstart', start, {passive:false});
          canvas.addEventListener('touchmove', move, {passive:false});
          window.addEventListener('touchend', end);
          window.addEventListener('touchcancel', end);
          canvas.addEventListener('mouseleave', end);
        }

        if (sigClear && canvas && ctx) sigClear.addEventListener('click', function(){ try{ ctx.clearRect(0,0,canvas.width,canvas.height); }catch{} resize(); dirty=false; typed=false; try{ if (sigInput) sigInput.removeAttribute('disabled'); if (sigApply) sigApply.removeAttribute('disabled'); }catch{} });

        function placeTypedSignature(name){
          if (!canvas || !ctx) return;
          try { resize(); } catch {}
          ctx.clearRect(0,0,canvas.width,canvas.height);
          const dpr=(window.devicePixelRatio||1);
          const cssH = canvas.height / dpr;
          const size = Math.floor(Math.max(20, cssH * 0.5));
          ctx.fillStyle='#000';
          ctx.textAlign='center';
          ctx.textBaseline='middle';
          ctx.font = String(size) + 'px "Alex Brush", "Segoe Script", "Edwardian Script ITC", "Brush Script MT", "Lucida Handwriting", cursive';
          const cx=(canvas.width/dpr)/2;
          const cy=(canvas.height/dpr)/2;
          ctx.fillText(name, cx, cy);
          dirty=true;
          typed=true;
        }

        if (sigApply && sigInput) sigApply.addEventListener('click', function(e){ try{ e.preventDefault(); }catch{} const name = (sigInput instanceof HTMLInputElement ? sigInput.value : '').trim(); if (!name) { try{ alert('Please enter your full name to sign.'); }catch{} return; } placeTypedSignature(name); try{ sigInput.setAttribute('disabled',''); }catch{} try{ sigApply.setAttribute('disabled',''); }catch{} });

        if (finalizeBtn) finalizeBtn.addEventListener('click', function(){
          try {
            if (dateBox) { const now=new Date(); const pad=(n)=>String(n).padStart(2,'0'); const mm=pad(now.getMonth()+1), dd=pad(now.getDate()), yy=String(now.getFullYear()).slice(-2); dateBox.innerHTML=''; const d=document.createElement('div'); d.style.padding='8px 0'; d.style.textAlign='center'; d.style.fontWeight='600'; d.textContent='Date Signed: '+mm+'/'+dd+'/'+yy; dateBox.appendChild(d); try { const lbl=dateBox.nextElementSibling; if(lbl && lbl.textContent && lbl.textContent.trim().toLowerCase()==='date'){ lbl.parentElement.removeChild(lbl); } } catch{} }
            if (canvas && ctx && dirty) {
              const tmp = document.createElement('canvas'); tmp.width = canvas.width; tmp.height = canvas.height; const tctx = tmp.getContext('2d'); let dataUrl = '';
              if (tctx) { tctx.fillStyle = '#ffffff'; tctx.fillRect(0,0,tmp.width,tmp.height); tctx.drawImage(canvas,0,0); dataUrl = tmp.toDataURL('image/png'); }
              else { dataUrl = canvas.toDataURL('image/png'); }
              const img=document.createElement('img'); img.src=dataUrl; img.style.width='100%'; img.style.height='96px'; img.style.objectFit='contain'; img.style.border='1px solid #000'; img.style.borderRadius='4px';
              if (canvas.parentElement) { canvas.parentElement.replaceChild(img, canvas); }
            }
            try { const actions = document.querySelector('.sig-actions'); if (actions && actions.parentElement) actions.parentElement.removeChild(actions); } catch {}
          } catch(e) {}
          const html='<!doctype html>'+document.documentElement.outerHTML;
          const api = (window).api;
          // Build filename base: Gadgetboy-Quote-CLIENTNAME (sanitized)
          const sanitize = (s) => String(s||'').toString().replace(/[^a-z0-9\-\_\+]+/gi,'-').replace(/-{2,}/g,'-').replace(/^-+|-+$/g,'');
          const base = 'Gadgetboy-Quote-' + sanitize(CUSTOMER_NAME || 'Customer');
          if (api && typeof api.exportPdf==='function') {
            api.exportPdf(html, base).then((res)=>{ 
              if(res && res.ok && res.filePath && typeof api.dbAdd==='function'){
                try { api.dbAdd('quoteFiles', { createdAt: new Date().toISOString(), customerName: CUSTOMER_NAME, customerPhone: CUSTOMER_PHONE, filePath: res.filePath, title: document.title, itemsCount: ITEMS_COUNT }); } catch {}
              } else if(!res || !res.ok) { try{ alert('Could not save PDF'); }catch{} }
            });
          } else {
            // Browser: generate a PDF client-side (no print dialog) using html2canvas + jsPDF
            const ensureLib = (src) => new Promise((resolve, reject)=>{ const s=document.createElement('script'); s.src=src; s.onload=()=>resolve(true); s.onerror=(e)=>reject(e); document.head.appendChild(s); });
            const ensureLibAny = async (sources) => {
              let lastErr = null;
              for (let i = 0; i < sources.length; i++) {
                try { await ensureLib(sources[i]); return true; } catch (e) { lastErr = e; }
              }
              throw lastErr || new Error('Failed to load scripts');
            };
            const ensurePdfLibs = async () => {
              const needH2C = !(window).html2canvas;
              const needJspdf = !((window).jspdf && (window).jspdf.jsPDF);
              const tasks = [];
              if (needH2C) tasks.push(ensureLibAny([
                'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
                'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
              ]));
              if (needJspdf) tasks.push(ensureLibAny([
                'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
                'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
              ]));
              if (tasks.length) await Promise.all(tasks);
            };
            const SHOP_EMAIL = 'gadgetboysc@gmail.com';

            const showPdfActions = (blob, filename) => {
              try {
                const wrap = document.createElement('div');
                wrap.className = 'no-print';
                wrap.style.margin = '14px auto 18px auto';
                wrap.style.maxWidth = '920px';
                wrap.style.padding = '12px';
                wrap.style.border = '1px solid #111827';
                wrap.style.borderRadius = '12px';
                wrap.style.background = '#ffffff';
                wrap.style.color = '#000000';
                wrap.style.textAlign = 'center';
                wrap.innerHTML =
                  '<div style="font-weight:800; margin-bottom:6px">PDF Ready</div>' +
                  '<div style="font-size:11.5pt; margin-bottom:10px">On mobile, use Share to send the PDF back to us.</div>';

                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.gap = '8px';
                row.style.justifyContent = 'center';
                row.style.flexWrap = 'wrap';

                const mkBtn = (label) => {
                  const b = document.createElement('button');
                  b.type = 'button';
                  b.textContent = label;
                  b.style.padding = '10px 14px';
                  b.style.borderRadius = '10px';
                  b.style.border = '2px solid #000';
                  b.style.background = '#39FF14';
                  b.style.color = '#000';
                  b.style.fontWeight = '800';
                  b.style.cursor = 'pointer';
                  return b;
                };

                const downloadBtn = mkBtn('Download PDF');
                downloadBtn.addEventListener('click', function(){
                  try {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    // iOS Safari sometimes ignores download; open the PDF in a new tab as fallback.
                    try {
                      const ua = String(navigator && navigator.userAgent ? navigator.userAgent : '');
                      const isIOS = /iP(hone|ad|od)/.test(ua);
                      if (isIOS) { window.open(url, '_blank'); }
                    } catch (e) {}
                    setTimeout(function(){ try { URL.revokeObjectURL(url); } catch {} }, 15000);
                  } catch(e) {}
                });

                const shareBtn = mkBtn('Share PDF');
                shareBtn.addEventListener('click', async function(){
                  try {
                    const f = new File([blob], filename, { type: 'application/pdf' });
                    const canShare = !!(navigator && navigator.share && navigator.canShare && navigator.canShare({ files: [f] }));
                    if (!canShare) { alert('Sharing is not supported in this browser. Use Download PDF instead.'); return; }
                    await navigator.share({
                      files: [f],
                      title: filename,
                      text: 'Please send this PDF to ' + SHOP_EMAIL + '. You can add notes to the email if needed.'
                    });
                  } catch(e) {
                    try { alert('Could not open share sheet. Use Download PDF instead.'); } catch {}
                  }
                });

                const emailBtn = document.createElement('a');
                emailBtn.textContent = 'Open Email (prefilled)';
                emailBtn.href = 'mailto:' + encodeURIComponent(SHOP_EMAIL) +
                  '?subject=' + encodeURIComponent('Signed Gadgetboy Quote') +
                  '&body=' + encodeURIComponent('Hi Gadgetboy,\n\nI signed the quote. I am attaching the PDF from this page.\n\nThanks,\n' + (CUSTOMER_NAME || ''));
                emailBtn.style.display = 'inline-flex';
                emailBtn.style.alignItems = 'center';
                emailBtn.style.justifyContent = 'center';
                emailBtn.style.padding = '10px 14px';
                emailBtn.style.borderRadius = '10px';
                emailBtn.style.border = '2px solid #000';
                emailBtn.style.background = '#111827';
                emailBtn.style.color = '#fff';
                emailBtn.style.fontWeight = '800';
                emailBtn.style.textDecoration = 'none';

                const copyBtn = mkBtn('Copy Email');
                copyBtn.style.background = '#111827';
                copyBtn.style.color = '#ffffff';
                copyBtn.addEventListener('click', async function(){
                  try {
                    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                      await navigator.clipboard.writeText(SHOP_EMAIL);
                      alert('Copied: ' + SHOP_EMAIL);
                      return;
                    }
                  } catch(e) {}
                  try { prompt('Copy this email address:', SHOP_EMAIL); } catch(e) {}
                });

                row.appendChild(shareBtn);
                row.appendChild(downloadBtn);
                row.appendChild(emailBtn);
                row.appendChild(copyBtn);
                wrap.appendChild(row);

                document.body.appendChild(wrap);
              } catch(e) {}
            };

            const toPdf = async () => {
              try {
                await ensurePdfLibs();
                const h2c = (window).html2canvas;
                const jsPDF = (window).jspdf.jsPDF;
                // Force white background and black text for PDF legibility
                const style = document.createElement('style');
                style.setAttribute('data-pdf-style','1');
                style.textContent = 'html, body { background: #ffffff !important; color: #000000 !important; } ' +
                                   '.print-page { background: #ffffff !important; color: #000000 !important; } ' +
                                   '.page-inner { color: #000000 !important; } ' +
                                   '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }';
                document.head.appendChild(style);
                const pages = Array.from(document.querySelectorAll('.print-page'));
                const a4 = { w: 210, h: 297 }; // mm
                const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
                for (let i=0; i<pages.length; i++){
                  const el = pages[i];
                  // Scale canvas to fit A4 at decent resolution
                  const canvas = await h2c(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
                  const img = canvas.toDataURL('image/jpeg', 0.95);
                  const pw = a4.w, ph = a4.h;
                  // Maintain aspect ratio fit
                  const ratio = canvas.width / canvas.height;
                  let w = pw, h = w / ratio; if (h > ph) { h = ph; w = h * ratio; }
                  const x = (pw - w) / 2, y = (ph - h) / 2;
                  if (i>0) pdf.addPage('a4', 'portrait');
                  pdf.addImage(img, 'JPEG', x, y, w, h);
                }
                const filename = base + '-' + STAMP_SHORT + '.pdf';
                const blob = pdf.output('blob');
                // On mobile browsers, pdf.save() often fails. Prefer Share/Download.
                const isTouch = !!(navigator && (navigator.maxTouchPoints || 0) > 0);
                if (blob && (isTouch || (navigator && navigator.share))) {
                  showPdfActions(blob, filename);
                  // Best-effort auto-download for browsers that allow it.
                  try {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(function(){ try { URL.revokeObjectURL(url); } catch {} }, 15000);
                  } catch {}
                } else {
                  pdf.save(filename);
                }
                try { document.head.removeChild(style); } catch {}
              } catch (e) {
                try {
                  const prev = document.querySelector('style[data-pdf-style="1"]');
                  if (prev) prev.parentElement.removeChild(prev);
                } catch {}
                try { alert('Could not generate PDF automatically. Your browser will open the print dialog, choose "Save as PDF".'); } catch {}
                try { window.print(); } catch {}
              }
            };
            toPdf();
          }
        });
      })();
      </script>
    </body>
    </html>`;
  }
        

  // Build interactive HTML but embed the logo as data URL so it renders in the saved file
  async function generateInteractiveSalesHtml(): Promise<string> {
    // Try to fetch the logo from the current app and convert to data URL; fallback to no logo
    try {
  const res = await fetch(publicAsset('logo-spin.gif'));
      if (!res.ok) throw new Error('logo fetch failed');
      const blob = await res.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
      return buildInteractiveSalesHtml(dataUrl);
    } catch {
      return buildInteractiveSalesHtml(undefined);
    }
  }

  // Build a dedicated, print-only HTML document for Sales quotes.
  function buildSalesPrintHtml() {
    const esc = (s: string) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const labels = sales.items.map((it, idx) => {
      const model = String(((it.model ?? (it as any).dynamic?.model) || '')).trim();
      return (model ? [it.brand, model].filter(Boolean).join(' ').trim() : '') || `Item ${idx + 1}`;
    });
    const cust = `${sales.customerName || ''}`.trim();
    const phone = `${sales.customerPhone || ''}`.trim();
    const now = new Date().toLocaleDateString();

    const first = sales.items[0];
    const firstTitleModel = first ? String(((first.model ?? (first as any).dynamic?.model) || '')).trim() : '';
    const firstTitle = firstTitleModel ? [first?.brand, firstTitleModel].filter(Boolean).join(' ').trim() : 'First Device';

    // Custom PC/Build: Full custom print rebuilt from scratch (keep top header on first page)
    if (first && /custom/i.test(String((first as any).deviceType || (first as any).deviceCategory || (first as any).category || ''))) {
      const TAX_RATE = 0.08;
      const dyn: any = first.dynamic || {};
      type Part = { label: string; key: string; desc: string; priceRaw: number; priceMarked: number; image?: string; image2?: string };
      const baseParts: Array<{ key: string; label: string }> = [
        { key: 'case', label: 'Case' },
        { key: 'motherboard', label: 'Motherboard' },
        { key: 'cpu', label: 'Processor' },
        { key: 'cooling', label: 'Cooling' },
        { key: 'ram', label: 'Memory' },
        { key: 'gpu', label: 'Graphics Card' },
        { key: 'storage', label: 'Storage' },
        { key: 'psu', label: 'PSU' },
        { key: 'os', label: 'Operating System' },
      ];
      const parts: Part[] = [];
      const buildDesc2 = (key: string) => {
        const raw = String(dyn[key] || dyn[`${key}Info`] || '').trim();
        const combine = (parts: (string|undefined)[]) => parts.filter(Boolean).map(String).map(s=>s.trim()).filter(Boolean).join(' | ');
        switch (key) {
          case 'cpu':
            return combine([raw, dyn.cpuGen && `Gen ${dyn.cpuGen}`, dyn.cpuCores && `${dyn.cpuCores} cores`, dyn.cpuClock && `${dyn.cpuClock}`]) || raw;
          case 'ram':
            return combine([raw, dyn.ramSize && `${dyn.ramSize}`, dyn.ramSpeed && `${dyn.ramSpeed}`, dyn.ramType && `${dyn.ramType}`]) || raw;
          case 'gpu':
            return combine([raw, dyn.gpuModel || dyn.gpu, dyn.gpuVram && `${dyn.gpuVram}`]) || raw;
          case 'storage':
            return combine([raw, dyn.storageType || dyn.bootDriveType, dyn.storageSize || dyn.bootDriveStorage]) || raw;
          case 'motherboard':
            return combine([raw, dyn.moboChipset && `Chipset: ${dyn.moboChipset}`, dyn.formFactor && `${dyn.formFactor}`]) || raw;
          case 'psu':
            return combine([raw, dyn.psuWatt && `${dyn.psuWatt}W`]) || raw;
          case 'cooling':
            return combine([raw, dyn.coolingType]) || raw;
          case 'case':
            return combine([raw, dyn.caseFormFactor && `${dyn.caseFormFactor}`]) || raw;
          case 'os':
            return raw || dyn.os || '';
          default:
            return raw;
        }
      };
      baseParts.forEach(p => {
        const desc = buildDesc2(p.key);
        const priceRaw = Number(dyn[`${p.key}Price`] || 0) || 0;
        const imagesArr = Array.isArray(dyn[`${p.key}Images`]) ? dyn[`${p.key}Images`] : [];
        let image: string | undefined = dyn[`${p.key}Image`] ? String(dyn[`${p.key}Image`]) : undefined;
        let image2: string | undefined = dyn[`${p.key}Image2`] ? String(dyn[`${p.key}Image2`]) : undefined;
        if (!image && imagesArr[0]) image = String(imagesArr[0]);
        if (!image2 && imagesArr[1]) image2 = String(imagesArr[1]);
        if (!desc && !priceRaw && !image && !image2) return;
        parts.push({ label: p.label, key: p.key, desc, priceRaw, priceMarked: priceRaw * 1.05, image, image2 });
      });
      const extras = Array.isArray(dyn.extraParts) ? dyn.extraParts : [];
      extras.forEach((e: any) => {
        const label = String(e?.name || 'Extra');
        const desc = String(e?.desc || '').trim();
        const priceRaw = Number(e?.price || 0) || 0;
        const imagesArr = Array.isArray(e?.images) ? e.images : [];
        let image: string | undefined = e?.image ? String(e.image) : undefined;
        let image2: string | undefined = e?.image2 ? String(e.image2) : undefined;
        if (!image && imagesArr[0]) image = String(imagesArr[0]);
        if (!image2 && imagesArr[1]) image2 = String(imagesArr[1]);
        if (!label && !desc && !priceRaw && !image && !image2) return;
        parts.push({ label, key: `extra-${label}`, desc, priceRaw, priceMarked: priceRaw * 1.05, image, image2 });
      });
      const laborRaw = Number(dyn.buildLabor || 0) || 0;

      const chunk = <T,>(arr: T[], size: number) => { const out: T[][] = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };

      const partBox = (p: Part) => {
        if (String(p.key).toLowerCase() === 'os' || String(p.label).toLowerCase().includes('operating system')) {
          return `
        <div style=\"display:grid; grid-template-columns:42mm 1fr; column-gap:10px; align-items:stretch; margin-bottom:8px\">
          <div></div>
          <div style=\"border:2px solid #f00; border-radius:6px; padding:8px; min-height:22mm\">
            <div style=\"font-weight:700; margin-bottom:2px\">${esc(p.label)}</div>
            <div style=\"font-size:10.5pt; line-height:1.35\">${esc(p.desc || '-') }</div>
          </div>
        </div>`;
        }
        const imgs = [p.image, p.image2].filter(Boolean) as string[];
        const leftCol = imgs.length >= 2
          ? `
            <div style=\"width:56mm; height:44mm; display:flex; flex-direction:column; gap:4px; background:#fff; border:1px solid #e5e7eb; border-radius:4px; padding:4px; box-sizing:border-box\">
              <div style=\"flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden\"><img src=\"${imgs[0]}\" style=\"max-width:100%; max-height:100%; object-fit:contain; display:block\" /></div>
              <div style=\"flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden\"><img src=\"${imgs[1]}\" style=\"max-width:100%; max-height:100%; object-fit:contain; display:block\" /></div>
            </div>`
          : (imgs.length === 1
            ? `<div style=\"width:56mm; height:44mm; display:flex; align-items:center; justify-content:center; background:#fff; border:1px solid #e5e7eb; border-radius:4px; overflow:hidden\"><img src=\"${imgs[0]}\" style=\"max-width:100%; max-height:100%; object-fit:contain; display:block\" /></div>`
            : `<div style=\"width:56mm; height:44mm; display:flex; align-items:center; justify-content:center; background:#fff; border:1px solid #e5e7eb; border-radius:4px; overflow:hidden\"><div style=\\\"font-size:9pt; color:#888\\\">No Image</div></div>`);
        return `
        <div style=\"display:grid; grid-template-columns:56mm 1fr; column-gap:10px; align-items:stretch; margin-bottom:8px\">
          ${leftCol}
          <div style=\"border:2px solid #f00; border-radius:6px; padding:8px; min-height:18mm; display:flex; align-items:center; justify-content:center; text-align:center; flex-direction:column\">
            <div style=\"font-weight:700; margin-bottom:4px\">${esc(p.label)}</div>
            <div style=\"font-size:10.5pt; line-height:1.35; margin-bottom:4px\">${esc(p.desc || '-') }</div>
            <div style=\"font-weight:700; font-size:11pt\">$${(p.priceMarked || 0).toFixed(2)}</div>
          </div>
        </div>`;
      };

      const firstPageParts = parts.slice(0, 3);
      const remainingParts = parts.slice(3);
      const remainingChunks = chunk(remainingParts, 4);

      // Simplified non-custom assembly: Page 1 = header + first item,
      // each subsequent page = single item, final page = notes/terms/signature.
      const firstPage = `
        <div class="print-page" style="width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:12mm">
          <div class="page-inner">
            <div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:8px">
              <img src={publicAsset('logo-spin.gif')} alt="GadgetBoy" style={{ height: '35mm', width: 'auto' }} />
              <div style="line-height:1.2; flex:1">
                <div style="font-size:20pt; font-weight:700; letter-spacing:0.2px">Gadgetboy Quote</div>
                <div style="font-size:13pt; font-weight:700">GADGETBOY Repair & Retail</div>
                <div style="font-size:12pt">2822 Devine Street, Columbia, SC 29205</div>
                <div style="font-size:12pt">(803) 708-0101 | gadgetboysc@gmail.com</div>
                <div style="margin-top:8px; font-size:12pt"><b>Customer:</b> ${esc(cust || '-')} | <b>Phone:</b> ${esc(phone)}</div>
                <div style="font-size:12pt; color:#666">Generated: ${esc(now)}</div>
              </div>
            </div>
            ${first ? devicePage(first, firstTitle, false) : ''}
          </div>
        </div>`;

      

      // Build pages deterministically: one page per additional item
      const pagesArr: string[] = [];
      pagesArr.push(firstPage);
      sales.items.slice(1).forEach((item, idx) => {
        const model = String(((item.model ?? (item as any).dynamic?.model) || '')).trim();
        const title = model ? [item.brand, model].filter(Boolean).join(' ').trim() : `Device ${idx + 2}`;
        pagesArr.push(devicePage(item, title, true));
      });

      // Keep Custom PC/Build pipeline as-is (no shared final page appended here).

      const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Gadgetboy Quote</title>
        <base href="${(typeof window !== 'undefined' && (window as any).location) ? ((window as any).location.origin + '/') : '/'}">
        <style>
          @media print {
            @page { size: A4; margin: 12mm; }
            .print-page { page-break-after: always; page-break-inside: avoid; break-inside: avoid; }
            .print-page:last-of-type { page-break-after: auto; }
          }
          html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; }
          .page-inner { transform-origin: top center; }
        </style>
        </head>
      <body>
        ${pagesArr.join('\n')}
      </body>
      </html>`;
      // Debug: attempt to save generated print HTML into the app DB for inspection
      try {
        const api = (window as any).api;
        if (api && typeof api.dbAdd === 'function') {
          try { api.dbAdd('quoteFiles', { createdAt: new Date().toISOString(), title: 'debug-print-html', customerName: cust || null, html: html }); } catch (e) { /* ignore */ }
        }
      } catch {}
      return html;
    }

    const finalPagePrint = () => {
      const checklistHtml = (labels || [])
        .map((label, i) => {
          const safe = esc(label);
          return `<div style="display:flex; align-items:flex-start; gap:8px; margin:0 0 6px 0"><div style="width:14px; height:14px; border:1px solid #000; border-radius:2px; margin-top:2px"></div> <span>${safe || `Item ${i + 1}`}</span></div>`;
        })
        .join('');

      return `
        <div class="print-page" style="width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:12mm">
          <div class="page-inner" style="display:flex; flex-direction:column; min-height:273mm; padding-top:8px">
            <div style="font-weight:700; margin-bottom:6px; font-size:12pt">Notes</div>
            <div style="width:100%; height:52mm; border:2px solid #f00; border-radius:4px; padding:10px; box-sizing:border-box"></div>

            <div style="font-weight:700; margin-top:14px; margin-bottom:6px; font-size:12pt">Checklist</div>
            <div style="border:2px solid #f00; border-radius:4px; padding:10px; font-size:11pt; line-height:1.35">
              <div style="columns:2; column-gap:16px">${checklistHtml || '<div style="color:#666">No items listed.</div>'}</div>
            </div>

            <div style="margin-top:auto">
              <div style="font-weight:700; margin-top:14px; margin-bottom:6px; font-size:12pt">Terms and Conditions</div>
              <div style="border:2px solid #f00; border-radius:4px; padding:12px; font-size:11pt; line-height:1.45">
                <ul style="padding-left:1.1rem; margin:0">
                  <li style="margin-bottom:6px"><b>Quote Validity & Availability:</b> Pricing is provided as of the date issued and may change prior to purchase.</li>
                  <li style="margin-bottom:6px"><b>Warranty & Exclusions:</b> 90-day limited hardware warranty for defects under normal use; exclusions include physical/impact damage, liquid exposure, unauthorized repairs/modifications, abuse/neglect, loss/theft, and third-party accessories.</li>
                  <li style="margin-bottom:6px"><b>Data & Software:</b> Client is responsible for backups and licensing. Service may require updates/reinstall/reset; we are not responsible for data loss.</li>
                  <li style="margin-bottom:6px"><b>Deposits & Special Orders:</b> Deposits may be required to order parts/products. Special-order items may be non-returnable and subject to supplier restocking policies.</li>
                  <li style="margin-bottom:6px"><b>Returns & Cancellations:</b> Returns/cancellations are subject to manufacturer/vendor policies and may incur restocking/processing fees. Labor and time spent is non-refundable.</li>
                  <li style="margin-bottom:6px"><b>Taxes & Fees:</b> Sales tax and applicable fees may apply at checkout; printed totals may be shown before tax.</li>
                  <li style="margin-bottom:0"><b>Limitation of Liability:</b> Liability is limited to amounts paid; incidental or consequential damages are excluded where permitted by law.</li>
                </ul>
              </div>

              <div style="margin-top:16px">
                <div id="sigSection" style="display:flex; gap:24px; align-items:flex-start; break-inside: avoid; page-break-inside: avoid">
                  <div style="flex:1">
                    <div style="display:flex; align-items:center; gap:10px">
                      <div style="font-weight:400; font-size:12pt; white-space:nowrap">Signature</div>
                      <div style="border-bottom:2px solid #000; height:24px; flex:1"></div>
                    </div>
                  </div>
                  <div style="width:220px">
                    <div style="display:flex; align-items:center; gap:10px">
                      <div style="font-weight:400; font-size:12pt; white-space:nowrap">Date</div>
                      <div id="dateBox" style="border-bottom:2px solid #000; height:24px; flex:1"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    };

    const specRows = (item: SaleItem) => {
      const rows: Array<[string, string]> = [];
      if (item.deviceType) rows.push(['Device Type', item.deviceType]);
      const appleFamily = (item.dynamic || ({} as any)).device as string | undefined;
      if (appleFamily) rows.push(['Apple Family', appleFamily]);
      if (item.model) rows.push(['Model', item.model]);
      if (item.condition) rows.push(['Condition', item.condition]);
      if (item.accessories) rows.push(['Accessories', item.accessories]);
      Object.entries(item.dynamic || {}).forEach(([k, v]) => {
        if (k === 'device') return;
        rows.push([k, String(v ?? '')]);
      });
      const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').split(' ').filter(Boolean).map((w) => {
        const up = w.toUpperCase();
        if (w.length <= 3 && w === up) return up;
        return w.charAt(0).toUpperCase() + w.slice(1);
      }).join(' ');
      return rows.map(([k, v]) => `<tr><td style="border:1px solid #f00; padding:6px 14px; font-weight:600; white-space:nowrap">${esc(titleCase(k))}</td><td style="border:1px solid #f00; padding:6px 14px">${esc(v)}</td></tr>`).join('');
    };

    function devicePage(item: SaleItem, title: string, standalone: boolean = true) {
      const base = parseFloat((item.price || '').toString());
      const shown = Number.isFinite(base) && base > 0 ? (base * 1.15) : null;
      const hasSpecs = !!(
        (item.dynamic && Object.keys(item.dynamic || {}).length > 0) ||
        item.deviceType || (item.dynamic && (item.dynamic as any).device) || item.model || item.condition || item.accessories
      );
      const images = (item.images || []).slice(0, 3);
  // Custom Build special layout
    if (item.deviceType === 'Custom Build') {
      // Align with Custom Build UI: use the same core parts
      const parts: Array<{ key: string; label: string }> = [
        { key: 'case', label: 'Case' },
        { key: 'motherboard', label: 'Motherboard' },
        { key: 'cpu', label: 'Processor' },
        { key: 'ram', label: 'Memory' },
        { key: 'gpu', label: 'Graphics Card' },
        { key: 'psu', label: 'PSU' },
      ];

      type PartLine = { label: string; val: string; img?: string; price: number };
      const partLines: PartLine[] = parts.map((p) => {
        const val = String((item.dynamic || ({} as any))[p.key] || '').trim();
        const img = String((item.dynamic || ({} as any))[`${p.key}Image`] || '');
        const raw = Number((item.dynamic || ({} as any))[`${p.key}Price`] || 0) || 0;
        return { label: p.label, val, img: img || undefined, price: raw * 1.05 };
      }).filter((pl) => (pl.val || pl.price || pl.img));

      const extras = Array.isArray((item.dynamic as any)?.extraParts) ? ((item.dynamic as any).extraParts as any[]) : [];
      const extraLines: PartLine[] = extras.map((e: any) => ({
        label: String(e?.name || 'Extra') || 'Extra',
        val: String(e?.desc || ''),
        img: e?.image ? String(e.image) : undefined,
        price: (Number(e?.price || 0) || 0) * 1.05,
      })).filter((pl) => (pl.label || pl.price || pl.img));

      const withImage = [...partLines, ...extraLines].filter((l) => !!l.img);
      const withoutImage = [...partLines, ...extraLines].filter((l) => !l.img);

      const lines = withImage.map((l) => `
          <tr>
            <td style=\"border:1px solid #f00; padding:8px; vertical-align:middle\">
              <div style=\"display:flex; align-items:center; gap:10px\">
                <div style=\"width:40px; height:40px; border:1px solid #e5e7eb; border-radius:4px; overflow:hidden; background:#fff\">${l.img ? `<img src=\"${l.img}\" style=\"width:100%; height:100%; object-fit:cover\"/>` : ''}</div>
                <div><div style=\"font-weight:600\">${esc(l.label)}</div><div>${esc(l.val || '-') }</div></div>
              </div>
            </td>
            <td style=\"border:1px solid #f00; padding:8px; text-align:right; white-space:nowrap\">$${(l.price || 0).toFixed(2)}</td>
          </tr>`).join('');

      const labor = Number((item.dynamic || ({} as any)).buildLabor || 0) || 0;
      const partsSumMain = partLines.reduce((acc, p) => acc + (Number((item.dynamic || ({} as any))[`${p.label.toLowerCase()}Price`] || 0) || 0) * 1.05, 0);
      // Recompute from original dynamic keys to avoid label mismatch
      const partsSumFromKeys = parts.reduce((acc, p) => acc + ((Number((item.dynamic || ({} as any))[`${p.key}Price`] || 0) || 0) * 1.05), 0);
      const partsSumExtras = extras.reduce((acc, e) => acc + ((Number(e?.price || 0) || 0) * 1.05), 0);
      const partsSum = partsSumFromKeys + partsSumExtras;
      const total = partsSum + labor;
      const innerCB = `
        <div class=\"text-base\" style=\"text-align:center; font-weight:600; margin-bottom:8px\">${esc(title || 'Custom Build')}</div>
        ${images.length ? `
          <div style=\"margin-bottom:10px; display:flex; gap:12px; flex-wrap:wrap; justify-content:center; align-items:center\">
            ${images.map((src) => `<img src=\"${src}\" style=\"max-height:55mm; max-width:55mm; object-fit:contain; border:1px solid #e5e7eb; border-radius:4px; padding:2px\" />`).join('')}
          </div>` : ''}
        <div style=\"border:2px solid #f00; border-radius:4px; padding:10px\">
          <div style=\"font-weight:700; margin-bottom:6px; text-align:center\">Build Components</div>
          <table style=\"border-collapse:collapse; width:100%\">
            <thead>
              <tr><th style=\"border:1px solid #f00; padding:6px; text-align:left\">Part</th><th style=\"border:1px solid #f00; padding:6px; text-align:right\">Price</th></tr>
            </thead>
            <tbody>
              ${lines || `<tr><td colspan=2 style='border:1px solid #f00; padding:8px; color:#666'>No image-based parts listed.</td></tr>`}
            </tbody>
            <tfoot>
              <tr><td style=\"border:1px solid #f00; padding:6px; text-align:right\">Build Labor</td><td style=\"border:1px solid #f00; padding:6px; text-align:right; font-weight:600\">$${labor.toFixed(2)}</td></tr>
              <tr><td style=\"border:1px solid #f00; padding:6px; text-align:right; font-weight:700\">Total (before tax)</td><td style=\"border:1px solid #f00; padding:6px; text-align:right; font-weight:700\">$${total.toFixed(2)}</td></tr>
            </tfoot>
          </table>
        </div>
        ${withoutImage.length ? `
        <div style=\"border:2px solid #f00; border-radius:4px; padding:10px; margin-top:10px\">
          <div style=\"font-weight:700; margin-bottom:6px; text-align:center\">Additional Specs (no image)</div>
          <ul style=\"margin:0; padding-left:1rem; line-height:1.4\">
            ${withoutImage.map((l) => `<li><b>${esc(l.label)}:</b> ${esc(l.val || '-')}${Number.isFinite(l.price) ? '' : ''}</li>`).join('')}
          </ul>
        </div>` : ''}`;
      // separate per-part image pages when standalone
      const imageEntries: Array<{ label: string; src: string }> = [
        { key: 'case', label: 'Case' },
        { key: 'motherboard', label: 'Motherboard' },
        { key: 'cpu', label: 'Processor' },
        { key: 'ram', label: 'Memory' },
        { key: 'gpu', label: 'Graphics Card' },
        { key: 'psu', label: 'PSU' },
      ].map((p: any) => {
        const src = String((item.dynamic || ({} as any))[`${p.key}Image`] || '');
        return src ? { label: p.label, src } : null;
      }).filter(Boolean) as any[];
      const extrasImgs = (Array.isArray((item.dynamic as any)?.extraParts) ? (item.dynamic as any).extraParts : []).map((e: any) => {
        const src = String(e?.image || ''); const label = String(e?.name || 'Extra');
        return src ? { label, src } : null;
      }).filter(Boolean) as any[];
      const imagePages = [...imageEntries, ...extrasImgs].map((e) => `
        <div class=\"print-page\" style=\"width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:10mm\">
          <div class=\"page-inner\" style=\"text-align:center\">
            <div style=\"font-weight:700; font-size:14pt; margin-bottom:8px\">${esc(e.label)}</div>
            <img src=\"${e.src}\" style=\"max-width:180mm; max-height:240mm; object-fit:contain; border:1px solid #e5e7eb; border-radius:4px; padding:2px\" />
          </div>
        </div>`).join('');
      return standalone
        ? `<div class=\"print-page\" style=\"width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:10mm\"><div class=\"page-inner\">${innerCB}</div></div>`
        : innerCB;
    }
    const inner = `
          <div class=\"text-base\" style=\"text-align:center; font-weight:600; margin-bottom:8px\">${esc(title)}</div>
          ${images.length ? `
            <div style=\"margin-bottom:10px; display:flex; gap:12px; flex-wrap:wrap; justify-content:center; align-items:center\">
              ${images.map((src) => `<img src=\"${src}\" style=\"max-height:55mm; max-width:55mm; object-fit:contain; border:1px solid #e5e7eb; border-radius:4px; padding:2px\" />`).join('')}
            </div>` : ''}
          ${hasSpecs ? `
            <div style=\"display:grid; grid-template-columns:1fr auto 1fr; align-items:end; column-gap:12px; width:100%\">
              <div style=\"grid-column:2; text-align:center; justify-self:center; margin-left:auto; margin-right:auto\">
                <div style=\"font-size:12pt; border:2px solid #f00; display:inline-block; padding:12px 14px; border-radius:4px\">
                  <div style=\"font-weight:600; margin-bottom:6px; text-align:center\">Specifications</div>
                  <table style=\"border-collapse:collapse; display:inline-table; width:auto; table-layout:auto\"><tbody>
                    ${specRows(item)}
                  </tbody></table>
                </div>
              </div>
              ${shown != null ? `<div style=\"grid-column:3; justify-self:end\">
                <div style=\"display:inline-block; border:1px solid #f00; padding:6px 10px; border-radius:4px; font-size:10pt; white-space:nowrap; font-weight:700\">Total (before tax): $${shown.toFixed(2)}</div>
              </div>` : ``}
            </div>` : (shown != null ? `
            <div style=\"text-align:right; margin-top:8px\">
              <div style=\"display:inline-block; border:1px solid #f00; padding:6px 10px; border-radius:4px; font-size:10pt; white-space:nowrap; font-weight:700\">Total (before tax): $${shown.toFixed(2)}</div>
            </div>
          ` : ``)}
          ${item.prompt && String(item.prompt).trim().length > 0 ? `
            <div style=\"text-align:center; font-size:13pt; line-height:1.45; max-width:180mm; margin:18px auto 0 auto; border:2px solid #f00; border-radius:4px; padding:10px 12px\">${esc(item.prompt || '')}</div>
          ` : ''}`;
      return standalone
        ? `<div class=\"print-page\" style=\"width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:10mm\"><div class=\"page-inner\">${inner}</div></div>`
        : inner;
    }
    

    

          // Build document body
          const pages: string[] = [];
          // Page 1 header + first device (with header content at top)
          pages.push(`
            <div class="print-page" style="width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:12mm">
              <div class="page-inner">
              <div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:8px">
                <img src={publicAsset('logo-spin.gif')} alt="GadgetBoy" style={{ height: '35mm', width: 'auto' }} />
                <div style="line-height:1.2; flex:1">
                  <div style="font-size:20pt; font-weight:700; letter-spacing:0.2px">Gadgetboy Quote</div>
                  <div style="font-size:13pt; font-weight:700">GADGETBOY Repair & Retail</div>
                  <div style="font-size:12pt">2822 Devine Street, Columbia, SC 29205</div>
                  <div style="font-size:12pt">(803) 708-0101 | gadgetboysc@gmail.com</div>
                  <div style="margin-top:8px; font-size:12pt"><b>Customer:</b> ${esc(cust || '-')} | <b>Phone:</b> ${esc(phone)}</div>
                  <div style="font-size:12pt; color:#666">Generated: ${esc(now)}</div>
                </div>
              </div>
              ${first ? devicePage(first, firstTitle, false) : ''}
              </div>
            </div>
          `);
          // Additional device pages
          sales.items.slice(1).forEach((item, idx) => {
            const model = String(((item.model ?? (item as any).dynamic?.model) || '')).trim();
            const title = model ? [item.brand, model].filter(Boolean).join(' ').trim() : `Device ${idx + 2}`;
            pages.push(devicePage(item, title, true));
          });
          // If first is Custom Build, append per-part image pages after page 1 and a final breakdown page
          if (first && first.deviceType === 'Custom Build') {
            const imageEntries: Array<{ label: string; src: string }> = [
              { key: 'case', label: 'Case' },
              { key: 'motherboard', label: 'Motherboard' },
              { key: 'cpu', label: 'Processor' },
              { key: 'ram', label: 'Memory' },
              { key: 'gpu', label: 'Graphics Card' },
              { key: 'psu', label: 'PSU' },
            ].map((p: any) => {
              const src = String((first.dynamic || ({} as any))[`${p.key}Image`] || '');
              return src ? { label: p.label, src } : null;
            }).filter(Boolean) as any[];
            const extrasImgs = (Array.isArray((first.dynamic as any)?.extraParts) ? (first.dynamic as any).extraParts : []).map((e: any) => {
              const src = String(e?.image || ''); const label = String(e?.name || 'Extra');
              return src ? { label, src } : null;
            }).filter(Boolean) as any[];
            const imagePages = [...imageEntries, ...extrasImgs].map((e) => `
              <div class=\"print-page\" style=\"width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:10mm\">
                <div class=\"page-inner\" style=\"text-align:center\">
                  <div style=\"font-weight:700; font-size:14pt; margin-bottom:8px\">${esc(e.label)}</div>
                  <img src=\"${e.src}\" style=\"max-width:180mm; max-height:240mm; object-fit:contain; border:1px solid #e5e7eb; border-radius:4px; padding:2px\" />
                </div>
              </div>`).join('');
            pages.push(imagePages);

            // Final breakdown page for Custom Build (cost summary + terms + signature)
            const cbParts: Array<{ key: string; label: string }> = [
              { key: 'case', label: 'Case' },
              { key: 'motherboard', label: 'Motherboard' },
              { key: 'cpu', label: 'Processor' },
              { key: 'ram', label: 'Memory' },
              { key: 'gpu', label: 'Graphics Card' },
              { key: 'psu', label: 'PSU' },
            ];
            const cbExtras = Array.isArray((first.dynamic as any)?.extraParts) ? ((first.dynamic as any).extraParts as any[]) : [];
            const cbLabor = Number((first.dynamic || ({} as any)).buildLabor || 0) || 0;
            const cbLines = cbParts.map((p) => {
              const name = p.label;
              const desc = String((first.dynamic || ({} as any))[p.key] || '');
              const raw = Number((first.dynamic || ({} as any))[`${p.key}Price`] || 0) || 0;
              const price = raw * 1.05;
              if (!desc && !raw) return '';
              return `<tr><td class=\"border p-2\"><b>${esc(name)}</b>${desc ? ` - ${esc(desc)}` : ''}</td><td class=\"border p-2\" style=\"text-align:right\">$${price.toFixed(2)}</td></tr>`;
            }).join('');
            const cbExtraLines = cbExtras.map((e: any) => {
              const name = String(e?.name || 'Extra');
              const desc = String(e?.desc || '');
              const raw = Number(e?.price || 0) || 0; const price = raw * 1.05;
              if (!name && !raw) return '';
              return `<tr><td class=\"border p-2\"><b>${esc(name)}</b>${desc ? ` - ${esc(desc)}` : ''}</td><td class=\"border p-2\" style=\"text-align:right\">$${price.toFixed(2)}</td></tr>`;
            }).join('');
            const cbPartsSum = cbParts.reduce((acc, p) => acc + ((Number((first.dynamic || ({} as any))[`${p.key}Price`] || 0) || 0) * 1.05), 0) + cbExtras.reduce((acc, e) => acc + ((Number(e?.price || 0) || 0) * 1.05), 0);
            const cbTotal = cbPartsSum + cbLabor;
            const breakdownPage = `
              <div class=\"print-page\" style=\"width:210mm; min-height:297mm; margin:0 auto; border:3px solid #f00; border-radius:8px; padding:12mm\">
                <div class=\"page-inner\">
                  <div style=\"font-weight:700; margin-bottom:6px; font-size:13pt\">Cost Breakdown</div>
                  <style>.border{border:1px solid #000}.p-2{padding:8px} table{border-collapse:collapse; width:100%}</style>
                  <table>
                    <thead><tr><th class=\"border p-2\" style=\"text-align:left\">Component</th><th class=\"border p-2\" style=\"text-align:right\">Price</th></tr></thead>
                    <tbody>${cbLines}${cbExtraLines || ''}</tbody>
                    <tfoot>
                      <tr><td class=\"border p-2\" style=\"text-align:right; font-weight:600\">Build Labor</td><td class=\"border p-2\" style=\"text-align:right; font-weight:600\">$${cbLabor.toFixed(2)}</td></tr>
                      <tr><td class=\"border p-2\" style=\"text-align:right; font-weight:700\">Total (before tax)</td><td class=\"border p-2\" style=\"text-align:right; font-weight:700\">$${cbTotal.toFixed(2)}</td></tr>
                    </tfoot>
                  </table>
                  <div style="font-weight:700; margin-top:16px; margin-bottom:6px; font-size:13pt">Terms and Conditions</div>
                  <div style="border:2px solid #f00; border-radius:4px; padding:12px; font-size:12pt; line-height:1.45">
                    <p style="margin:0 0 8px">By signing, the client agrees to the following:</p>
                    <ul style="padding-left:1.1rem; margin:0">
                      <li style="margin-bottom:6px"><b>Quote Validity & Availability:</b> Prices are valid at issue and subject to availability; special orders may be non-returnable.</li>
                      <li style="margin-bottom:6px"><b>Warranty:</b> 90-day limited hardware warranty for defects under normal use; exclusions apply.</li>
                      <li style="margin-bottom:6px"><b>Data & Software:</b> Client responsible for backups and licensing; we are not liable for data loss.</li>
                      <li style="margin-bottom:6px"><b>Liability:</b> Liability limited to amount paid; incidental or consequential damages are excluded.</li>
                    </ul>
                  </div>
                  <div id=\"sigSection\" style=\"display:flex; gap:24px; align-items:flex-start; margin-top:24px\">
                    <div style=\"flex:1\">
                      <div id=\"sigBox\" style=\"min-height:96px; border-bottom:2px solid #000\"></div>
                    </div>
                    <div style=\"width:220px\">
                      <div id=\"dateBox\" style=\"border-bottom:2px solid #000; min-height:24px; margin-bottom:4px\"></div>
                    </div>
                  </div>
                </div>
              </div>`;
            pages.push(breakdownPage);
          }
          // Final page for all non-custom-build device quotes
          if (!(first && first.deviceType === 'Custom Build')) {
            pages.push(finalPagePrint());
          }

          const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Gadgetboy Quote</title>
        <base href="${(typeof window !== 'undefined' && (window as any).location) ? ((window as any).location.origin + '/') : '/'}">
        <style>
          @media print {
            @page { size: A4; margin: 12mm; }
            .print-page { page-break-after: always; page-break-inside: avoid; break-inside: avoid; }
            .print-page:last-of-type { page-break-after: auto; }
            .no-print { display:none !important; }
          }
          html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; }
          .page-inner { transform-origin: top center; }
        </style>
        </head>
      <body>
        ${pages.join('\n')}
      </body>
      </html>`;
    return html;
  }

  // Build a simple print HTML for Repairs quotes.
  function buildRepairsPrintHtml() {
    const esc = (s: string) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const rows = (repairs.lines || []).map((ln) => {
      const pp = Number(ln.partPrice || 0);
      const lp = Number(ln.laborPrice || 0);
      return `<tr><td class="border p-2">${esc(ln.description || '')}</td><td class="border p-2" style="text-align:right">$${pp.toFixed(2)}</td><td class="border p-2" style="text-align:right">$${lp.toFixed(2)}</td><td class="border p-2" style="text-align:right">$${(pp+lp).toFixed(2)}</td></tr>`;
    }).join('');
  const html = `<!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gadgetboy Repairs Quote</title>
  <base href="${(typeof window !== 'undefined' && (window as any).location) ? ((window as any).location.origin + '/') : '/'}">
      <style>
        @media print {
          @page { size: A4; margin: 12mm; }
          .print-page { page-break-after: auto; }
        }
        html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; }
        .border { border: 1px solid #000; }
        .p-2 { padding: 8px; }
        table { border-collapse: collapse; width: 100%; }
      </style>
    </head>
    <body>
      <div class="print-page" style="width:210mm; min-height:297mm; margin:0 auto; padding:12mm;">
        <div class="page-inner">
        <div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:8px">
          <img src={publicAsset('logo-spin.gif')} alt="GadgetBoy" style={{ height: '35mm', width: 'auto' }} />
          <div style="line-height:1.2; flex:1">
            <div style="font-size:20pt; font-weight:700; letter-spacing:0.2px">Gadgetboy Repairs Quote</div>
            <div style="font-size:13pt; font-weight:700">GADGETBOY Repair & Retail</div>
            <div style="font-size:12pt">2822 Devine Street, Columbia, SC 29205</div>
            <div style="font-size:12pt">(803) 708-0101 | gadgetboysc@gmail.com</div>
            <div style="margin-top:8px; font-size:12pt"><b>Customer:</b> ${esc(repairs.customerName || '-')} | <b>Phone:</b> ${esc(repairs.customerPhone || '')}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="border p-2" style="text-align:left">Description</th>
              <th class="border p-2" style="text-align:right">Parts</th>
              <th class="border p-2" style="text-align:right">Labor</th>
              <th class="border p-2" style="text-align:right">Line</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr>
              <td class="border p-2" colspan="3" style="text-align:right; font-weight:600">Total</td>
              <td class="border p-2" style="text-align:right; font-weight:700">$${repairTotals.total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        ${repairs.notes ? `<div style="margin-top:12px; font-size:12pt"><b>Notes:</b> ${esc(repairs.notes)}</div>` : ''}
        </div>
      </div>
    </body>
    </html>`;
    return html;
  }

  // Print using a dedicated HTML document with auto-print
  function printDocument() {
    const html = mode === 'sales' ? buildSalesPrintHtml() : buildRepairsPrintHtml();
    // Use a hidden iframe to trigger the OS print dialog without opening a new visible window
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }
    doc.open();
    doc.write(html);
    doc.close();
    const fitAndPrint = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      try {
        const pages = Array.from(win.document.querySelectorAll<HTMLElement>('.print-page'));
        pages.forEach((page) => {
          const inner = page.querySelector<HTMLElement>('.page-inner');
          if (!inner) return;
          // reset any previous transform for accurate measurement
          inner.style.transform = '';
          inner.style.width = '';
          // force layout and measure
          const pageRect = page.getBoundingClientRect();
          const innerRect = inner.getBoundingClientRect();
          const scaleW = pageRect.width / innerRect.width;
          const scaleH = pageRect.height / innerRect.height;
          const scale = Math.min(scaleW, scaleH, 1);
          if (scale < 1) {
            inner.style.transform = `scale(${scale})`;
            inner.style.width = `${pageRect.width / scale}px`;
          }
        });
        win.focus();
        win.print();
      } finally {
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
          setShowPreview(false);
        }, 100);
      }
    };
    // Wait for images and fonts to be ready before printing
    const onLoaded = () => {
      const win = iframe.contentWindow;
      if (!win) { setTimeout(fitAndPrint, 150); return; }
      try {
        const imgs = Array.from(win.document.images || []);
        if (imgs.length === 0) { setTimeout(fitAndPrint, 50); return; }
        let pending = 0;
        imgs.forEach((img: HTMLImageElement) => {
          if (!img.complete) pending++;
        });
        if (pending === 0) { setTimeout(fitAndPrint, 50); return; }
        const done = () => { pending--; if (pending <= 0) setTimeout(fitAndPrint, 50); };
        imgs.forEach((img: HTMLImageElement) => {
          if (img.complete) return;
          img.addEventListener('load', done, { once: true } as any);
          img.addEventListener('error', done, { once: true } as any);
        });
        // Fallback timeout so we don't hang if some resources never load
        setTimeout(() => { if (pending > 0) setTimeout(fitAndPrint, 50); }, 2500);
      } catch {
        setTimeout(fitAndPrint, 200);
      }
    };
    if (doc.readyState === 'complete') onLoaded(); else iframe.onload = onLoaded;
  }

  // Format createdAt timestamps in Saved Quotes
  function fmtWhen(iso?: string) {
    if (!iso) return '';
    try { const d = new Date(iso); return d.toLocaleString(); } catch { return String(iso); }
  }

  // Saved Quotes modal: load and delete
  async function openSavedQuotes() {
    try {
      const list = await (window as any).api.dbGet('quotes');
      const arr = Array.isArray(list) ? list : [];
      // This window is sales-only: only show 'sales' (or missing type treated as sales)
      const filtered = arr.filter((q: any) => (q?.type ?? 'sales') === 'sales');
      // Sort newest first by createdAt if available
      filtered.sort((a: any, b: any) => {
        const ta = new Date(a?.createdAt || 0).getTime();
        const tb = new Date(b?.createdAt || 0).getTime();
        return tb - ta;
      });
      setQuotes(filtered);
    } catch {
      setQuotes([]);
    }
  }

  // Load saved quotes once on mount
  useEffect(() => {
    openSavedQuotes();
  }, []);

  async function deleteSavedQuote(q: any) {
    try {
      if (q?.id == null) return;
      const ok = await (window as any).api.dbDelete('quotes', q.id);
      if (ok) {
        setQuotes((prev) => prev.filter((x) => x.id !== q.id));
        setSaveMsg(`Deleted quote #${q.id}`);
        setTimeout(() => setSaveMsg(null), 1800);
      }
    } catch {}
  }

  const repairCategories: any[] = [];
  const repairCatalog: any[] = [];

  function addSaleItem() {
    setSales((s) => ({ ...s, items: [...s.items, { expanded: true, dynamic: {}, images: [] }] }));
  }
  function removeSaleItem(idx: number) {
    setSales((s) => ({ ...s, items: s.items.filter((_, i) => i !== idx) }));
  }
  function toggleSaleItemExpanded(idx: number) {
    setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, expanded: !x.expanded } : x)) }));
  }
  async function addImagesToItem(idx: number, fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    setSales((current) => {
      const cur = (current.items[idx] || {}) as SaleItem;
      const room = 3 - (cur.images?.length || 0);
      const pick = files.slice(0, Math.max(0, room));
      const readers = pick.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result || ''));
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(f);
          })
      );
      Promise.all(readers)
        .then((dataUrls) => {
          setSales((prev) => ({
            ...prev,
            items: prev.items.map((x, i) => (i === idx ? { ...x, images: [...(x.images || []), ...dataUrls].slice(0, 3) } : x)),
          }));
        })
        .catch(() => {});
      return current;
    });
  }
  function removeImageFromItem(idx: number, imageIdx: number) {
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => (i === idx ? { ...x, images: (x.images || []).filter((_, j) => j !== imageIdx) } : x)),
    }));
  }

  // Custom Build: per-part image helpers
  async function addImageForPart(idx: number, partKey: string, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [`${partKey}Image`]: dataUrl } } : x)),
    }));
  }
  function removeImageForPart(idx: number, partKey: string) {
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => {
        if (i !== idx) return x;
        const dyn = { ...(x.dynamic || {}) } as any;
        delete (dyn as any)[`${partKey}Image`];
        return { ...x, dynamic: dyn };
      }),
    }));
  }

  // Custom PC: Extras helpers (array of items with optional image, desc, price)
  async function addImageForPcExtra(idx: number, extraIdx: number, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => {
        if (i !== idx) return x;
        const list = Array.isArray((x.dynamic as any)?.pcExtras) ? [ ...(x.dynamic as any).pcExtras ] : [];
        list[extraIdx] = { ...(list[extraIdx] || {}), image: dataUrl };
        return { ...x, dynamic: { ...(x.dynamic || {}), pcExtras: list } };
      })
    }));
  }
  function removeImageForPcExtra(idx: number, extraIdx: number) {
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => {
        if (i !== idx) return x;
        const list = Array.isArray((x.dynamic as any)?.pcExtras) ? [ ...(x.dynamic as any).pcExtras ] : [];
        if (list[extraIdx]) delete (list[extraIdx] as any).image;
        return { ...x, dynamic: { ...(x.dynamic || {}), pcExtras: list } };
      })
    }));
  }
  function addPcExtra(idx: number) {
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => {
        if (i !== idx) return x;
        const list = Array.isArray((x.dynamic as any)?.pcExtras) ? [ ...(x.dynamic as any).pcExtras ] : [];
        list.push({ desc: '', price: '' });
        return { ...x, dynamic: { ...(x.dynamic || {}), pcExtras: list } };
      })
    }));
  }
  function removePcExtra(idx: number, extraIdx: number) {
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => {
        if (i !== idx) return x;
        const list = Array.isArray((x.dynamic as any)?.pcExtras) ? [ ...(x.dynamic as any).pcExtras ] : [];
        list.splice(extraIdx, 1);
        return { ...x, dynamic: { ...(x.dynamic || {}), pcExtras: list } };
      })
    }));
  }

  // Helpers for 'Other' device type: dynamic spec lines (type/description)
  function addOtherSpec(idx: number) {
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => {
        if (i !== idx) return x;
        const list = Array.isArray((x.dynamic as any)?.otherSpecs) ? [ ...(x.dynamic as any).otherSpecs ] : [];
        list.push({ desc: '', value: '' });
        return { ...x, dynamic: { ...(x.dynamic || {}), otherSpecs: list } };
      })
    }));
  }
  function removeOtherSpec(idx: number, specIdx: number) {
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => {
        if (i !== idx) return x;
        const list = Array.isArray((x.dynamic as any)?.otherSpecs) ? [ ...(x.dynamic as any).otherSpecs ] : [];
        list.splice(specIdx, 1);
        return { ...x, dynamic: { ...(x.dynamic || {}), otherSpecs: list } };
      })
    }));
  }
  function updateOtherSpecField(idx: number, specIdx: number, field: 'desc' | 'value', value: string) {
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => {
        if (i !== idx) return x;
        const list = Array.isArray((x.dynamic as any)?.otherSpecs) ? [ ...(x.dynamic as any).otherSpecs ] : [];
        list[specIdx] = { ...(list[specIdx] || {}), [field]: value };
        return { ...x, dynamic: { ...(x.dynamic || {}), otherSpecs: list } };
      })
    }));
  }

  // Drone: allow ad-hoc spec rows (description/value) similar to 'Other'
  function addDroneSpec(idx: number) {
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => {
        if (i !== idx) return x;
        const list = Array.isArray((x.dynamic as any)?.droneSpecs) ? [ ...(x.dynamic as any).droneSpecs ] : [];
        list.push({ desc: '', value: '' });
        return { ...x, dynamic: { ...(x.dynamic || {}), droneSpecs: list } };
      })
    }));
  }
  function removeDroneSpec(idx: number, specIdx: number) {
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => {
        if (i !== idx) return x;
        const list = Array.isArray((x.dynamic as any)?.droneSpecs) ? [ ...(x.dynamic as any).droneSpecs ] : [];
        list.splice(specIdx, 1);
        return { ...x, dynamic: { ...(x.dynamic || {}), droneSpecs: list } };
      })
    }));
  }
  function updateDroneSpecField(idx: number, specIdx: number, field: 'desc' | 'value', value: string) {
    setSales((prev) => ({
      ...prev,
      items: prev.items.map((x, i) => {
        if (i !== idx) return x;
        const list = Array.isArray((x.dynamic as any)?.droneSpecs) ? [ ...(x.dynamic as any).droneSpecs ] : [];
        list[specIdx] = { ...(list[specIdx] || {}), [field]: value };
        return { ...x, dynamic: { ...(x.dynamic || {}), droneSpecs: list } };
      })
    }));
  }

  function addRepairLine() {
    setRepairs((r) => ({ ...r, lines: [...r.lines, { description: '', partPrice: '', laborPrice: '' }] }));
  }
  function removeRepairLine(idx: number) {
    setRepairs((r) => ({ ...r, lines: r.lines.filter((_, i) => i !== idx) }));
  }
  function addSelectedRepairLine() {
    const rep = repairCatalog.find((r) => r.id === repairs.selectedRepairId);
    if (!rep) return;
    setRepairs((r) => ({ ...r, lines: [...r.lines, { description: rep.name, partPrice: String(rep.partCost || 0), laborPrice: String(rep.laborCost || 0) }] }));
  }

  function printPreview() {
    setShowPreview(true);
  }

  async function openHtmlPreview() {
    try {
      if (mode !== 'sales') {
        setSaveMsg('HTML Preview currently available for Sales');
        setTimeout(() => setSaveMsg(null), 1800);
        return;
      }
      const html = await generateInteractiveSalesHtml();
      try { if (htmlPreviewUrl) URL.revokeObjectURL(htmlPreviewUrl); } catch {}
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      setHtmlPreviewUrl(url);
      setShowHtmlPreview(true);
    } catch (e) {
      console.error('openHtmlPreview failed', e);
      setSaveMsg('Could not open HTML Preview');
      setTimeout(() => setSaveMsg(null), 2000);
    }
  }

  function closeHtmlPreview() {
    setShowHtmlPreview(false);
    try { if (htmlPreviewUrl) URL.revokeObjectURL(htmlPreviewUrl); } catch {}
    setHtmlPreviewUrl(null);
  }

  function downloadTextFile(filename: string, content: string, mime: string) {
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 250);
    } catch (e) {
      console.error('downloadTextFile failed', e);
    }
  }

  function htmlToPlainText(html: string): string {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
      const text = (doc.body?.innerText || doc.documentElement?.innerText || '').trim();
      return text;
    } catch {
      return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/[pdivtrlih\d]+>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
  }

  async function sendHtmlToGmail() {
    // Keep the button label "Send to Email" but send from inside the app.
    try {
      if (mode !== 'sales') {
        setSaveMsg('HTML Preview currently available for Sales');
        setTimeout(() => setSaveMsg(null), 1800);
        return;
      }
      setEmailErr(null);
      const cfg = await window.api.emailGetConfig();
      if (cfg?.ok) {
        setEmailFromName(String(cfg.fromName || 'GadgetBoy Repair & Retail'));
        setEmailHasPassword(!!cfg.hasAppPassword);
      }
      setShowEmailModal(true);
    } catch {
      setSaveMsg('Email setup unavailable');
      setTimeout(() => setSaveMsg(null), 2000);
    }
  }

  async function openEmailSettings() {
    try {
      setEmailSettingsErr(null);
      const cfg = await window.api.emailGetConfig();
      if (cfg?.ok) {
        setEmailFromName(String(cfg.fromName || 'GadgetBoy Repair & Retail'));
        setEmailHasPassword(!!cfg.hasAppPassword);
      }
      setEmailAppPassword('');
      setShowEmailSettings(true);
    } catch {
      setEmailSettingsErr('Could not load email settings');
      setShowEmailSettings(true);
    }
  }

  async function saveEmailSettings() {
    try {
      setEmailSettingsErr(null);
      setEmailSettingsSaving(true);
      const name = emailFromName.trim() || 'GadgetBoy Repair & Retail';

      // If a password was provided, update both name + password.
      if (emailAppPassword.trim()) {
        const res = await window.api.emailSetGmailAppPassword(emailAppPassword.trim(), name);
        if (!res?.ok) {
          setEmailSettingsErr(String(res?.error || 'Could not save app password'));
          return;
        }
        setEmailHasPassword(true);
        setEmailAppPassword('');
      } else {
        const res = await window.api.emailSetFromName(name);
        if (!res?.ok) {
          setEmailSettingsErr(String(res?.error || 'Could not save sender name'));
          return;
        }
      }

      setSaveMsg('Email settings saved');
      setTimeout(() => setSaveMsg(null), 1800);
      setShowEmailSettings(false);
    } catch (e: any) {
      setEmailSettingsErr(String(e?.message || e || 'Could not save settings'));
    } finally {
      setEmailSettingsSaving(false);
    }
  }

  async function clearEmailPassword() {
    try {
      setEmailSettingsErr(null);
      setEmailSettingsSaving(true);
      const res = await window.api.emailClearGmailAppPassword();
      if (!res?.ok) {
        setEmailSettingsErr(String(res?.error || 'Could not clear password'));
        return;
      }
      setEmailHasPassword(false);
      setEmailAppPassword('');
      setSaveMsg('Email password cleared');
      setTimeout(() => setSaveMsg(null), 1800);
    } catch {
      setEmailSettingsErr('Could not clear password');
    } finally {
      setEmailSettingsSaving(false);
    }
  }

  async function doSendEmail() {
    try {
      if (mode !== 'sales') return;
      setEmailErr(null);
      const to = emailTo.trim();
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        setEmailErr('Enter a valid recipient email');
        return;
      }

      setEmailSending(true);
      // Ensure password exists (if user pasted one in this modal, save it first)
      if (!emailHasPassword) {
        const pass = emailAppPassword.trim();
        if (!pass) {
          setEmailErr('Paste the Gmail App Password for gadgetboysc@gmail.com');
          return;
        }
        const res = await window.api.emailSetGmailAppPassword(pass, emailFromName.trim());
        if (!res?.ok) {
          setEmailErr(String(res?.error || 'Could not save email credentials'));
          return;
        }
        setEmailHasPassword(true);
        setEmailAppPassword('');
      }

      const html = await generateInteractiveSalesHtml();
      const cust = (sales.customerName || '').trim() || 'Customer';
      const sanitize = (s: string) => String(s || '').replace(/[^a-z0-9\-\_\+]+/gi, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
      const filename = `Gadgetboy-Quote-${sanitize(cust) || 'Customer'}.html`;
      const subject = 'Gadgetboy Quote';
      const bodyText =
        'Attached is the following quote for the product(s) you have requested. ' +
        'Feel free to email us back or call our shop if you want to finalize, ask questions, or have any concerns!\n\n' +
        'Mobile tip: If the signature box or PDF buttons don\'t work in your mail app preview, tap "Open in Browser" (Safari/Chrome). ' +
        'After signing, use "Share PDF" to email the signed PDF back to us.';

      const sendRes = await window.api.emailSendQuoteHtml({ to, subject, bodyText, filename, html });
      if (!sendRes?.ok) {
        setEmailErr(String(sendRes?.error || 'Failed to send email'));
        return;
      }

      setShowEmailModal(false);
      setSaveMsg('Email sent');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e: any) {
      setEmailErr(String(e?.message || e || 'Failed to send'));
    } finally {
      setEmailSending(false);
    }
  }

  async function saveQuote() {
    try {
      setSaving(true);
      setSaveMsg(null);
      const payload =
        mode === 'sales'
          ? {
              type: 'sales' as const,
              createdAt: new Date().toISOString(),
              customerName: sales.customerName,
              customerPhone: sales.customerPhone,
              notes: sales.notes,
              items: sales.items,
              totals: { ...salesTotals },
            }
          : {
              type: 'repairs' as const,
              createdAt: new Date().toISOString(),
              customerName: repairs.customerName,
              customerPhone: repairs.customerPhone,
              lines: repairs.lines,
              notes: repairs.notes,
              totals: { ...repairTotals },
            };
      const saved = await window.api.dbAdd('quotes', payload);
      const idText = saved?.id != null ? ` #${saved.id}` : '';
      setSaveMsg(`Saved quote${idText}`);
      if (saved?.id != null) setQuoteId(saved.id);
      // Refresh sidebar list
      openSavedQuotes();
    } catch (e: any) {
      setSaveMsg(`Failed to save: ${e?.message || e}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  }

  // Autosave quote after 2s of inactivity
  useAutosave({ mode, sales, repairs }, async () => {
    const hasSalesData = !!(sales.customerName || sales.customerPhone || (sales.items && sales.items.length));
    const hasRepairsData = !!(repairs.customerName || repairs.customerPhone || (repairs.lines && repairs.lines.length));
    if (mode === 'sales' && !hasSalesData) return;
    if (mode === 'repairs' && !hasRepairsData) return;
    const payload =
      mode === 'sales'
        ? {
            id: quoteId || undefined,
            type: 'sales' as const,
            createdAt: new Date().toISOString(),
            customerName: sales.customerName,
            customerPhone: sales.customerPhone,
            notes: sales.notes,
            items: sales.items,
            totals: { ...salesTotals },
          }
        : {
            id: quoteId || undefined,
            type: 'repairs' as const,
            createdAt: new Date().toISOString(),
            customerName: repairs.customerName,
            customerPhone: repairs.customerPhone,
            lines: repairs.lines,
            notes: repairs.notes,
            totals: { ...repairTotals },
          };
    try {
      if (quoteId) {
        const updated = await (window as any).api.dbUpdate('quotes', quoteId, payload);
        if (!updated?.id) return;
      } else {
        const saved = await (window as any).api.dbAdd('quotes', payload);
        if (saved?.id) setQuoteId(saved.id);
      }
      // Refresh sidebar list after autosave commits
      openSavedQuotes();
      try { window.opener?.postMessage({ type: 'sales:changed' }, '*'); } catch {}
      setSaveMsg('Autosaved');
      setTimeout(() => setSaveMsg(null), 1500);
    } catch {}
  }, { debounceMs: 2000, enabled: true });

  function buildAIPrompt(it: SaleItem) {
    const lines: string[] = [];
    const isImageLike = (v: any) => {
      try {
        const s = String(v ?? '').trim();
        if (!s) return false;
        if (/^data:image\//i.test(s)) return true;
        if (s.length > 2000) return true; // likely a data URI
        if (/\.(jpe?g|png|gif|bmp|webp)(?:\?|$)/i.test(s)) return true;
        if (/^https?:\/\//i.test(s) && /\.(jpe?g|png|gif|bmp|webp)(?:\?|$)/i.test(s)) return true;
        return false;
      } catch { return false; }
    };
    const isPriceLike = (v: any) => {
      try {
        if (v == null) return false;
        if (typeof v === 'number') return true;
        const s = String(v).trim();
        if (!s) return false;
        // common currency/price patterns: $12.34, 12.34, 1234, 1,234.56
        if (/^\$?\s*\d{1,3}(?:[\,\s]\d{3})*(?:[.,]\d{1,2})?\s*$/.test(s)) return true;
        if (/^\d+(?:[.,]\d{1,2})?$/.test(s)) return true;
        return false;
      } catch { return false; }
    };
    const sanitizeVal = (v: any) => (isImageLike(v) || isPriceLike(v) ? '' : String(v ?? '').trim());
    // Custom Build: create a sectioned, fact-first prompt using only provided fields
    if (it.deviceType === 'Custom Build') {
      lines.push('Produce a concise, professional single paragraph (5-7 sentences) that summarizes the provided Custom PC components and explains how they work together as a balanced system.');
      lines.push('Use only the exact specifications supplied; do not infer or invent additional numbers, model details, or availability.');
      lines.push('Structure facts by component so the model can reference them clearly. For example: "CPU: <value>, Gen <value>, <cores> cores"; "GPU: <model>, <VRAM>"; "RAM: <size>, <speed>"; "Storage: <type>, <size>".');
      lines.push('Address real-world performance implications (speed, responsiveness, multitasking, workload throughput, and expected gaming frame-rates where applicable) and state whether the build favors gaming, content creation, or general productivity.');
      lines.push('Keep language factual, neutral, and to the point; avoid sales language, pricing, or calls to action.');

      const dyn: any = it.dynamic || {};
      const pushIf = (label: string, parts: Array<any>) => {
        const vals = parts.map(p => sanitizeVal(p)).filter(Boolean);
        if (vals.length) lines.push(`${label}: ${vals.join(', ')}`);
      };

      pushIf('Case', [dyn.case, dyn.caseFormFactor, dyn.caseInfo]);
      pushIf('Motherboard', [dyn.motherboard || dyn.mobo, dyn.moboChipset, dyn.formFactor]);
      pushIf('CPU', [dyn.cpu, dyn.cpuGen && `Gen ${dyn.cpuGen}`, dyn.cpuCores && `${dyn.cpuCores} cores`, dyn.cpuClock]);
      pushIf('RAM', [dyn.ram, dyn.ramSize && `${dyn.ramSize}`, dyn.ramSpeed && `${dyn.ramSpeed}`, dyn.ramType]);
      pushIf('GPU', [dyn.gpuModel || dyn.gpu || dyn.gpuBrand, dyn.gpuVram && `${dyn.gpuVram}`]);
      pushIf('Storage', [dyn.storageType || dyn.bootDriveType, dyn.storageSize || dyn.bootDriveStorage]);
      pushIf('PSU', [dyn.psu, dyn.psuWatt && `${dyn.psuWatt}W`]);
      pushIf('Cooling', [dyn.cooling || dyn.coolingType]);
      pushIf('OS', [dyn.os]);

      if (Array.isArray(dyn.extraParts)) {
        dyn.extraParts.forEach((e: any, i: number) => {
          const name = e?.name || e?.label || `Extra-${i+1}`;
          const desc = sanitizeVal(e?.desc || e?.info || '');
          if (name || desc) lines.push(`Extra (${name}): ${desc}`);
        });
      }

      lines.push('Output: exactly one paragraph (5-7 sentences), no bullets or lists.');
      return lines.join('\n');
    }
    const titleParts = [it.brand, it.model].filter(Boolean);
    const title = titleParts.join(' ') || (it.deviceType || 'Device');
    const appleFamily = it.dynamic?.device ? `Apple ${it.dynamic.device}` : '';
    const deviceLabel = appleFamily || it.deviceType || 'Device';

  // Objective & constraints
  lines.push(`Write a professional, neutral, more detailed summary of the device (${deviceLabel}).`);
  lines.push('Output exactly one paragraph with 5-7 sentences (do not exceed 7). Use plain, precise language.');
  lines.push('Use every provided specification as-is and do not invent or infer any specifications, numbers, or version details that are not explicitly provided. If a spec is unknown, omit it.');
  lines.push('Keep the description universal and model-agnostic: do not list features that are commonly associated with a specific brand, family, or device type unless they explicitly appear in the provided facts. Do not name proprietary technologies or hallmark features unless provided.');
  lines.push('You may describe general qualities applicable to any device (e.g., build, portability, display size/clarity, performance, battery condition) only when those qualities are supported by the provided facts.');
  lines.push('Strictly avoid calls to action, pricing, availability, store/customer references, warranties, or subjective hype. Never contradict provided details.');
    lines.push('Facts you can use:');

    const facts: Array<[string, string | undefined]> = [
      ['Device Type', it.deviceType],
      ['Apple Family', it.dynamic?.device],
      ['Model', it.model],
      ['Condition', it.condition],
    ];
    // Include dynamic spec fields (OS, CPU, RAM, Storage, Color, etc.)
    if (it.dynamic) {
      Object.entries(it.dynamic).forEach(([k, v]) => {
        if (k === 'device') return; // already surfaced as Apple Family
        if (/image/i.test(k)) return; // skip any image keys
        if (/price/i.test(k)) return; // skip price-related keys
        if (isImageLike(v)) return; // skip data URLs or image URLs
        if (isPriceLike(v)) return; // skip numeric/price values
        facts.push([k, sanitizeVal(v)]);
      });
    }
    if (it.accessories) facts.push(['Accessories', it.accessories]);

    facts.forEach(([k, v]) => {
      const sv = sanitizeVal(v);
      if (!sv) return;
      lines.push(`- ${k}: ${sv}`);
    });

  // Style & format
  lines.push('Style: comprehensive yet concise; work all relevant facts naturally into the 5-7 sentence paragraph without extrapolation.');
  lines.push('Output format: exactly one paragraph (max 7 sentences), no title/heading, no bullets or numbered lists, no emojis, no calls to action.');

    return lines.join('\n');
  }

  async function copyPromptForItem(idx: number) {
    const it = sales.items[idx];
    const prompt = buildAIPrompt(it);
    // Try clipboard API with fallback
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(prompt);
      } else {
        const ta = document.createElement('textarea');
        ta.value = prompt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setSaveMsg('AI prompt copied to clipboard');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (_) {
      setSaveMsg('Could not copy to clipboard');
      setTimeout(() => setSaveMsg(null), 2000);
    }
  }

  function renderDynamicFields(it: SaleItem, idx: number) {
    const appleMap: Record<string, string> = {
      iPhone: 'Phone',
      iPad: 'Tablet',
      'iPad Air': 'Tablet',
      'iPad Pro': 'Tablet',
      'iPad mini': 'Tablet',
      MacBook: 'Laptop',
      'MacBook Air': 'Laptop',
      'MacBook Pro': 'Laptop',
      iMac: 'Laptop',
      'Mac mini': 'Laptop',
      'Mac Studio': 'Laptop',
      'Mac Pro': 'Laptop',
      'Apple Watch': 'Audio',
      AirPods: 'Audio',
      'AirPods Pro': 'Audio',
      'AirPods Max': 'Audio',
      'Apple TV': 'Other',
      HomePod: 'Audio',
    };
    const selectedApple = it.dynamic?.device as string | undefined;
    const effectiveType = it.deviceType === 'Apple Devices' && selectedApple ? appleMap[selectedApple] || 'Apple Devices' : it.deviceType;
  let dt = effectiveType ? deviceTypes.find((d) => d.type === effectiveType) : undefined;
  if (!dt) dt = deviceTypes.find((d) => d.type === it.deviceType);
  // Allow 'Other' deviceType even when there's no definition in deviceTypes
  if (!dt && it.deviceType !== 'Other') return null;

  // Special-case: Custom Build per-part UI (single-column rows: image | select | more info | price)
    if (dt?.type === 'Custom Build') {
      const parts: Array<{ key: string; label: string; options?: string[] }> = [
        { key: 'case', label: 'Case', options: ['NZXT H5','NZXT H7','Lian Li O11','Fractal North','Corsair 4000D','Corsair 5000D','Phanteks P400A'] },
        { key: 'motherboard', label: 'Motherboard', options: ['B550','B650','X670','Z690','Z790','H610','B760','X570'] },
        { key: 'cpu', label: 'Processor', options: ['Intel Core i5','Intel Core i7','Intel Core i9','AMD Ryzen 5','AMD Ryzen 7','AMD Ryzen 9','Ryzen 7 7800X3D','Intel i7-13700K','Intel i9-14900K'] },
        { key: 'ram', label: 'Memory', options: ['16 GB DDR4','32 GB DDR4','16 GB DDR5','32 GB DDR5','64 GB DDR5'] },
        { key: 'gpu', label: 'Graphics Card', options: ['RTX 4060','RTX 4060 Ti','RTX 4070','RTX 4070 Ti','RTX 4080','RX 7700 XT','RX 7800 XT'] },
        { key: 'psu', label: 'PSU', options: ['650W Gold','750W Gold','850W Gold','1000W Gold'] },
      ];

      const partRows = parts.map((p) => {
        const imageKey = `${p.key}Image`;
        const infoKey = `${p.key}Info`;
        const priceKey = `${p.key}Price`;
        const img = (it.dynamic || ({} as any))[imageKey] as string | undefined;
        return (
          <div key={`row-${p.key}`} className="col-span-16">
            <label className="block text-xs text-zinc-400 mb-1">{p.label}</label>
            <div className="grid grid-cols-16 gap-2 items-start">
              {/* Image (left) */}
              <div className="col-span-2">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-16 border border-zinc-700 rounded overflow-hidden flex items-center justify-center bg-zinc-900">
                    {img ? (
                      <img src={img} alt={`${p.label}`} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-zinc-500">No image</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button className="px-2 py-0.5 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file'; input.accept = 'image/*';
                      input.onchange = (e: any) => addImageForPart(idx, p.key, (e.target as HTMLInputElement).files);
                      input.click();
                    }}>Add Image</button>
                    {img && (
                      <button className="px-2 py-0.5 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={() => removeImageForPart(idx, p.key)}>Remove</button>
                    )}
                  </div>
                </div>
              </div>
              {/* Part select */}
              <div className="col-span-5">
                <ComboInput
                  value={(it.dynamic || ({} as any))[p.key] || ''}
                  onChange={(v) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [p.key]: v } } : x)) }))}
                  options={p.options || []}
                    placeholder={`Select ${p.label.toLowerCase()}...`}
                />
              </div>
              {/* More info */}
              <div className="col-span-7">
                <input
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
                  value={(it.dynamic || ({} as any))[infoKey] || ''}
                  onChange={(e) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [infoKey]: (e.target as HTMLInputElement).value } } : x)) }))}
                  placeholder={`More info (model/specs/notes)`}
                />
              </div>
              {/* Price */}
              <div className="col-span-2">
                <input
                  type="number" step="0.01" min="0"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
                  value={(it.dynamic || ({} as any))[priceKey] || ''}
                  onChange={(e) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [priceKey]: (e.target as HTMLInputElement).value } } : x)) }))}
                  placeholder="0.00"
                />
                <div className="text-[10px] text-zinc-400 mt-0.5">Print shows +5%</div>
              </div>
            </div>
          </div>
        );
      });

      const extras = Array.isArray((it.dynamic as any)?.extraParts) ? ((it.dynamic as any).extraParts as any[]) : [];

      return (
        <>
          <div className="col-span-16">
            <div className="bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-zinc-300">Custom Build: Each row shows image, part, details, and raw price. Printout uses +5% on each part and adds Build Labor at the end.</div>
          </div>
          {partRows}
          {/* Operating System (text field) */}
          <div className="col-span-16">
            <label className="block text-xs text-zinc-400 mb-1">Operating System</label>
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
              value={(it.dynamic || ({} as any)).os || ''}
              onChange={(e) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), os: (e.target as HTMLInputElement).value } } : x)) }))}
              placeholder="e.g., Windows 11 Pro"
            />
          </div>
          {/* Additional parts */}
          <div className="col-span-16 mt-2 flex items-center justify-between">
            <div className="text-xs text-zinc-400">Additional Parts</div>
            <button className="px-2 py-0.5 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={() => setSales((s) => ({
              ...s,
              items: s.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), extraParts: [...(Array.isArray((x.dynamic as any)?.extraParts) ? (x.dynamic as any).extraParts : []), { name: '', desc: '', price: '', image: '' }] } } : x))
            }))}>Add Part</button>
          </div>
          {extras.map((e, i) => (
            <div key={`extra-${i}`} className="col-span-16">
              <div className="grid grid-cols-16 gap-2 items-start">
                <div className="col-span-2">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-16 border border-zinc-700 rounded overflow-hidden flex items-center justify-center bg-zinc-900">
                      {e?.image ? (<img src={e.image} alt={`Extra ${i+1}`} className="w-full h-full object-cover" />) : (<span className="text-[10px] text-zinc-500">No image</span>)}
                    </div>
                    <div className="flex flex-col gap-1">
                      <button className="px-2 py-0.5 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={() => { const input = document.createElement('input'); input.type='file'; input.accept='image/*'; input.onchange = (ev: any) => { const file=(ev.target as HTMLInputElement).files?.[0]; if(!file) return; const fr=new FileReader(); fr.onload=()=> setSales((s)=>({ ...s, items: s.items.map((x,ii)=>{ if(ii!==idx) return x; const list = Array.isArray((x.dynamic as any)?.extraParts)?[...(x.dynamic as any).extraParts]:[]; list[i] = { ...(list[i]||{}), image: String(fr.result||'') }; return { ...x, dynamic: { ...(x.dynamic||{}), extraParts: list } }; }) })); fr.readAsDataURL(file); }; input.click(); }}>Add Image</button>
                      {e?.image && (<button className="px-2 py-0.5 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={() => setSales((s)=>({ ...s, items: s.items.map((x,ii)=>{ if(ii!==idx) return x; const list = Array.isArray((x.dynamic as any)?.extraParts)?[...(x.dynamic as any).extraParts]:[]; list[i] = { ...(list[i]||{}), image: '' }; return { ...x, dynamic: { ...(x.dynamic||{}), extraParts: list } }; }) }))}>Remove</button>)}
                    </div>
                  </div>
                </div>
                <div className="col-span-4">
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" value={e?.name || ''} onChange={(ev)=> setSales((s)=>({ ...s, items: s.items.map((x,ii)=>{ if(ii!==idx) return x; const list = Array.isArray((x.dynamic as any)?.extraParts)?[...(x.dynamic as any).extraParts]:[]; list[i] = { ...(list[i]||{}), name: ev.target.value }; return { ...x, dynamic: { ...(x.dynamic||{}), extraParts: list } }; }) }))} placeholder="Part Name" />
                </div>
                <div className="col-span-8">
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" value={e?.desc || ''} onChange={(ev)=> setSales((s)=>({ ...s, items: s.items.map((x,ii)=>{ if(ii!==idx) return x; const list = Array.isArray((x.dynamic as any)?.extraParts)?[...(x.dynamic as any).extraParts]:[]; list[i] = { ...(list[i]||{}), desc: ev.target.value }; return { ...x, dynamic: { ...(x.dynamic||{}), extraParts: list } }; }) }))} placeholder="Part Description" />
                </div>
                <div className="col-span-2">
                  <input type="number" step="0.01" min="0" className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" value={e?.price || ''} onChange={(ev)=> setSales((s)=>({ ...s, items: s.items.map((x,ii)=>{ if(ii!==idx) return x; const list = Array.isArray((x.dynamic as any)?.extraParts)?[...(x.dynamic as any).extraParts]:[]; list[i] = { ...(list[i]||{}), price: (ev.target as HTMLInputElement).value }; return { ...x, dynamic: { ...(x.dynamic||{}), extraParts: list } }; }) }))} placeholder="0.00" />
                  <div className="text-[10px] text-zinc-400 mt-0.5">Print shows +5%</div>
                </div>
                <div className="col-span-1 flex items-end justify-end">
                  <button className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" title="Remove" onClick={() => setSales((s)=>({ ...s, items: s.items.map((x,ii)=>{ if(ii!==idx) return x; const list = Array.isArray((x.dynamic as any)?.extraParts)?[...(x.dynamic as any).extraParts]:[]; list.splice(i,1); return { ...x, dynamic: { ...(x.dynamic||{}), extraParts: list } }; }) }))}>Remove</button>
                </div>
              </div>
            </div>
          ))}

          {/* AI prompt for synergy */}
          <div className="col-span-16 mt-2">
            <label className="block text-xs text-zinc-400 mb-1">AI Response (parts synergy)</label>
            <textarea rows={8} className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-y" placeholder="Describe how these components work together; highlight how it performs data entry, web browsing, creative work, and gaming."
              value={it.prompt || ''}
              onChange={(e) => setSales((s)=>({ ...s, items: s.items.map((x,i)=> (i===idx ? { ...x, prompt: e.target.value } : x)) }))}
            />
            <div className="flex items-center justify-end mt-2"><button className="px-3 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded hover:bg-zinc-600" onClick={() => copyPromptForItem(idx)}>Copy AI Prompt</button></div>
          </div>

          {/* Build Labor at the bottom */}
          <div className="col-span-16">
            <label className="block text-xs text-zinc-400 mb-1">Build Labor Fee</label>
            <input type="number" step="0.01" min="0" className="w-full bg-yellow-200 text-black border border-yellow-400 rounded px-2 py-1 text-sm"
              value={(it.dynamic || ({} as any)).buildLabor || ''}
              onChange={(e) => setSales((s)=>({ ...s, items: s.items.map((x,i)=> (i===idx ? { ...x, dynamic: { ...(x.dynamic||{}), buildLabor: (e.target as HTMLInputElement).value } } : x)) }))}
              placeholder="0.00"
            />
            <div className="text-[10px] text-zinc-800 mt-0.5">Labor has no markup</div>
          </div>
        </>
      );
    }
    // Special-case: Custom PC (Desktop) organized by categories with per-category image
  if (dt?.type === 'Custom PC') {
      // Build a quick index of field defs for lookup
      const fieldIndex: Record<string, any> = {};
      dt.fields.forEach((f: any) => { fieldIndex[f.key] = f; });
      type Category = { key: string; label: string; fieldKeys: string[] };
      const categories: Category[] = [
        { key: 'case', label: 'Case', fieldKeys: ['case'] },
        { key: 'motherboard', label: 'Motherboard', fieldKeys: ['motherboard'] },
        { key: 'cpu', label: 'Processor', fieldKeys: ['cpu','cpuGen'] },
        { key: 'cooling', label: 'Cooling', fieldKeys: ['cooling'] },
        { key: 'ram', label: 'Memory', fieldKeys: ['ram','ramSpeed'] },
        { key: 'gpu', label: 'Graphics Card', fieldKeys: ['gpuBrand','gpuModel','gpuVram'] },
        { key: 'storage', label: 'Storage', fieldKeys: ['bootDriveType','bootDriveStorage','secondaryStorage1Type','secondaryStorage1Storage'] },
        { key: 'psu', label: 'PSU', fieldKeys: ['psu'] },
        { key: 'os', label: 'Operating System', fieldKeys: ['os'] },
        // Peripherals: now a simple text field
        { key: 'peripherals', label: 'Peripherals', fieldKeys: ['peripherals'] },
        // Special bottom category for Build Labor (no image, no markup)
        { key: 'buildLabor', label: 'Build Labor', fieldKeys: [] },
      ];
      const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').split(' ').filter(Boolean).map((w) => {
        const up = w.toUpperCase(); return (w.length <= 3 && w === up) ? up : (w.charAt(0).toUpperCase() + w.slice(1));
      }).join(' ');
      const idxKey = String(idx);
      const toggleCat = (catKey: string) => setOpenCats((prev) => ({
        ...prev,
        [idxKey]: { ...(prev[idxKey] || {}), [catKey]: !((prev[idxKey] || {})[catKey]) }
      }));
      const renderField = (fk: string) => {
        const def = fieldIndex[fk] || { key: fk, label: titleCase(fk), type: 'text' };
        const value = (it.dynamic || ({} as any))[fk] || '';
        const isLong = fk === 'ports';
        // Make inputs long and spaced comfortably
        const colClass = isLong ? 'col-span-16' : 'col-span-12';
        if (Array.isArray(def.options) && def.options.length > 0) {
          return (
            <div key={fk} className={colClass}>
              <label className="block text-xs text-zinc-400 mb-1">{def.label || titleCase(fk)}</label>
              <ComboInput
                value={value}
                onChange={(v) => setSales((s) => ({ ...s, items: s.items.map((x, i2) => (i2 === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [fk]: v } } : x)) }))}
                options={((): string[] => {
                  const opts = (def.options || []) as string[];
                  if (fk === 'os') {
                    return opts.map((o) => {
                      let s = String(o || '');
                      // remove trailing price patterns like " - $123.45" or " ($123.45)"
                      s = s.replace(/\s*(?:[-:])\s*\$?\d+(?:[.,]\d{2})?$/, '');
                      s = s.replace(/\s*\([^\)]*\$\d+[\d.,]*[^\)]*\)\s*$/, '');
                      return s.trim();
                    });
                  }
                  return opts;
                })()}
                placeholder={`Select ${(def.label || titleCase(fk)).toLowerCase()}...`}
              />
            </div>
          );
        }
        return (
          <div key={fk} className={colClass}>
            <label className="block text-xs text-zinc-400 mb-1">{def.label || titleCase(fk)}</label>
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
              value={value}
              onChange={(e) => setSales((s) => ({ ...s, items: s.items.map((x, i2) => (i2 === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [fk]: (e.target as HTMLInputElement).value } } : x)) }))}
              placeholder={String(def.label || titleCase(fk))}
            />
          </div>
        );
      };

      return (
        <>
          {/* Wrap categories in a single full-width column and stack vertically; ensure it starts below Device Type */}
          <div className="col-span-16 col-start-1 mt-3">
            <div className="flex flex-col gap-2">
          {categories.map((cat) => {
            const imageKey = `${cat.key}Image`;
            const img = (it.dynamic || ({} as any))[imageKey] as string | undefined;
            const isOpen = (openCats[idxKey] && openCats[idxKey][cat.key]) ?? (cat.key === 'case');
            return (
              <div key={`cat-${cat.key}`}>
                {/* Category as dropdown header */}
                <button type="button" className="w-full flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-left"
                  onClick={() => toggleCat(cat.key)}
                >
                  <span className="text-sm font-semibold text-zinc-200">{cat.label}</span>
                  <span className="text-zinc-400 text-xs">{isOpen ? 'v' : '>'}</span>
                </button>
                {isOpen && (
                  <div className="mt-2 border border-zinc-700 rounded p-2 bg-zinc-900 relative isolate z-10">
                    {/* Image controls and preview (skip for Build Labor, Peripherals, and OS) */}
                    {cat.key !== 'buildLabor' && cat.key !== 'peripherals' && cat.key !== 'os' && (
                      <div className="flex items-center gap-2 mb-2">
                        <button className="px-2 py-0.5 text-xs bg-zinc-700 border border-zinc-600 rounded"
                          onClick={() => { const input = document.createElement('input'); input.type='file'; input.accept='image/*'; input.onchange = (ev: any) => addImageForPart(idx, cat.key, (ev.target as HTMLInputElement).files); input.click(); }}
                        >Add Image</button>
                        {img && (
                          <button className="px-2 py-0.5 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={() => removeImageForPart(idx, cat.key)}>Remove</button>
                        )}
                        {img ? (
                          <div className="ml-2 w-16 h-16 border border-zinc-700 rounded overflow-hidden bg-zinc-900 flex items-center justify-center">
                            <img src={img} alt={`${cat.label}`} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="ml-2 text-[10px] text-zinc-500">No image</div>
                        )}
                      </div>
                    )}
                    {/* Category fields */}
                    {cat.key !== 'buildLabor' ? (
                      <div className="grid grid-cols-16 gap-3">
                        {/* For Peripherals: render stacked line items (Description + Price) with add/remove */}
                        {cat.key === 'peripherals' ? (
                          <>
                            <div className="col-span-16 flex justify-between items-center">
                              <div className="text-xs text-zinc-400">Add peripherals as individual line items.</div>
                              <button type="button" className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={() => addPcExtra(idx)}>+ Add item</button>
                            </div>
                            {(Array.isArray((it.dynamic as any)?.pcExtras) ? (it.dynamic as any).pcExtras : []).map((e: any, iExtra: number) => (
                              <div key={`pc-extra-${iExtra}`} className="col-span-16">
                                <div className="flex items-end gap-2">
                                  <div className="w-[220px]">
                                    <label className="block text-xs text-zinc-400 mb-1">Image</label>
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 h-16 border border-zinc-700 rounded overflow-hidden flex items-center justify-center bg-zinc-900">
                                        {e?.image ? (
                                          <img src={String(e.image)} alt={String(e?.label || e?.type || 'Peripheral')} className="w-full h-full object-cover" />
                                        ) : (
                                          <span className="text-[10px] text-zinc-500">No image</span>
                                        )}
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <button
                                          type="button"
                                          className="px-2 py-0.5 text-xs bg-zinc-700 border border-zinc-600 rounded"
                                          onClick={() => {
                                            const input = document.createElement('input');
                                            input.type = 'file';
                                            input.accept = 'image/*';
                                            input.onchange = (ev: any) => addImageForPcExtra(idx, iExtra, (ev.target as HTMLInputElement).files);
                                            input.click();
                                          }}
                                        >
                                          Add Image
                                        </button>
                                        {e?.image && (
                                          <button
                                            type="button"
                                            className="px-2 py-0.5 text-xs bg-zinc-700 border border-zinc-600 rounded"
                                            onClick={() => removeImageForPcExtra(idx, iExtra)}
                                          >
                                            Remove
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <label className="block text-xs text-zinc-400 mb-1">Peripheral</label>
                                    <ComboInput
                                      value={String(e?.label || '')}
                                      onChange={(v) => setSales((s) => ({
                                        ...s,
                                        items: s.items.map((x, i2) => {
                                          if (i2 !== idx) return x;
                                          const list = Array.isArray((x.dynamic as any)?.pcExtras) ? [ ...(x.dynamic as any).pcExtras ] : [];
                                          list[iExtra] = { ...(list[iExtra] || {}), label: v };
                                          return { ...x, dynamic: { ...(x.dynamic || {}), pcExtras: list } };
                                        }),
                                      }))}
                                      options={PERIPHERAL_TYPE_OPTIONS}
                                      placeholder="Select or type a peripheral..."
                                    />
                                    <div className="mt-2">
                                      <label className="block text-xs text-zinc-400 mb-1">Description</label>
                                      <input className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" placeholder="Optional notes (brand/model, color, etc.)" value={e?.desc || ''} onChange={(ev) => setSales((s) => ({ ...s, items: s.items.map((x, i2) => { if (i2 !== idx) return x; const list = Array.isArray((x.dynamic as any)?.pcExtras) ? [ ...(x.dynamic as any).pcExtras ] : []; list[iExtra] = { ...(list[iExtra] || {}), desc: ev.target.value }; return { ...x, dynamic: { ...(x.dynamic || {}), pcExtras: list } }; }) }))} />
                                    </div>
                                  </div>
                                  <div className="w-32">
                                    <label className="block text-xs text-zinc-400 mb-1">Price</label>
                                    <input type="number" step="0.01" min="0" className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" placeholder="0.00" value={e?.price || ''} onChange={(ev) => setSales((s) => ({ ...s, items: s.items.map((x, i2) => { if (i2 !== idx) return x; const list = Array.isArray((x.dynamic as any)?.pcExtras) ? [ ...(x.dynamic as any).pcExtras ] : []; list[iExtra] = { ...(list[iExtra] || {}), price: (ev.target as HTMLInputElement).value }; return { ...x, dynamic: { ...(x.dynamic || {}), pcExtras: list } }; }) }))} />
                                    <div className="text-[10px] text-zinc-400 mt-0.5">Print shows +5%</div>
                                  </div>
                                  <div>
                                    <button type="button" className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" title="Remove" onClick={() => removePcExtra(idx, iExtra)}>Remove</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </>
                        ) : (
                          <>
                            {cat.fieldKeys.map(renderField)}
                            {/* Price field per category */}
                            <div className="col-span-4">
                              <label className="block text-xs text-zinc-400 mb-1">Price</label>
                              <input
                                type="number" step="0.01" min="0"
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
                                value={(it.dynamic || ({} as any))[`${cat.key}Price`] || ''}
                                onChange={(e) => setSales((s) => ({ ...s, items: s.items.map((x, i2) => (i2 === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [`${cat.key}Price`]: (e.target as HTMLInputElement).value } } : x)) }))}
                                placeholder="0.00"
                              />
                              <div className="text-[10px] text-zinc-400 mt-0.5">Print shows +5%</div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-16 gap-3">
                        <div className="col-span-6">
                          <label className="block text-xs text-zinc-400 mb-1">Build Labor</label>
                          <input
                            type="number" step="0.01" min="0"
                            className="w-full bg-yellow-200 text-black border border-yellow-400 rounded px-2 py-1 text-sm"
                            value={(it.dynamic || ({} as any)).buildLabor || ''}
                            onChange={(e) => setSales((s) => ({ ...s, items: s.items.map((x, i2) => (i2 === idx ? { ...x, dynamic: { ...(x.dynamic || {}), buildLabor: (e.target as HTMLInputElement).value } } : x)) }))}
                            placeholder="0.00"
                          />
                          <div className="text-[10px] text-zinc-800 mt-0.5">Labor has no markup</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
            </div>
          </div>
        </>
      );
    }
  // Special-case: 'Other' device type - allow adding arbitrary spec rows (description/value)
  if (it.deviceType === 'Other') {
    const specs: Array<{ desc?: string; value?: string }> = Array.isArray((it.dynamic as any)?.otherSpecs) ? (it.dynamic as any).otherSpecs : [];
      return (
        <>
          <div className="col-span-16">
            <div className="text-xs text-zinc-400">Custom specifications</div>
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <button type="button" className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={() => addOtherSpec(idx)}>+ Add spec</button>
              </div>
              <div className="mt-2">
                <div className="flex flex-col gap-2">
                  {specs.map((s, si) => (
                    <div key={`other-spec-${si}`} className="flex items-center gap-2">
                      <input className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" placeholder="Spec Description" value={s?.desc || ''} onChange={(e) => updateOtherSpecField(idx, si, 'desc', (e.target as HTMLInputElement).value)} />
                      <input className="w-48 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" placeholder="Spec Value" value={s?.value || ''} onChange={(e) => updateOtherSpecField(idx, si, 'value', (e.target as HTMLInputElement).value)} />
                      <button className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" title="Remove" onClick={() => removeOtherSpec(idx, si)}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      );
    }
  // Non-Custom types: render fields simply
  const fields = (dt && dt.type === 'Apple Devices') ? dt.fields.filter((f: any) => f.key !== 'device') : (dt?.fields || []);
    const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').split(' ').filter(Boolean).map((w) => {
      const up = w.toUpperCase(); return (w.length <= 3 && w === up) ? up : (w.charAt(0).toUpperCase() + w.slice(1));
    }).join(' ');
  const wideKeys = new Set(['model','description','ports','accessories','notes','screen','screenSize','cpu','gpuModel','gpuBrand','storage']);

  // Detect MacBook/iMac/Mac mini contexts across any device type (brand/model or Apple Devices family)
    const isMacBookContext = (() => {
      const family = String(((it.dynamic || ({} as any)).device || '')).toLowerCase();
      const brand = String(it.brand || '').toLowerCase();
      const model = String(it.model || '').toLowerCase();
      const macFamily = family.includes('macbook');
      const macBrandModel = brand === 'apple' && (model.includes('macbook') || model.includes('air') || model.includes('pro'));
      return macFamily || macBrandModel;
    })();
    const isIMacContext = (() => {
      const family = String(((it.dynamic || ({} as any)).device || '')).toLowerCase();
      const brand = String(it.brand || '').toLowerCase();
      const model = String(it.model || '').toLowerCase();
      const iMacFamily = family.includes('imac');
      const iMacBrandModel = brand === 'apple' && model.includes('imac');
      return iMacFamily || iMacBrandModel;
    })();
    const isAppleWatchContext = (() => {
      const family = String(((it.dynamic || ({} as any)).device || '')).toLowerCase();
      const brand = String(it.brand || '').toLowerCase();
      const model = String(it.model || '').toLowerCase();
      const watchFamily = family.includes('apple watch') || family.includes('watch');
      const watchBrandModel = brand === 'apple' && model.includes('watch');
      return watchFamily || watchBrandModel;
    })();
    const isHomePodContext = (() => {
      if (it.deviceType !== 'Apple Devices') return false;
      const family = String(((it.dynamic || ({} as any)).device || '')).toLowerCase();
      return family.includes('homepod');
    })();
    const isAppleTVContext = (() => {
      if (it.deviceType !== 'Apple Devices') return false;
      const family = String(((it.dynamic || ({} as any)).device || '')).toLowerCase();
      return family.includes('apple tv');
    })();
    const isAirPodsMaxContext = (() => {
      if (it.deviceType !== 'Apple Devices') return false;
      const family = String(((it.dynamic || ({} as any)).device || '')).toLowerCase();
      return family.includes('airpods') && family.includes('max');
    })();
    const isAirPodsNonMaxContext = (() => {
      if (it.deviceType !== 'Apple Devices') return false;
      const family = String(((it.dynamic || ({} as any)).device || '')).toLowerCase();
      const isAirPods = family.includes('airpods');
      const isMax = family.includes('max');
      return isAirPods && !isMax;
    })();
    const isAppleAudioContext = (() => {
      if (it.deviceType !== 'Apple Devices') return false;
      const family = String(((it.dynamic || ({} as any)).device || '')).toLowerCase();
      const audioFamilies = ['apple watch','airpods','airpods pro','airpods max','homepod'];
      return audioFamilies.some((k) => family.includes(k));
    })();
    const isMacMiniContext = (() => {
      const family = String(((it.dynamic || ({} as any)).device || '')).toLowerCase();
      const brand = String(it.brand || '').toLowerCase();
      const model = String(it.model || '').toLowerCase();
      const miniFamily = family.includes('mac mini');
      const miniBrandModel = brand === 'apple' && model.includes('mini');
      return miniFamily || miniBrandModel;
    })();
    const isMacStudioContext = (() => {
      const family = String(((it.dynamic || ({} as any)).device || '')).toLowerCase();
      const brand = String(it.brand || '').toLowerCase();
      const model = String(it.model || '').toLowerCase();
      const studioFamily = family.includes('mac studio');
      const studioBrandModel = brand === 'apple' && model.includes('studio');
      return studioFamily || studioBrandModel;
    })();
    const isMacProContext = (() => {
      const family = String(((it.dynamic || ({} as any)).device || '')).toLowerCase();
      const brand = String(it.brand || '').toLowerCase();
      const model = String(it.model || '').toLowerCase();
      const macProFamily = family.includes('mac pro');
      const macProBrandModel = brand === 'apple' && model.includes('mac pro');
      return macProFamily || macProBrandModel;
    })();

  // Build the normal field nodes first
  let effectiveFields = fields as any[];
    const isAppleDevicesSelection = it.deviceType === 'Apple Devices';
    if (isMacBookContext || isIMacContext) {
      effectiveFields = effectiveFields.filter((f: any) => f.key !== 'cpuGen' && f.key !== 'gpuBrand');
    } else if (isMacMiniContext) {
      // For Mac mini, remove CPU Gen and GPU Brand as requested
      effectiveFields = effectiveFields.filter((f: any) => f.key !== 'cpuGen' && f.key !== 'gpuBrand');
    } else if (isMacStudioContext || isMacProContext) {
      // Copy Mac mini behavior for Mac Studio and Mac Pro
      effectiveFields = effectiveFields.filter((f: any) => f.key !== 'cpuGen' && f.key !== 'gpuBrand');
    }
    // For any Apple Devices selection, hide GPU-related fields entirely (most Apple devices use integrated GPU)
    if (isAppleDevicesSelection) {
      effectiveFields = effectiveFields.filter((f: any) => f.key !== 'gpuBrand' && f.key !== 'gpuModel' && f.key !== 'gpuVram');
      // For Apple Devices that map to audio-like families, remove the Audio "Type" field
      if (isAppleAudioContext) {
        effectiveFields = effectiveFields.filter((f: any) => f.key !== 'audioType');
      }
      // For AirPods (non-Max), remove Color field entirely
      if (isAirPodsNonMaxContext) {
        effectiveFields = effectiveFields.filter((f: any) => f.key !== 'color');
      }
      // For HomePod, keep minimal inputs: remove Color and Features
      if (isHomePodContext) {
        effectiveFields = effectiveFields.filter((f: any) => f.key !== 'color' && f.key !== 'features');
      }
      // For Apple Watch, remove Features (we already manage Color with a curated palette)
      if (isAppleWatchContext) {
        effectiveFields = effectiveFields.filter((f: any) => f.key !== 'features');
      }
      // For Apple TV, keep only model/condition in the general UI by removing Apple Devices-specific fields
      if (isAppleTVContext) {
        effectiveFields = effectiveFields.filter((f: any) => !['storage','color','ports','accessories'].includes(f.key));
      }
    }
    // Gaming Laptop: we'll render storage rows in a custom layout; remove the stock storage fields here
    if (dt?.type === 'Gaming Laptop') {
      effectiveFields = effectiveFields.filter((f: any) => !['bootDriveType','bootDriveStorage','secondaryStorage1Type','secondaryStorage1Storage'].includes(f.key));
    }
  const fieldNodes = effectiveFields.map((f: any) => {
      const value = (it.dynamic || ({} as any))[f.key] || '';
      const colClass = (f.key === 'ports' || f.key === 'accessories') ? 'col-span-12' : (f.type === 'text' || wideKeys.has(f.key) ? 'col-span-4' : 'col-span-2');
      // If this is a CPU field in a MacBook/iMac/Mac mini context, override options to family-appropriate CPUs
      let overriddenOptions: string[] | undefined = undefined;
      // Override Color for specific Apple families
      if (f.key === 'color') {
        if (isAppleWatchContext) {
          const watchColors = [
            // Aluminum and general
            'Midnight','Starlight','Silver','(PRODUCT)RED','Blue','Green','Pink','Yellow','Purple','White','Black','Space Gray',
            // Stainless
            'Graphite','Gold','Space Black',
            // Titanium / Ultra
            'Natural Titanium','Black Titanium',
            'Other'
          ];
          overriddenOptions = watchColors;
        } else if (isAirPodsMaxContext) {
          const maxColors = ['Space Gray','Silver','Sky Blue','Green','Pink','Other'];
          overriddenOptions = maxColors;
        }
      }
      if (f.key === 'cpu' && (isMacBookContext || isIMacContext || isMacMiniContext || isMacStudioContext || isMacProContext)) {
        if (isIMacContext) {
          // iMac: Intel i3/i5/i7/i9 and Apple M1/M3 (no Pro/Max/Ultra)
          const intelIMac = ['Intel Core i3','Intel Core i5','Intel Core i7','Intel Core i9','Intel Xeon W'];
          const appleIMac = ['M1','M3'];
          overriddenOptions = [...intelIMac, ...appleIMac, 'Other'];
        } else if (isMacMiniContext) {
          // Mac mini: Intel i3/i5/i7 and Apple M1/M2/M2 Pro (no Max/Ultra)
          const intelMini = ['Intel Core i3','Intel Core i5','Intel Core i7'];
          const appleMini = ['M1','M2','M2 Pro'];
          overriddenOptions = [...intelMini, ...appleMini, 'Other'];
        } else if (isMacStudioContext) {
          // Mac Studio: Apple Silicon only (Max/Ultra tiers)
          const appleStudio = ['M1 Max','M1 Ultra','M2 Max','M2 Ultra'];
          overriddenOptions = [...appleStudio, 'Other'];
        } else if (isMacProContext) {
          // Mac Pro: Intel Xeon W (2019) or Apple Silicon M2 Ultra (2023+)
          const xeonPro = ['Intel Xeon W-3223','Intel Xeon W-3235','Intel Xeon W-3245','Intel Xeon W-3265','Intel Xeon W-3275','Intel Xeon W (Other)'];
          const applePro = ['M2 Ultra'];
          overriddenOptions = [...xeonPro, ...applePro, 'Other'];
        } else {
          // MacBook: Intel i5/i7 and Apple M1-M4 (no Ultra)
          const intelMacBook = ['Intel Core i5', 'Intel Core i7'];
          const appleMacBook = ['M1','M1 Pro','M1 Max','M2','M2 Pro','M2 Max','M3','M3 Pro','M3 Max','M4','M4 Pro','M4 Max'];
          overriddenOptions = [...intelMacBook, ...appleMacBook, 'Other'];
        }
      }
      const hasOptions = Array.isArray(f.options) && f.options.length > 0;
      // Prefer overridden options, but for OS fields prefer device-specific lists
      let optionsToUse = overriddenOptions ?? (hasOptions ? (f.options as string[]) : undefined);
      if (f.key === 'os') {
        try {
          const family = (it.dynamic || ({} as any)).device || it.brand || undefined;
          optionsToUse = getOsOptions(it.deviceType, family as string | undefined);
        } catch {
          // fallback to existing optionsToUse
        }
      }
      const control = optionsToUse ? (
        <ComboInput
          value={value}
          onChange={(v) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [f.key]: v } } : x)) }))}
          options={optionsToUse}
          placeholder={`Select ${String(f.label || titleCase(f.key)).toLowerCase()}...`}
        />
      ) : (
        <input
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
          value={value}
          onChange={(e) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [f.key]: (e.target as HTMLInputElement).value } } : x)) }))}
          placeholder={String(f.label || titleCase(f.key))}
        />
      );
      return (
        <div key={f.key} className={colClass}>
          <label className="block text-xs text-zinc-400 mb-1">{f.label || titleCase(f.key)}</label>
          {control}
        </div>
      );
    });

    // MacBook/iMac additions: add Screen Size field globally; add CPU field if missing (Apple Devices family)
    if (isMacBookContext || isIMacContext) {
      const setField = (key: string, v: string) => setSales((s) => ({
        ...s,
        items: s.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [key]: v } } : x))
      }));
      const screenSizeVal = (it.dynamic || ({} as any)).screenSize || '';
      // Comprehensive sizes per family
      const macBookSizes = [
        '11.6"', // MacBook Air 11"
        '12"',   // 12-inch MacBook
        '13.3"', // Classic Air/Pro
        '13.6"', // M2 Air 13.6
        '14"', '14.2"', // 14-inch MBP (marketed 14, actual 14.2)
        '15"', '15.3"', '15.4"', // 15-inch Air (15.3) and older Pro (15.4)
        '16"', '16.2"' // 16-inch MBP (marketed 16, actual 16.2)
      ];
      const iMacSizes = [
        '21.5"',
        '24"',
        '27"'
      ];
      const screenSizes = isIMacContext ? iMacSizes : macBookSizes;
      // If a screenSize control isn't already defined, insert it just before 'Ports' (or nearest fallback)
      const hasScreenSize = effectiveFields.some((f: any) => f.key === 'screenSize');
      if (!hasScreenSize) {
        // Determine insert index using base field order
        let insertAt = effectiveFields.findIndex((f: any) => f.key === 'ports');
        if (insertAt < 0) insertAt = effectiveFields.findIndex((f: any) => f.key === 'accessories');
        if (insertAt < 0) insertAt = fieldNodes.length; // fallback: append at end
        fieldNodes.splice(
          Math.max(0, Math.min(insertAt, fieldNodes.length)),
          0,
          (
            <div key="screenSize" className={wideKeys.has('screenSize') ? 'col-span-4' : 'col-span-2'}>
              <label className="block text-xs text-zinc-400 mb-1">Screen Size</label>
              <ComboInput value={screenSizeVal} onChange={(v) => setField('screenSize', v)} options={screenSizes} placeholder="Select screen size..." />
            </div>
          )
        );
      }
      // If in Apple Devices (no CPU field present), add CPU dropdown; else CPU exists and is already overridden above
      const cpuVal = (it.dynamic || ({} as any)).cpu || '';
      const hasCpuField = effectiveFields.some((f: any) => f.key === 'cpu');
      if (!hasCpuField && dt?.type === 'Apple Devices') {
        let cpuOptions: string[];
        if (isIMacContext) {
          const intelIMac = ['Intel Core i3','Intel Core i5','Intel Core i7','Intel Core i9','Intel Xeon W'];
          const appleIMac = ['M1','M3'];
          cpuOptions = [...intelIMac, ...appleIMac, 'Other'];
        } else if (isMacMiniContext) {
          const intelMini = ['Intel Core i3','Intel Core i5','Intel Core i7'];
          const appleMini = ['M1','M2','M2 Pro'];
          cpuOptions = [...intelMini, ...appleMini, 'Other'];
        } else if (isMacStudioContext) {
          const appleStudio = ['M1 Max','M1 Ultra','M2 Max','M2 Ultra'];
          cpuOptions = [...appleStudio, 'Other'];
        } else if (isMacProContext) {
          const xeonPro = ['Intel Xeon W-3223','Intel Xeon W-3235','Intel Xeon W-3245','Intel Xeon W-3265','Intel Xeon W-3275','Intel Xeon W (Other)'];
          const applePro = ['M2 Ultra'];
          cpuOptions = [...xeonPro, ...applePro, 'Other'];
        } else {
          const intelMacBook = ['Intel Core i5','Intel Core i7'];
          const appleMacBook = ['M1','M1 Pro','M1 Max','M2','M2 Pro','M2 Max','M3','M3 Pro','M3 Max','M4','M4 Pro','M4 Max'];
          cpuOptions = [...intelMacBook, ...appleMacBook, 'Other'];
        }
        fieldNodes.push(
          <div key="cpu-macbook" className={wideKeys.has('cpu') ? 'col-span-4' : 'col-span-2'}>
            <label className="block text-xs text-zinc-400 mb-1">CPU</label>
            <ComboInput value={cpuVal} onChange={(v) => setField('cpu', v)} options={cpuOptions} placeholder="Select CPU..." />
          </div>
        );
      }
    }

    // Apple Watch additions: add Size (mm) and Band Color fields; ensure Color list is overridden above
    if (it.deviceType === 'Apple Devices' && isAppleWatchContext) {
      const setField = (key: string, v: string) => setSales((s) => ({
        ...s,
        items: s.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [key]: v } } : x))
      }));
      const sizeVal = (it.dynamic || ({} as any)).watchSize || '';
      const bandColorVal = (it.dynamic || ({} as any)).bandColor || '';
      const watchSizes = ['38 mm','40 mm','41 mm','42 mm','44 mm','45 mm','49 mm'];
      const bandColors = [
        'Midnight','Starlight','Black','White','Storm Blue','Clay','Cypress','Pink','(PRODUCT)RED','Orange','Yellow','Blue','Green','Purple','Beige','Brown','Gray','Graphite','Gold','Silver','Natural Titanium','Other'
      ];
      // Insert Size right after Color when possible
      let insertAfter = effectiveFields.findIndex((f: any) => f.key === 'color');
      if (insertAfter < 0) insertAfter = fieldNodes.length - 1;
      const sizeNode = (
        <div key="watchSize" className={wideKeys.has('screen') ? 'col-span-4' : 'col-span-2'}>
          <label className="block text-xs text-zinc-400 mb-1">Size (mm)</label>
          <ComboInput value={sizeVal} onChange={(v) => setField('watchSize', v)} options={watchSizes} placeholder="Select size..." />
        </div>
      );
      fieldNodes.splice(Math.max(0, insertAfter + 1), 0, sizeNode);
      // Insert Band Color right after Size
      const bandNode = (
        <div key="bandColor" className={wideKeys.has('screen') ? 'col-span-4' : 'col-span-2'}>
          <label className="block text-xs text-zinc-400 mb-1">Band Color</label>
          <ComboInput value={bandColorVal} onChange={(v) => setField('bandColor', v)} options={bandColors} placeholder="Select band color..." />
        </div>
      );
      // Recompute insertion point: after the just-inserted size
      insertAfter = Math.min(fieldNodes.length - 1, Math.max(0, insertAfter + 1));
      fieldNodes.splice(Math.max(0, insertAfter + 1), 0, bandNode);
    }

  // Apple Devices: ensure an Accessories text field exists for all Apple items (insert after Ports when present)
  if (it.deviceType === 'Apple Devices' && !isAppleTVContext) {
      const hasAccessories = effectiveFields.some((f: any) => f.key === 'accessories');
      if (!hasAccessories) {
        const accessoriesVal = (it.dynamic || ({} as any)).accessories || '';
        // Insert after 'ports' if present; else append at end
        let insertAt = effectiveFields.findIndex((f: any) => f.key === 'ports');
        if (insertAt < 0) insertAt = fieldNodes.length - 1;
        fieldNodes.splice(
          Math.max(0, insertAt + 1),
          0,
          (
            <div key="accessories" className="col-span-12">
              <label className="block text-xs text-zinc-400 mb-1">Accessories</label>
              <input
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
                value={accessoriesVal}
                onChange={(e) => setSales((s) => ({
                  ...s,
                  items: s.items.map((x, i) => (i === idx
                    ? { ...x, dynamic: { ...(x.dynamic || {}), accessories: (e.target as HTMLInputElement).value } }
                    : x))
                }))}
                placeholder="Accessories (included items, cables, box, etc.)"
              />
            </div>
          )
        );
      }
    }

    // Gaming Laptop: add two simple text boxes under Display Resolution and above Ports
    if (dt?.type === 'Gaming Laptop') {
      const s1 = (it.dynamic || ({} as any)).bootDriveType || '';
      const s2 = (it.dynamic || ({} as any)).bootDriveStorage || '';
      const setField = (key: 'bootDriveType' | 'bootDriveStorage', v: string) => setSales((s) => ({
        ...s,
        items: s.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [key]: v } } : x))
      }));
      // Options for dropdowns
      const driveTypeOptions = ['M.2 NVMe','SATA SSD','HDD','NVMe (SATA)','eMMC','Integrated','External','Other'];
      const storageSizeOptions = ['128 GB','256 GB','500 GB','512 GB','1 TB','2 TB','4 TB','8 TB','Other'];
  // Place directly above the Ports field; fallback above Accessories; else append at end
  // IMPORTANT: compute index from effectiveFields (not from fieldNodes element keys, which aren't accessible)
  let insertAt = effectiveFields.findIndex((f: any) => f.key === 'ports');
  if (insertAt < 0) insertAt = effectiveFields.findIndex((f: any) => f.key === 'accessories');
  if (insertAt < 0) insertAt = fieldNodes.length;

      // Insert a full-width break to force a brand-new row, then the boot row starting at the far left
      const bootBreak = (<div key="gl-boot-break" className="col-span-16" />);
      // Optional second storage toggle
      const addSecond = Boolean((it.dynamic as any)?.addSecondStorage);
      const setAddSecond = (v: boolean) => setSales((s) => ({
        ...s,
        items: s.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), addSecondStorage: v } } : x))
      }));
      // Wrapper row spanning full width so fields start at left; single row with two columns
      const bootWrapper = (
        <div key="gl-boot-row" className="col-span-16 col-start-1 mt-3">
          <div className="flex items-end gap-2">
            <div className="grid grid-cols-16 gap-2 flex-1">
              <div className="col-span-8">
                <label className="block text-xs text-zinc-400 mb-1">Boot Drive Type</label>
                <ComboInput
                  value={s1}
                  onChange={(v) => setField('bootDriveType', v)}
                  options={driveTypeOptions}
                  placeholder="Select drive type..."
                />
              </div>
              <div className="col-span-8">
                <label className="block text-xs text-zinc-400 mb-1">Storage Size</label>
                <ComboInput
                  value={s2}
                  onChange={(v) => setField('bootDriveStorage', v)}
                  options={storageSizeOptions}
                  placeholder="Select storage size..."
                />
              </div>
            </div>
            {!addSecond && (
              <button
                type="button"
                className="self-end px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded whitespace-nowrap"
                onClick={() => setAddSecond(true)}
              >
                + Add second storage
              </button>
            )}
          </div>
        </div>
      );
      fieldNodes.splice(Math.max(0, insertAt), 0, bootBreak, bootWrapper);

      if (addSecond) {
        const s2t = (it.dynamic || ({} as any)).secondaryStorage1Type || '';
        const s2s = (it.dynamic || ({} as any)).secondaryStorage1Storage || '';
        const setSecond = (key: 'secondaryStorage1Type' | 'secondaryStorage1Storage', v: string) => setSales((s) => ({
          ...s,
          items: s.items.map((x, i) => (i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), [key]: v } } : x))
        }));
        const secondWrapper = (
          <div key="gl-second-row" className="col-span-16 col-start-1 mt-2">
            <div className="flex items-end gap-2">
              <div className="grid grid-cols-16 gap-2 flex-1">
                <div className="col-span-8">
                  <label className="block text-xs text-zinc-400 mb-1">2nd Storage Type</label>
                  <ComboInput
                    value={s2t}
                    onChange={(v) => setSecond('secondaryStorage1Type', v)}
                    options={driveTypeOptions}
                    placeholder="Select drive type..."
                  />
                </div>
                <div className="col-span-8">
                  <label className="block text-xs text-zinc-400 mb-1">2nd Storage Size</label>
                  <ComboInput
                    value={s2s}
                    onChange={(v) => setSecond('secondaryStorage1Storage', v)}
                    options={storageSizeOptions}
                    placeholder="Select storage size..."
                  />
                </div>
              </div>
              <button
                type="button"
                className="self-end px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded whitespace-nowrap"
                onClick={() => setAddSecond(false)}
              >
                Remove second storage
              </button>
            </div>
          </div>
        );
        fieldNodes.splice(Math.max(0, insertAt + 2), 0, secondWrapper);
      }
    }

    // If this is a Drone, append the ad-hoc droneSpecs editor (behaves like 'Other')
    if (dt?.type === 'Drone') {
      const specs: Array<{ desc?: string; value?: string }> = Array.isArray((it.dynamic as any)?.droneSpecs) ? (it.dynamic as any).droneSpecs : [];
      const specsNode = (
        <div key="drone-specs" className="col-span-16">
          <div className="text-xs text-zinc-400">Additional Drone specifications</div>
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <button type="button" className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={() => addDroneSpec(idx)}>+ Add spec</button>
            </div>
            <div className="mt-2">
              <div className="flex flex-col gap-2">
                {specs.map((s, si) => (
                  <div key={`drone-spec-${si}`} className="flex items-center gap-2">
                    <input className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" placeholder="Spec Description" value={s?.desc || ''} onChange={(e) => updateDroneSpecField(idx, si, 'desc', (e.target as HTMLInputElement).value)} />
                    <input className="w-48 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" placeholder="Spec Value" value={s?.value || ''} onChange={(e) => updateDroneSpecField(idx, si, 'value', (e.target as HTMLInputElement).value)} />
                    <button className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" title="Remove" onClick={() => removeDroneSpec(idx, si)}>Remove</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
      return [...fieldNodes, specsNode];
    }

    return fieldNodes;
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-gray-100 p-4">
      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-4">
        {/* Main content */}
  <div className="col-span-9 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={publicAsset('logo.png')} alt="Logo" className="w-10 h-10 object-contain" />
              <h1 className="text-2xl font-bold text-[#39FF14]">Generate Quote</h1>
            </div>
            <div className="flex items-center gap-2" />
          </div>

        {mode === 'sales' && (
          <div className="bg-zinc-800 border border-zinc-700 rounded p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer Name" value={sales.customerName} onChange={(v) => setSales((s) => ({ ...s, customerName: v }))} />
              <Field label="Customer Phone" value={sales.customerPhone} onChange={(v) => setSales((s) => ({ ...s, customerPhone: v }))} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200">Items</h3>
                <button className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={addSaleItem}>+ Add Item</button>
              </div>
              <div className="space-y-2">
                {sales.items.map((it, idx) => (
                  <div key={idx} className="border border-zinc-700 rounded p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-zinc-300">{(String(((it.model ?? (it as any).dynamic?.model) || '')).trim()) || it.description || `Item ${idx + 1}`}</div>
                      <div className="flex justify-end gap-1">
                        <button className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" title={it.expanded ? 'Hide details' : 'Show details'} onClick={() => toggleSaleItemExpanded(idx)}>{it.expanded ? 'v' : '>'}</button>
                        <button className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" title="Remove" onClick={() => removeSaleItem(idx)}>Remove</button>
                      </div>
                    </div>
                    {it.expanded && (
                      <div className="mt-2 grid grid-cols-16 gap-2">
                        {/* Images at the top */}
                        {it.deviceType !== 'Custom PC' && (
                        <div className="col-span-16">
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs text-zinc-400">Images (max 3)</label>
                            <button className="px-2 py-0.5 text-xs bg-zinc-700 border border-zinc-600 rounded disabled:opacity-50" disabled={(it.images?.length || 0) >= 3} onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = 'image/*';
                              input.multiple = true;
                              input.onchange = (e: any) => addImagesToItem(idx, (e.target as HTMLInputElement).files);
                              input.click();
                            }}>Add Image</button>
                          </div>
                          <div className="flex gap-2 items-center overflow-x-auto whitespace-nowrap min-h-[40px]">
                            {it.images && it.images.length > 0 ? (
                              it.images.map((src, i) => (
                                <div key={i} className="relative w-20 h-20 flex-none border border-zinc-700 rounded overflow-hidden">
                                  <img src={src} alt={`Item ${idx + 1} Image ${i + 1}`} className="w-full h-full object-cover" />
                                  <button className="absolute top-0 right-0 m-0.5 bg-black/70 text-white text-[10px] leading-none px-1 rounded" onClick={() => removeImageFromItem(idx, i)} title="Remove">X</button>
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-zinc-500">No images added</div>
                            )}
                          </div>
                        </div>
                        )}
                        <div className={it.deviceType === 'Custom PC' ? 'col-span-16' : 'col-span-4'}>
                          <label className="block text-xs text-zinc-400 mb-1">Device Type</label>
                          <ComboInput
                            value={it.deviceType || ''}
                            onChange={(v) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, deviceType: v || undefined, dynamic: {} } : x)) }))}
                            options={deviceTypeOptions}
                            placeholder="Type or select..."
                          />
                          {/* If Apple Devices, render the Apple family selector inline beneath Device Type to preserve a single row for Device Type/Model/Condition */}
                          {it.deviceType === 'Apple Devices' && (() => {
                            const appleDeviceOptions = deviceTypes
                              .find((d) => d.type === 'Apple Devices')?.fields
                              .find((f) => f.key === 'device')?.options || ['iPhone', 'iPad', 'MacBook', 'iMac'];
                            return (
                              <div className="mt-1">
                                <label className="sr-only">Apple Family</label>
                                <ComboInput
                                  value={it.dynamic?.device || ''}
                                  onChange={(v) =>
                                    setSales((s) => ({
                                      ...s,
                                      items: s.items.map((x, i) => (
                                        i === idx ? { ...x, dynamic: { ...(x.dynamic || {}), device: v } } : x
                                      )),
                                    }))
                                  }
                                  options={appleDeviceOptions}
                                  placeholder="Apple family..."
                                />
                              </div>
                            );
                          })()}
                        </div>
                        {it.deviceType !== 'Custom PC' && (
                          <>
                            <div className="col-span-8">
                              <label className="block text-xs text-zinc-400 mb-1">Model</label>
                              {it.deviceType === 'Apple Devices' && (() => {
                                // Provide a dropdown for Apple TV models; fallback to text for other families
                                const family = String(((it.dynamic || ({} as any)).device || '')).toLowerCase();
                                const isAppleTV = family.includes('apple tv');
                                const isHomePod = family.includes('homepod');
                                if (isAppleTV) {
                                  const appleTvModels = [
                                    'Apple TV (2nd Gen) - 8 GB',
                                    'Apple TV (3rd Gen) - 8 GB',
                                    'Apple TV HD (2015) - 32 GB',
                                    'Apple TV 4K (2017) - 32 GB',
                                    'Apple TV 4K (2017) - 64 GB',
                                    'Apple TV 4K (2021) - 32 GB',
                                    'Apple TV 4K (2021) - 64 GB',
                                    'Apple TV 4K (2022) - 64 GB (Wi-Fi)',
                                    'Apple TV 4K (2022) - 128 GB (Wi-Fi + Ethernet)',
                                    'Other'
                                  ];
                                  return (
                                    <ComboInput
                                      value={it.model || ''}
                                      onChange={(v) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, model: v } : x)) }))}
                                      options={appleTvModels}
                                      placeholder="Select model..."
                                    />
                                  );
                                } else if (isHomePod) {
                                  const homePodModels = [
                                    'HomePod (1st Gen)',
                                    'HomePod (2nd Gen)',
                                    'HomePod mini',
                                    'Other'
                                  ];
                                  return (
                                    <ComboInput
                                      value={it.model || ''}
                                      onChange={(v) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, model: v } : x)) }))}
                                      options={homePodModels}
                                      placeholder="Select model..."
                                    />
                                  );
                                }
                                return null;
                              })()}
                              {!(it.deviceType === 'Apple Devices' && (String(((it.dynamic || ({} as any)).device || '')).toLowerCase().includes('apple tv') || String(((it.dynamic || ({} as any)).device || '')).toLowerCase().includes('homepod'))) && (
                                <input
                                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
                                  value={it.model || ''}
                                  onChange={(e) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, model: e.target.value } : x)) }))}
                                  placeholder={it.deviceType ? `${it.deviceType} model` : 'Model'}
                                />
                              )}
                            </div>
                            <div className="col-span-4">
                              <label className="block text-xs text-zinc-400 mb-1">Condition</label>
                              <ComboInput
                                value={it.condition || ''}
                                onChange={(v) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, condition: v } : x)) }))}
                                options={['New', 'Like New', 'Excellent', 'Good', 'Fair', 'Poor', 'For Parts']}
                                placeholder="Type or select..."
                              />
                            </div>
                          </>
                        )}
                        {renderDynamicFields(it, idx)}

                        {/* Price will be shown next to the AI paste box to improve alignment */}

                        {/* AI Copy Prompt button + response textarea under all fields (except Custom Build) */}
                        {it.deviceType !== 'Custom Build' && (
                        <div className="col-span-12 mt-2">
                          <div className="mb-2">
                            <div className="text-xs text-zinc-400">Generate a ready-to-use AI prompt for this item.</div>
                          </div>
                          <label className="block text-xs text-zinc-400 mb-1">AI Response (paste/edit)</label>
                          <textarea
                            rows={8}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-y"
                            placeholder="Paste the AI-generated sales paragraph here."
                            value={it.prompt || ''}
                            onChange={(e) =>
                              setSales((s) => ({
                                ...s,
                                items: s.items.map((x, i) => (i === idx ? { ...x, prompt: e.target.value } : x)),
                              }))
                            }
                          />
                          <div className="flex items-center justify-end mt-2">
                            <button
                              className="px-3 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded hover:bg-zinc-600"
                              onClick={() => copyPromptForItem(idx)}
                              title="Copy AI prompt to clipboard"
                            >
                              Copy AI Prompt
                            </button>
                          </div>
                        </div>
                        )}
                        {it.deviceType !== 'Custom Build' && it.deviceType !== 'Custom PC' && (
                        <div className="col-span-8 grid grid-cols-8 gap-2 items-start">
                          <div className="col-span-4">
                            <label className="block text-xs text-zinc-400 mb-1">Source URL</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="url"
                                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
                                value={it.url || ''}
                                onChange={(e) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, url: (e.target as HTMLInputElement).value } : x)) }))}
                                placeholder="https://example.com/product"
                              />
                              <button
                                type="button"
                                className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded hover:bg-zinc-600"
                                onClick={async () => {
                                  try {
                                    const u = (it.url || '').trim();
                                    if (!u) return;
                                    // Try to open via preload API; fallback to window.open
                                    if ((window as any).api?.openUrl) {
                                      await (window as any).api.openUrl(u);
                                    } else {
                                      window.open(u, '_blank');
                                    }
                                  } catch (_) {
                                    try { window.open((it.url || ''), '_blank'); } catch {}
                                  }
                                }}
                                disabled={!it.url}
                                title="Open in default browser"
                              >Open</button>
                            </div>
                            <div className="text-[10px] text-zinc-400 mt-0.5">Optional link to supplier or reference</div>
                          </div>
                          <div className="col-span-4 mt-2">
                            <label className="block text-xs text-zinc-400 mb-1">Price</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-full bg-yellow-200 text-black border border-yellow-400 rounded px-2 py-1 text-sm"
                              value={it.price || ''}
                              onChange={(e) => setSales((s) => ({ ...s, items: s.items.map((x, i) => (i === idx ? { ...x, price: e.target.value } : x)) }))}
                              placeholder="Enter base price"
                            />
                            <div className="text-[10px] text-zinc-400 mt-0.5">Printed total is before tax</div>
                          </div>
                        </div>
                        )}
                        
                        
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {mode === 'repairs' && (
          <div className="bg-zinc-800 border border-zinc-700 rounded p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer Name" value={repairs.customerName} onChange={(v) => setRepairs((s) => ({ ...s, customerName: v }))} />
              <Field label="Customer Phone" value={repairs.customerPhone} onChange={(v) => setRepairs((s) => ({ ...s, customerPhone: v }))} />
            </div>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <label className="block text-xs text-zinc-400 mb-1">Device Category</label>
                <select className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" value={repairs.selectedCategoryId} onChange={(e) => setRepairs((s) => ({ ...s, selectedCategoryId: e.target.value, selectedRepairId: '' }))} onFocus={(e) => (e.target as HTMLSelectElement).showPicker?.()}>
                  <option value="">All</option>
                </select>
              </div>
              <div className="col-span-6">
                <label className="block text-xs text-zinc-400 mb-1">Repair</label>
                <select className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm" value={repairs.selectedRepairId} onChange={(e) => setRepairs((s) => ({ ...s, selectedRepairId: e.target.value }))} onFocus={(e) => (e.target as HTMLSelectElement).showPicker?.()}>
                  <option value="">Select...</option>
                </select>
              </div>
              <div className="col-span-2 flex items-end"><button className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm disabled:opacity-50" disabled={!repairs.selectedRepairId} onClick={addSelectedRepairLine}>Add</button></div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <h3 className="text-sm font-semibold text-zinc-200">Lines</h3>
              <button className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={addRepairLine}>+ Add Line</button>
            </div>
            <div className="space-y-2">
              {repairs.lines.map((ln, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-7"><Field label="Description" value={ln.description} onChange={(v) => setRepairs((r) => ({ ...r, lines: r.lines.map((x, i) => (i === idx ? { ...x, description: v } : x)) }))} /></div>
                  <div className="col-span-2"><Field label="Part Price" value={ln.partPrice} onChange={(v) => setRepairs((r) => ({ ...r, lines: r.lines.map((x, i) => (i === idx ? { ...x, partPrice: v } : x)) }))} /></div>
                  <div className="col-span-2"><Field label="Labor Price" value={ln.laborPrice} onChange={(v) => setRepairs((r) => ({ ...r, lines: r.lines.map((x, i) => (i === idx ? { ...x, laborPrice: v } : x)) }))} /></div>
                  <div className="col-span-1 flex justify-end"><button className="px-2 py-1 text-xs bg-zinc-700 border border-zinc-600 rounded" title="Remove" onClick={() => removeRepairLine(idx)}>Remove</button></div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <Field label="Notes" value={repairs.notes} onChange={(v) => setRepairs((s) => ({ ...s, notes: v }))} />
              <div className="col-span-2 bg-zinc-900 border border-zinc-700 rounded p-2">
                <div className="text-sm flex items-center justify-between"><span className="text-zinc-400">Parts</span><span className="font-semibold">${repairTotals.parts.toFixed(2)}</span></div>
                <div className="text-sm flex items-center justify-between mt-1"><span className="text-zinc-400">Labor</span><span className="font-semibold">${repairTotals.labor.toFixed(2)}</span></div>
                <div className="text-sm flex items-center justify-between mt-1"><span className="text-zinc-400">Total</span><span className="font-bold text-[#39FF14]">${repairTotals.total.toFixed(2)}</span></div>
              </div>
            </div>
          </div>
        )}

          <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-zinc-400 h-6 flex items-center">{saveMsg}</div>
          <div className="flex flex-wrap items-center gap-1">
            <button className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-xs disabled:opacity-50 whitespace-nowrap" disabled={saving} onClick={saveQuote}>{saving ? 'Saving...' : 'Save Quote'}</button>
            <button
              className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-xs whitespace-nowrap"
              onClick={openHtmlPreview}
            >HTML Preview</button>
            <button className="px-3 py-1.5 bg-[#39FF14] text-black rounded text-sm font-semibold hover:bg-[#32E610] whitespace-nowrap" onClick={printPreview}>Print Preview</button>
          </div>
          </div>

          {showHtmlPreview && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={closeHtmlPreview}>
              <div className="absolute top-3 right-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-base font-semibold hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                  onClick={async () => {
                    try {
                      if (mode !== 'sales') return;
                      const html = await generateInteractiveSalesHtml();
                      const name = `Quote-${(sales.customerName || '').trim() || 'Customer'}`;
                      const api = (window as any).api;
                      if (api && typeof api.exportHtml === 'function') {
                        const res = await api.exportHtml(html, name);
                        if (res?.ok) { setSaveMsg('Saved interactive HTML'); } else if (!res?.canceled) { setSaveMsg('Could not save HTML'); }
                      } else {
                        downloadTextFile(`${name}.html`, html, 'text/html');
                        setSaveMsg('Downloaded interactive HTML');
                      }
                      setTimeout(() => setSaveMsg(null), 2000);
                    } catch {
                      setSaveMsg('Failed to export HTML'); setTimeout(() => setSaveMsg(null), 2000);
                    }
                  }}
                >Download</button>
                <button
                  className="px-4 py-2 bg-zinc-900 text-gray-100 border border-zinc-700 rounded-md text-base font-semibold hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#39FF14]/60"
                  onClick={sendHtmlToGmail}
                >Send to Email</button>
                <button
                  className="px-4 py-2 bg-zinc-800 text-gray-100 border border-zinc-700 rounded-md text-base font-semibold hover:bg-zinc-700"
                  onClick={openEmailSettings}
                >Email Settings</button>
                <button
                  className="px-4 py-2 bg-zinc-800 text-gray-100 border border-zinc-700 rounded-md text-base font-semibold hover:bg-zinc-700"
                  onClick={closeHtmlPreview}
                >Close</button>
              </div>

              {showEmailModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]" onClick={() => { if (!emailSending) setShowEmailModal(false); }}>
                  <div className="bg-zinc-900 text-gray-100 border border-zinc-700 rounded-lg w-[720px] max-w-[95vw] p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-lg font-semibold">Send Quote Email</div>
                      <button className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded" onClick={() => { if (!emailSending) setShowEmailModal(false); }}>Close</button>
                    </div>
                    <div className="mt-3 grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-12">
                        <div className="text-xs text-zinc-400 mb-1">To</div>
                        <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="customer@email.com" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded" />
                      </div>
                      <div className="col-span-12">
                        <div className="text-xs text-zinc-400 mb-1">From Name (shows as sender name)</div>
                        <input value={emailFromName} onChange={(e) => setEmailFromName(e.target.value)} placeholder="GadgetBoy Repair & Retail" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded" />
                      </div>
                      {!emailHasPassword && (
                        <div className="col-span-12">
                          <div className="text-xs text-zinc-400 mb-1">Gmail App Password (for gadgetboysc@gmail.com)</div>
                          <input value={emailAppPassword} onChange={(e) => setEmailAppPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded" />
                          <div className="text-[11px] text-zinc-400 mt-1">This is an App Password from Google (not your normal password). It is stored encrypted in the app's userData.</div>
                        </div>
                      )}
                    </div>
                    {emailErr && (<div className="mt-3 text-sm text-red-300">{emailErr}</div>)}
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded" disabled={emailSending} onClick={() => setShowEmailModal(false)}>Cancel</button>
                      <button className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded" disabled={emailSending} onClick={openEmailSettings}>Email Settings</button>
                      <button className="px-4 py-2 bg-[#39FF14] text-black font-semibold rounded" disabled={emailSending} onClick={doSendEmail}>{emailSending ? 'Sending...' : 'Send'}</button>
                    </div>
                  </div>
                </div>
              )}

              {showEmailSettings && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70]" onClick={() => { if (!emailSettingsSaving) setShowEmailSettings(false); }}>
                  <div className="bg-zinc-900 text-gray-100 border border-zinc-700 rounded-lg w-[760px] max-w-[95vw] p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-lg font-semibold">Email Settings</div>
                      <button className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded" onClick={() => { if (!emailSettingsSaving) setShowEmailSettings(false); }}>Close</button>
                    </div>

                    <div className="mt-3">
                      <div className="text-xs text-zinc-400 mb-1">Sender Address</div>
                      <div className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm">gadgetboysc@gmail.com</div>
                    </div>

                    <div className="mt-3">
                      <div className="text-xs text-zinc-400 mb-1">Sender Display Name</div>
                      <input value={emailFromName} onChange={(e) => setEmailFromName(e.target.value)} className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded" />
                    </div>

                    <div className="mt-3">
                      <div className="text-xs text-zinc-400 mb-1">Gmail App Password</div>
                      <div className="text-[11px] text-zinc-400 mb-2">Required to send mail from inside the app. Stored encrypted in userData via Electron safeStorage.</div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm">Status:</div>
                        <div className={`text-sm font-semibold ${emailHasPassword ? 'text-[#39FF14]' : 'text-yellow-200'}`}>{emailHasPassword ? 'Configured' : 'Not configured'}</div>
                        <div className="flex-1" />
                        {emailHasPassword && (
                          <button className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded" disabled={emailSettingsSaving} onClick={clearEmailPassword}>Clear Password</button>
                        )}
                      </div>
                      <input value={emailAppPassword} onChange={(e) => setEmailAppPassword(e.target.value)} placeholder={emailHasPassword ? 'Paste to replace password (optional)' : 'Paste app password'} className="mt-2 w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded" />
                    </div>

                    {emailSettingsErr && (<div className="mt-3 text-sm text-red-300">{emailSettingsErr}</div>)}

                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded" disabled={emailSettingsSaving} onClick={() => setShowEmailSettings(false)}>Cancel</button>
                      <button className="px-4 py-2 bg-[#39FF14] text-black font-semibold rounded" disabled={emailSettingsSaving} onClick={saveEmailSettings}>{emailSettingsSaving ? 'Saving...' : 'Save Settings'}</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white text-black w-[1100px] max-w-[95vw] max-h-[90vh] overflow-hidden rounded shadow-xl" onClick={(e) => e.stopPropagation()}>
                {htmlPreviewUrl ? (
                  <iframe
                    title="HTML Preview"
                    src={htmlPreviewUrl}
                    className="w-full h-[90vh]"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                  />
                ) : (
                  <div className="p-6 text-sm">Loading...</div>
                )}
              </div>
            </div>
          )}

          {showPreview && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowPreview(false)}>
            {/* Floating toolbar outside the scrollable preview so Print is always accessible */}
            <div className="absolute top-3 right-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                className="px-4 py-2 bg-zinc-900 text-gray-100 border border-zinc-700 rounded-md text-base font-semibold hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#39FF14]/60"
                onClick={printDocument}
              >Print</button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-base font-semibold hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                onClick={() => {
                  try {
                    if (mode !== 'sales') return;
                    const cust = (sales.customerName || '').trim() || 'Customer';
                    const html = buildSalesPrintHtml();
                    // Word can open HTML when saved with .doc extension
                    downloadTextFile(`Quote-${cust}-print.doc`, html, 'application/msword');
                  } catch {
                    setSaveMsg('Could not save'); setTimeout(() => setSaveMsg(null), 2000);
                  }
                }}
              >Save</button>
            </div>
            <div id="quote-print-root" className="bg-white text-black w-[1100px] max-w-[95vw] max-h-[90vh] overflow-auto rounded shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                {mode === 'sales' ? (
                  <div>
                    <style>{`
                      @media print {
                        @page { size: A4; margin: 12mm; }
                        /* Page control helpers */
                        .page-break { page-break-after: always; }
                        .print-page { page-break-after: always; page-break-inside: avoid; break-inside: avoid; }
                        .print-page:last-of-type { page-break-after: auto; }
                        /* Hide everything except the print root */
                        body * { visibility: hidden !important; }
                        #quote-print-root, #quote-print-root * { visibility: visible !important; }
                        /* Ensure the print container lays out from the top and is not clipped */
                        #quote-print-root { position: static !important; inset: auto !important; box-shadow: none !important; background: transparent !important; max-height: none !important; overflow: visible !important; width: auto !important; height: auto !important; }
                      }
                    `}</style>
                    {/* Custom PC/Build preview pages OR default device view */}
                    {(() => {
                      const first = sales.items[0];
                      const isCustom = !!first && /custom/i.test(String(first?.deviceType || (first as any)?.deviceCategory || (first as any)?.category || ''));
                      if (!first) return null;
                      if (isCustom) {
                        const dyn: any = first.dynamic || {};
                        type Part = { label: string; key: string; desc: string; priceRaw: number; priceMarked: number; image?: string; image2?: string };
                        const baseParts: Array<{ key: string; label: string }> = [
                          { key: 'case', label: 'Case' },
                          { key: 'motherboard', label: 'Motherboard' },
                          { key: 'cpu', label: 'Processor' },
                          { key: 'cooling', label: 'Cooling' },
                          { key: 'ram', label: 'Memory' },
                          { key: 'gpu', label: 'Graphics Card' },
                          { key: 'storage', label: 'Storage' },
                          { key: 'psu', label: 'PSU' },
                          { key: 'os', label: 'Operating System' },
                        ];
                        const parts: Part[] = [];
                        const buildDesc3 = (key: string) => {
                          const raw = String(dyn[key] || dyn[`${key}Info`] || '').trim();
                          const combine = (parts: (string|undefined)[]) => parts.filter(Boolean).map(String).map(s=>s.trim()).filter(Boolean).join(' | ');
                          switch (key) {
                            case 'cpu':
                              return combine([raw, dyn.cpuGen && `Gen ${dyn.cpuGen}`, dyn.cpuCores && `${dyn.cpuCores} cores`, dyn.cpuClock && `${dyn.cpuClock}`]) || raw;
                            case 'ram':
                              return combine([raw, dyn.ramSize && `${dyn.ramSize}`, dyn.ramSpeed && `${dyn.ramSpeed}`, dyn.ramType && `${dyn.ramType}`]) || raw;
                            case 'gpu':
                              return combine([raw, dyn.gpuModel || dyn.gpu, dyn.gpuVram && `${dyn.gpuVram}`]) || raw;
                            case 'storage':
                              return combine([raw, dyn.storageType || dyn.bootDriveType, dyn.storageSize || dyn.bootDriveStorage]) || raw;
                            case 'motherboard':
                              return combine([raw, dyn.moboChipset && `Chipset: ${dyn.moboChipset}`, dyn.formFactor && `${dyn.formFactor}`]) || raw;
                            case 'psu':
                              return combine([raw, dyn.psuWatt && `${dyn.psuWatt}W`]) || raw;
                            case 'cooling':
                              return combine([raw, dyn.coolingType]) || raw;
                            case 'case':
                              return combine([raw, dyn.caseFormFactor && `${dyn.caseFormFactor}`]) || raw;
                            case 'os':
                              return raw || dyn.os || '';
                            default:
                              return raw;
                          }
                        };
                        baseParts.forEach(p => {
                          const desc = buildDesc3(p.key);
                          const priceRaw = Number(dyn[`${p.key}Price`] || 0) || 0;
                          const imagesArr = Array.isArray(dyn[`${p.key}Images`]) ? dyn[`${p.key}Images`] : [];
                          let image: string | undefined = dyn[`${p.key}Image`] ? String(dyn[`${p.key}Image`]) : undefined;
                          let image2: string | undefined = dyn[`${p.key}Image2`] ? String(dyn[`${p.key}Image2`]) : undefined;
                          if (!image && imagesArr[0]) image = String(imagesArr[0]);
                          if (!image2 && imagesArr[1]) image2 = String(imagesArr[1]);
                          if (!desc && !priceRaw && !image && !image2) return;
                          parts.push({ label: p.label, key: p.key, desc, priceRaw, priceMarked: priceRaw * 1.05, image, image2 });
                        });

                        // Peripherals (Custom PC) - render as line items directly under OS
                        const pcExtras = Array.isArray(dyn.pcExtras) ? dyn.pcExtras : [];
                        pcExtras.forEach((e: any, i: number) => {
                          const label = String(e?.label || e?.type || e?.name || '').trim() || 'Peripheral';
                          const desc = String(e?.desc || '').trim();
                          const priceRaw = Number(e?.price || 0) || 0;
                          const imagesArr = Array.isArray(e?.images) ? e.images : [];
                          let image: string | undefined = e?.image ? String(e.image) : undefined;
                          let image2: string | undefined = e?.image2 ? String(e.image2) : undefined;
                          if (!image && imagesArr[0]) image = String(imagesArr[0]);
                          if (!image2 && imagesArr[1]) image2 = String(imagesArr[1]);
                          if (!desc && !priceRaw && !image && !image2) return;
                          parts.push({ label, key: `pc-extra-${i}`, desc, priceRaw, priceMarked: priceRaw * 1.05, image, image2 });
                        });
                        const extras = Array.isArray(dyn.extraParts) ? dyn.extraParts : [];
                        extras.forEach((e: any) => {
                          const label = String(e?.name || 'Extra');
                          const desc = String(e?.desc || '').trim();
                          const priceRaw = Number(e?.price || 0) || 0;
                          const imagesArr = Array.isArray(e?.images) ? e.images : [];
                          let image: string | undefined = e?.image ? String(e.image) : undefined;
                          let image2: string | undefined = e?.image2 ? String(e.image2) : undefined;
                          if (!image && imagesArr[0]) image = String(imagesArr[0]);
                          if (!image2 && imagesArr[1]) image2 = String(imagesArr[1]);
                          if (!label && !desc && !priceRaw && !image && !image2) return;
                          parts.push({ label, key: `extra-${label}`, desc, priceRaw, priceMarked: priceRaw * 1.05, image, image2 });
                        });
                        const TAX_RATE = 0.08;
                        const laborRaw = Number(dyn.buildLabor || 0) || 0;
                        const chunk = <T,>(arr: T[], size: number) => { const out: T[][] = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };
                        const firstPageParts = parts.slice(0, 6);
                        const remainingParts = parts.slice(6);
                        const remainingChunks = chunk(remainingParts, 6);
                        const PartBox = (p: Part, idx: number) => {
                          if (String(p.key).toLowerCase() === 'os' || String(p.label).toLowerCase().includes('operating system')) {
                            return (
                              <div key={`os-${idx}`} style={{ display: 'grid', gridTemplateColumns: '42mm 1fr', columnGap: 10, alignItems: 'stretch', marginBottom: 8 }}>
                                <div />
                                <div style={{ border: '2px solid #FF0000', borderRadius: 6, padding: 8, minHeight: '22mm' }}>
                                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.label}</div>
                                  <div style={{ fontSize: '10.5pt', lineHeight: 1.35 }}>{p.desc || '-'}</div>
                                </div>
                              </div>
                            );
                          }
                          const imgs = [p.image, p.image2].filter(Boolean) as string[];
                          const left = imgs.length >= 2 ? (
                            <div style={{ width: '44mm', height: '34mm', display: 'flex', flexDirection: 'column', gap: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 4, padding: 4, boxSizing: 'border-box' }}>
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><img src={imgs[0]!} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} /></div>
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><img src={imgs[1]!} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} /></div>
                            </div>
                          ) : imgs.length === 1 ? (
                            <div style={{ width: '44mm', height: '34mm', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                              <img src={imgs[0]!} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
                            </div>
                          ) : (
                            <div style={{ width: '44mm', height: '34mm', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{ fontSize: '9pt', color: '#888' }}>No Image</div>
                            </div>
                          );
                          return (
                            <div key={`p-${idx}`} style={{ display: 'grid', gridTemplateColumns: '44mm 1fr', columnGap: 8, alignItems: 'stretch', marginBottom: 6 }}>
                              {left}
                              <div style={{ border: '2px solid #FF0000', borderRadius: 6, padding: 8, minHeight: '14mm', position: 'relative', boxSizing: 'border-box', textAlign: 'center' }}>
                                <div style={{ fontWeight: 800, fontSize: '14pt', marginTop: 2 }}>{p.label}</div>
                                <div style={{ fontSize: '11pt', lineHeight: 1.35, marginTop: 6, paddingLeft: 6, paddingRight: 6 }}>{p.desc || '-'}</div>
                                <div style={{ position: 'absolute', right: 6, bottom: 6, fontWeight: 700, fontSize: '11pt' }}>${(p.priceMarked || 0).toFixed(2)}</div>
                              </div>
                            </div>
                          );
                        };
                        const pricedParts = parts.filter(p => !(String(p.key).toLowerCase() === 'os' || String(p.label).toLowerCase().includes('operating system')));
                        const partsSubtotal = pricedParts.reduce((acc, p) => acc + (p.priceMarked || 0), 0);
                        const taxableParts = partsSubtotal;
                        const taxAmount = taxableParts * TAX_RATE;
                        const subtotalBeforeTax = taxableParts;
                        const totalAfterTax = taxableParts + taxAmount + laborRaw;
                        return (
                          <>
                            {/* Page 1: header + first 3 part boxes */}
                            <div className="print-page" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', border: '3px solid #FF0000', borderRadius: 8, padding: '12mm' }}>
                              <div className="flex items-start gap-4" style={{ marginBottom: 8 }}>
                                <img src={publicAsset('logo.png')} alt="GadgetBoy" style={{ height: '35mm', width: 'auto' }} />
                                <div className="flex-1" style={{ lineHeight: 1.2 }}>
                                  <div style={{ fontSize: '20pt', fontWeight: 700, letterSpacing: 0.2 }}>Gadgetboy Quote</div>
                                  <div style={{ fontSize: '13pt', fontWeight: 700 }}>GADGETBOY Repair & Retail</div>
                                  <div style={{ fontSize: '12pt' }}>2822 Devine Street, Columbia, SC 29205</div>
                                  <div style={{ fontSize: '12pt' }}>(803) 708-0101 | gadgetboysc@gmail.com</div>
                                  <div style={{ marginTop: 8, fontSize: '12pt' }}><strong>Customer:</strong> {sales.customerName || '-'} | <strong>Phone:</strong> {sales.customerPhone || ''}</div>
                                </div>
                              </div>
                              <div className="mt-2">
                                {firstPageParts.length ? firstPageParts.map(PartBox) : (
                                  <div style={{ border: '1px dashed #FF0000', padding: 10, textAlign: 'center', color: '#666' }}>No parts listed.</div>
                                )}
                              </div>
                            </div>
                            {/* Subsequent part pages */}
                            {remainingChunks.map((group, gi) => (
                              <React.Fragment key={`pg-${gi}`}>
                                <div className="page-break" style={{ height: 1 }} />
                                <div className="print-page" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', border: '3px solid #FF0000', borderRadius: 8, padding: '12mm' }}>
                                  <div className="page-inner">
                                    {group.map(PartBox)}
                                  </div>
                                </div>
                              </React.Fragment>
                            ))}
                            {/* Summary page */}
                            <div className="page-break" style={{ height: 1 }} />
                            <div className="print-page" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', border: '3px solid #FF0000', borderRadius: 8, padding: '12mm' }}>
                              <div className="page-inner">
                                <div style={{ fontWeight: 700, fontSize: '13pt', marginBottom: 6, textAlign: 'center' }}>Itemized Summary</div>
                                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '10pt' }}>
                                  <thead>
                                    <tr><th style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'left' }}>Component</th><th style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'right' }}>Price</th></tr>
                                  </thead>
                                  <tbody>
                                    {pricedParts.length ? pricedParts.map((p, i) => (
                                      <tr key={`sum-${i}`}><td style={{ border: '1px solid #FF0000', padding: 6 }}><b>{p.label}</b>{p.desc ? ` - ${p.desc}` : ''}</td><td style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'right' }}>${(p.priceMarked || 0).toFixed(2)}</td></tr>
                                    )) : (<tr><td colSpan={2} style={{ border: '1px solid #FF0000', padding: 8, textAlign: 'center', color: '#666' }}>No components listed.</td></tr>)}
                                  </tbody>
                                  <tfoot>
                                    <tr><td style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'right', fontWeight: 600 }}>Parts Subtotal</td><td style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'right', fontWeight: 600 }}>${partsSubtotal.toFixed(2)}</td></tr>
                                    <tr><td style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'right' }}>Build Labor (not taxed)</td><td style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'right' }}>${laborRaw.toFixed(2)}</td></tr>
                                    <tr><td style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'right', fontWeight: 600 }}>Subtotal (before tax)</td><td style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'right', fontWeight: 600 }}>${subtotalBeforeTax.toFixed(2)}</td></tr>
                                    <tr><td style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'right' }}>Tax on Parts ({(TAX_RATE*100).toFixed(0)}%)</td><td style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'right' }}>${taxAmount.toFixed(2)}</td></tr>
                                    <tr><td style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'right', fontWeight: 700 }}>Total (after tax)</td><td style={{ border: '1px solid #FF0000', padding: 6, textAlign: 'right', fontWeight: 700 }}>${totalAfterTax.toFixed(2)}</td></tr>
                                  </tfoot>
                                </table>
                                {/* Notes removed from summary; see Terms page for extended notes */}
                              </div>
                            </div>
                          </>
                        );
                      }
                      // Default non-custom flow
                      return (
                        <>
                          <div className="print-page" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', border: '3px solid #FF0000', borderRadius: 8, padding: '12mm' }}>
                            <div className="flex items-start gap-4" style={{ marginBottom: 8 }}>
                              <img src={publicAsset('logo.png')} alt="GadgetBoy" style={{ height: '35mm', width: 'auto' }} />
                              <div className="flex-1" style={{ lineHeight: 1.2 }}>
                                <div style={{ fontSize: '20pt', fontWeight: 700, letterSpacing: 0.2 }}>Gadgetboy Quote</div>
                                <div style={{ fontSize: '13pt', fontWeight: 700 }}>GADGETBOY Repair & Retail</div>
                                <div style={{ fontSize: '12pt' }}>2822 Devine Street, Columbia, SC 29205</div>
                                <div style={{ fontSize: '12pt' }}>(803) 708-0101 | gadgetboysc@gmail.com</div>
                                <div style={{ marginTop: 8, fontSize: '12pt' }}><strong>Customer:</strong> {sales.customerName || '-'} | <strong>Phone:</strong> {sales.customerPhone || ''}</div>
                              </div>
                            </div>
                            {sales.items.length > 0 && (() => {
                              const first = sales.items[0];
                              const modelForTitle = (String(((first.model ?? first.dynamic?.model) || '')).trim());
                              const title = (modelForTitle || '').length > 0 ? [first.brand, modelForTitle].filter(Boolean).join(' ').trim() : 'First Device';
                              const hasSpecs = !!(
                                (first.dynamic && Object.keys(first.dynamic || {}).length > 0) ||
                                first.deviceType || (first.dynamic && (first.dynamic as any).device) || first.model || first.condition || first.accessories
                              );
                              return (
                                <div className="mt-4">
                                  <div className="text-base font-semibold mb-2 text-center">{title}</div>
                                  {first.images && first.images.length > 0 && (
                                    <div className="mb-3 flex gap-3 flex-wrap justify-center items-center">
                                      {first.images.slice(0, 3).map((src, i) => (
                                            <img key={i} src={src} alt={`Device ${i + 1}`} style={{ maxHeight: '55mm', maxWidth: '55mm', objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 4, padding: 2 }} />
                                      ))}
                                    </div>
                                  )}
                                  {hasSpecs && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'end', columnGap: 12 }}>
                                      <div style={{ gridColumn: 2, textAlign: 'center', justifySelf: 'center' }}>
                                        <div className="rounded" style={{ fontSize: '12pt', border: '2px solid #FF0000', display: 'inline-block', padding: '12px 14px' }}>
                                          <div className="font-semibold mb-2" style={{ textAlign: 'center' }}>Specifications</div>
                                          <table style={{ borderCollapse: 'collapse', display: 'inline-table', width: 'auto', tableLayout: 'auto' }}>
                                            <tbody>
                                              {(() => {
                                                const rows: Array<[string, string]> = [];
                                                if (first.deviceType) rows.push(['Device Type', first.deviceType]);
                                                const appleFamily = (first.dynamic || ({} as any)).device as string | undefined;
                                                if (appleFamily) rows.push(['Apple Family', appleFamily]);
                                                if (first.model) rows.push(['Model', first.model]);
                                                if (first.condition) rows.push(['Condition', first.condition]);
                                                if (first.accessories) rows.push(['Accessories', first.accessories]);
                                                Object.entries(first.dynamic || {}).forEach(([k, v]) => {
                                                  if (k === 'device') return; // already included as Apple Family
                                                  rows.push([k, String(v ?? '')]);
                                                });
                                                const titleCase = (s: string) => {
                                                  return s
                                                    .replace(/[_-]+/g, ' ')
                                                    .split(' ')
                                                    .filter(Boolean)
                                                    .map((w) => {
                                                      const up = w.toUpperCase();
                                                      if (w.length <= 3 && w === up) return up; // keep acronyms
                                                      return w.charAt(0).toUpperCase() + w.slice(1);
                                                    })
                                                    .join(' ');
                                                };
                                                return rows.map(([k, v]) => (
                                                  <tr key={k}>
                                                    <td style={{ border: '1px solid #FF0000', padding: '6px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>{titleCase(k)}</td>
                                                    <td style={{ border: '1px solid #FF0000', padding: '6px 14px' }}>{v}</td>
                                                  </tr>
                                                ));
                                              })()}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                      {(() => {
                                        const base = parseFloat((first.price || '').toString());
                                        if (!isFinite(base) || base <= 0) return null;
                                        const shown = base * 1.15;
                                        return (
                                          <div style={{ gridColumn: 3, justifySelf: 'end' }}>
                                            <div style={{ display: 'inline-block', border: '1px solid #FF0000', padding: '6px 10px', borderRadius: 4, fontSize: '10pt', whiteSpace: 'nowrap', fontWeight: 700 }}>
                                              Total (before tax): ${shown.toFixed(2)}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                  {/* Fallback: show price alone aligned right if no specs */}
                                  {!hasSpecs && (() => {
                                    const base = parseFloat((first.price || '').toString());
                                    if (!isFinite(base) || base <= 0) return null;
                                    const shown = base * 1.15;
                                    return (
                                      <div style={{ textAlign: 'right', marginTop: 8 }}>
                                        <div style={{ display: 'inline-block', border: '1px solid #FF0000', padding: '6px 10px', borderRadius: 4, fontSize: '10pt', whiteSpace: 'nowrap', fontWeight: 700 }}>
                                          Total (before tax): ${shown.toFixed(2)}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                  {first.prompt && String(first.prompt).trim().length > 0 && (
                                    <div style={{ textAlign: 'center', fontSize: '13pt', lineHeight: 1.45, maxWidth: '180mm', marginLeft: 'auto', marginRight: 'auto', marginTop: 18, border: '2px solid #FF0000', borderRadius: 4, padding: '10px 12px' }}>
                                      {first.prompt}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                          {/* Additional device pages: one per remaining device */}
                          {sales.items.slice(1).map((item, idx) => (
                            <React.Fragment key={idx}>
                              <div className="page-break" style={{ height: 1 }} />
                              <div className="print-page" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', border: '3px solid #FF0000', borderRadius: 8, padding: '12mm' }}>
                                {(() => {
                                  const modelForTitle = String(((item.model ?? item.dynamic?.model) || '')).trim();
                                  const title = modelForTitle ? [item.brand, modelForTitle].filter(Boolean).join(' ').trim() : `Device ${idx + 2}`;
                                  const hasSpecs = !!(
                                    (item.dynamic && Object.keys(item.dynamic || {}).length > 0) ||
                                    item.deviceType || (item.dynamic && (item.dynamic as any).device) || item.model || item.condition || item.accessories
                                  );
                                  return (
                                    <div>
                                      <div className="text-base font-semibold mb-2 text-center">{title}</div>
                                      {item.images && item.images.length > 0 && (
                                        <div className="mb-3 flex gap-3 flex-wrap justify-center items-center">
                                          {item.images.slice(0, 3).map((src, i) => (
                                            <img key={i} src={src} alt={`Device ${i + 1}`} style={{ maxHeight: '55mm', maxWidth: '55mm', objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 4, padding: 2 }} />
                                          ))}
                                        </div>
                                      )}
                                      {hasSpecs && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'end', columnGap: 12 }}>
                                          <div style={{ gridColumn: 2, textAlign: 'center', justifySelf: 'center' }}>
                                            <div className="rounded" style={{ fontSize: '12pt', border: '2px solid #FF0000', display: 'inline-block', padding: '12px 14px' }}>
                                              <div className="font-semibold mb-2" style={{ textAlign: 'center' }}>Specifications</div>
                                              <table style={{ borderCollapse: 'collapse', display: 'inline-table', width: 'auto', tableLayout: 'auto' }}>
                                                <tbody>
                                                  {(() => {
                                                    const rows: Array<[string, string]> = [];
                                                    if (item.deviceType) rows.push(['Device Type', item.deviceType]);
                                                    const appleFamily = (item.dynamic || ({} as any)).device as string | undefined;
                                                    if (appleFamily) rows.push(['Apple Family', appleFamily]);
                                                    if (item.model) rows.push(['Model', item.model]);
                                                    if (item.condition) rows.push(['Condition', item.condition]);
                                                    if (item.accessories) rows.push(['Accessories', item.accessories]);
                                                    Object.entries(item.dynamic || {}).forEach(([k, v]) => {
                                                      if (k === 'device') return;
                                                      rows.push([k, String(v ?? '')]);
                                                    });
                                                    const titleCase = (s: string) => {
                                                      return s
                                                        .replace(/[_-]+/g, ' ')
                                                        .split(' ')
                                                        .filter(Boolean)
                                                        .map((w) => {
                                                          const up = w.toUpperCase();
                                                          if (w.length <= 3 && w === up) return up;
                                                          return w.charAt(0).toUpperCase() + w.slice(1);
                                                        })
                                                        .join(' ');
                                                    };
                                                    return rows.map(([k, v]) => (
                                                      <tr key={k}>
                                                        <td style={{ border: '1px solid #FF0000', padding: '6px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>{titleCase(k)}</td>
                                                        <td style={{ border: '1px solid #FF0000', padding: '6px 14px' }}>{v}</td>
                                                      </tr>
                                                    ));
                                                  })()}
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                          {(() => {
                                            const base = parseFloat((item.price || '').toString());
                                            if (!isFinite(base) || base <= 0) return null;
                                            const shown = base * 1.15;
                                            return (
                                              <div style={{ gridColumn: 3, justifySelf: 'end' }}>
                                                <div style={{ display: 'inline-block', border: '1px solid #FF0000', padding: '6px 10px', borderRadius: 4, fontSize: '10pt', whiteSpace: 'nowrap', fontWeight: 700 }}>
                                                  Total (before tax): ${shown.toFixed(2)}
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      )}
                                      {!hasSpecs && (() => {
                                        const base = parseFloat((item.price || '').toString());
                                        if (!isFinite(base) || base <= 0) return null;
                                        const shown = base * 1.15;
                                        return (
                                          <div style={{ textAlign: 'right', marginTop: 8 }}>
                                            <div style={{ display: 'inline-block', border: '1px solid #FF0000', padding: '6px 10px', borderRadius: 4, fontSize: '10pt', whiteSpace: 'nowrap', fontWeight: 700 }}>
                                              Total (before tax): ${shown.toFixed(2)}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                      {item.prompt && String(item.prompt).trim().length > 0 && (
                                        <div style={{ textAlign: 'center', fontSize: '13pt', lineHeight: 1.45, maxWidth: '180mm', marginLeft: 'auto', marginRight: 'auto', marginTop: 18, border: '2px solid #FF0000', borderRadius: 4, padding: '10px 12px' }}>
                                          {item.prompt}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </React.Fragment>
                          ))}
                          {/* Final page is rendered once after all devices (below). */}
                        </>
                      );
                    })()}
                    {/* Additional device pages: one per remaining device */}
                    {sales.items.slice(1).map((item, idx) => (
                      <React.Fragment key={idx}>
                        <div className="page-break" style={{ height: 1 }} />
                        <div className="print-page" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', border: '3px solid #FF0000', borderRadius: 8, padding: '12mm' }}>
                          {(() => {
                            const modelForTitle = String(((item.model ?? item.dynamic?.model) || '')).trim();
                            const title = modelForTitle ? [item.brand, modelForTitle].filter(Boolean).join(' ').trim() : `Device ${idx + 2}`;
                            const hasSpecs = !!(
                              (item.dynamic && Object.keys(item.dynamic || {}).length > 0) ||
                              item.deviceType || (item.dynamic && (item.dynamic as any).device) || item.model || item.condition || item.accessories
                            );
                            return (
                              <div>
                                <div className="text-base font-semibold mb-2 text-center">{title}</div>
                                {item.images && item.images.length > 0 && (
                                  <div className="mb-3 flex gap-3 flex-wrap justify-center items-center">
                                    {item.images.slice(0, 3).map((src, i) => (
                                      <img key={i} src={src} alt={`Device ${i + 1}`} style={{ maxHeight: '55mm', maxWidth: '55mm', objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 4, padding: 2 }} />
                                    ))}
                                  </div>
                                )}
                                {hasSpecs && (
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'end', columnGap: 12 }}>
                                    <div style={{ gridColumn: 2, textAlign: 'center', justifySelf: 'center' }}>
                                      <div className="rounded" style={{ fontSize: '12pt', border: '2px solid #FF0000', display: 'inline-block', padding: '12px 14px' }}>
                                        <div className="font-semibold mb-2" style={{ textAlign: 'center' }}>Specifications</div>
                                        <table style={{ borderCollapse: 'collapse', display: 'inline-table', width: 'auto', tableLayout: 'auto' }}>
                                          <tbody>
                                            {(() => {
                                              const rows: Array<[string, string]> = [];
                                              if (item.deviceType) rows.push(['Device Type', item.deviceType]);
                                              const appleFamily = (item.dynamic || ({} as any)).device as string | undefined;
                                              if (appleFamily) rows.push(['Apple Family', appleFamily]);
                                              if (item.model) rows.push(['Model', item.model]);
                                              if (item.condition) rows.push(['Condition', item.condition]);
                                              if (item.accessories) rows.push(['Accessories', item.accessories]);
                                              Object.entries(item.dynamic || {}).forEach(([k, v]) => {
                                                if (k === 'device') return;
                                                rows.push([k, String(v ?? '')]);
                                              });
                                              const titleCase = (s: string) => {
                                                return s
                                                  .replace(/[_-]+/g, ' ')
                                                  .split(' ')
                                                  .filter(Boolean)
                                                  .map((w) => {
                                                    const up = w.toUpperCase();
                                                    if (w.length <= 3 && w === up) return up;
                                                    return w.charAt(0).toUpperCase() + w.slice(1);
                                                  })
                                                  .join(' ');
                                              };
                                              return rows.map(([k, v]) => (
                                                <tr key={k}>
                                                  <td style={{ border: '1px solid #FF0000', padding: '6px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>{titleCase(k)}</td>
                                                  <td style={{ border: '1px solid #FF0000', padding: '6px 14px' }}>{v}</td>
                                                </tr>
                                              ));
                                            })()}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                    {(() => {
                                      const base = parseFloat((item.price || '').toString());
                                      if (!isFinite(base) || base <= 0) return null;
                                      const shown = base * 1.15;
                                      return (
                                        <div style={{ gridColumn: 3, justifySelf: 'end' }}>
                                          <div style={{ display: 'inline-block', border: '1px solid #FF0000', padding: '6px 10px', borderRadius: 4, fontSize: '10pt', whiteSpace: 'nowrap', fontWeight: 700 }}>
                                            Total (before tax): ${shown.toFixed(2)}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                                {!hasSpecs && (() => {
                                  const base = parseFloat((item.price || '').toString());
                                  if (!isFinite(base) || base <= 0) return null;
                                  const shown = base * 1.15;
                                  return (
                                    <div style={{ textAlign: 'right', marginTop: 8 }}>
                                      <div style={{ display: 'inline-block', border: '1px solid #FF0000', padding: '6px 10px', borderRadius: 4, fontSize: '10pt', whiteSpace: 'nowrap', fontWeight: 700 }}>
                                        Total (before tax): ${shown.toFixed(2)}
                                      </div>
                                    </div>
                                  );
                                })()}
                                {item.prompt && String(item.prompt).trim().length > 0 && (
                                  <div style={{ textAlign: 'center', fontSize: '13pt', lineHeight: 1.45, maxWidth: '180mm', marginLeft: 'auto', marginRight: 'auto', marginTop: 18, border: '2px solid #FF0000', borderRadius: 4, padding: '10px 12px' }}>
                                    {item.prompt}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </React.Fragment>
                    ))}
                    {/* Final page: Items Listed + Notes + Terms + Signature */}
                    <div className="page-break" style={{ height: 1 }} />
                    {(() => {
                      // Items Listed page: one checkbox per device model in the quote
                      const labels = sales.items.map((it, idx) => {
                        const modelForItem = String(((it.model ?? it.dynamic?.model) || '')).trim();
                        const label = (modelForItem ? [it.brand, modelForItem].filter(Boolean).join(' ').trim() : '') || `Item ${idx + 1}`;
                        return label;
                      });
                      return (
                        <div className="print-page" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', border: '3px solid #FF0000', borderRadius: 8, padding: '12mm' }}>
                          <div style={{ paddingTop: 8, minHeight: '273mm', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '12pt' }}>Notes</div>
                            <div style={{ border: '2px solid #FF0000', borderRadius: 4, padding: 10, height: 200 }}>
                              <div style={{ height: 180 }} />
                            </div>

                            <div style={{ fontWeight: 700, marginTop: 14, marginBottom: 6, fontSize: '12pt' }}>Checklist</div>
                            <div style={{ border: '2px solid #FF0000', borderRadius: 4, padding: 10, fontSize: '11pt', lineHeight: 1.35 }}>
                              <div style={{ columns: 2, columnGap: 16 } as any}>
                                {labels.map((l, i) => (
                                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                                    <div style={{ width: 14, height: 14, border: '1px solid #000', marginTop: 2, borderRadius: 2 }} />
                                    <span>{l || `Item ${i + 1}`}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div style={{ marginTop: 'auto' }}>
                              <div style={{ fontWeight: 700, marginTop: 14, marginBottom: 6, fontSize: '12pt' }}>Terms and Conditions</div>
                              <div style={{ border: '2px solid #FF0000', borderRadius: 4, padding: 12, fontSize: '11pt', lineHeight: 1.45 }}>
                                <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
                                  <li style={{ marginBottom: 6 }}><b>Quote Validity & Availability:</b> Pricing is provided as of the date issued and may change prior to purchase.</li>
                                  <li style={{ marginBottom: 6 }}><b>Warranty & Exclusions:</b> 90-day limited hardware warranty for defects under normal use; exclusions include physical/impact damage, liquid exposure, unauthorized repairs/modifications, abuse/neglect, loss/theft, and third-party accessories.</li>
                                  <li style={{ marginBottom: 6 }}><b>Data & Software:</b> Client is responsible for backups and licensing. Service may require updates/reinstall/reset; we are not responsible for data loss.</li>
                                  <li style={{ marginBottom: 6 }}><b>Deposits & Special Orders:</b> Deposits may be required to order parts/products. Special-order items may be non-returnable and subject to supplier restocking policies.</li>
                                  <li style={{ marginBottom: 6 }}><b>Returns & Cancellations:</b> Returns/cancellations are subject to manufacturer/vendor policies and may incur restocking/processing fees. Labor and time spent is non-refundable.</li>
                                  <li style={{ marginBottom: 6 }}><b>Taxes & Fees:</b> Sales tax and applicable fees may apply at checkout; printed totals may be shown before tax.</li>
                                  <li style={{ marginBottom: 0 }}><b>Limitation of Liability:</b> Liability is limited to amounts paid; incidental or consequential damages are excluded where permitted by law.</li>
                                </ul>
                              </div>

                              <div style={{ marginTop: 16 }}>
                                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <div style={{ fontWeight: 400, fontSize: '12pt', whiteSpace: 'nowrap' }}>Signature</div>
                                      <div style={{ borderBottom: '2px solid #000', height: 24, flex: 1 }} />
                                    </div>
                                  </div>
                                  <div style={{ width: 220 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <div style={{ fontWeight: 400, fontSize: '12pt', whiteSpace: 'nowrap' }}>Date</div>
                                      <div style={{ borderBottom: '2px solid #000', height: 24, flex: 1 }} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div>
                    <div className="text-sm">Customer: <b>{repairs.customerName || '-'}</b> | {repairs.customerPhone || ''}</div>
                    <table className="w-full text-sm mt-3 border-collapse">
                      <thead><tr><th className="border p-2 text-left">Description</th><th className="border p-2 text-right">Parts</th><th className="border p-2 text-right">Labor</th><th className="border p-2 text-right">Line</th></tr></thead>
                      <tbody>
                        {repairs.lines.map((ln, idx) => {
                          const pp = Number(ln.partPrice || 0), lp = Number(ln.laborPrice || 0);
                          return (<tr key={idx}><td className="border p-2">{ln.description}</td><td className="border p-2 text-right">${pp.toFixed(2)}</td><td className="border p-2 text-right">${lp.toFixed(2)}</td><td className="border p-2 text-right">${(pp+lp).toFixed(2)}</td></tr>);
                        })}
                      </tbody>
                      <tfoot>
                        <tr><td colSpan={3} className="border p-2 text-right font-semibold">Total</td><td className="border p-2 text-right font-bold">${repairTotals.total.toFixed(2)}</td></tr>
                      </tfoot>
                    </table>
                    {repairs.notes && (<div className="mt-3 text-sm"><b>Notes:</b> {repairs.notes}</div>)}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Sidebar: Saved Quotes */}
  <aside className="col-span-3 bg-zinc-800 border border-zinc-700 rounded p-3 flex flex-col min-h-[calc(100vh-2rem)]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-zinc-200">Saved Quotes</div>
            <button className="px-2 py-0.5 text-xs bg-zinc-700 border border-zinc-600 rounded" onClick={openSavedQuotes}>Refresh</button>
          </div>
          <div className="text-[10px] text-zinc-400 mb-2">Click a customer to load their quote.</div>
          <div className="flex-1 overflow-hidden space-y-2">
            {quotes.length === 0 ? (
              <div className="text-xs text-zinc-400">No saved quotes.</div>
            ) : (
              quotes.map((q: any) => (
                <div key={q.id ?? Math.random()} className="p-2 rounded border border-zinc-700 hover:bg-zinc-700/50 cursor-pointer">
                  <div className="flex items-start justify-between gap-2" onClick={() => {
                    try {
                      setMode('sales');
                      setSales({
                        customerName: q.customerName || '',
                        customerPhone: q.customerPhone || '',
                        notes: q.notes || '',
                        items: Array.isArray(q.items) ? q.items : [],
                      });
                      if (q.id != null) setQuoteId(q.id);
                      setSaveMsg(`Loaded quote #${q.id ?? ''}`);
                      setTimeout(() => setSaveMsg(null), 1800);
                    } catch {}
                  }}>
                    <div className="flex-1">
                      <div className="text-xs font-medium truncate">{q.customerName || '-'}</div>
                      <div className="text-[10px] text-zinc-400">{fmtWhen(q.createdAt)}</div>
                    </div>
                    <button
                      className="px-1.5 py-0.5 text-[10px] border rounded border-red-700 text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                      disabled={q.id == null}
                      onClick={(e) => { e.stopPropagation(); deleteSavedQuote(q); }}
                    >Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default QuoteGeneratorWindow;
