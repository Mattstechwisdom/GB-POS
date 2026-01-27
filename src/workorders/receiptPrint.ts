import type { WorkOrder } from './releasePrint';
import { fetchPublicAssetAsDataUrl } from '../lib/publicAsset';

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(wo: WorkOrder, opts?: { logoSrc?: string; autoCloseMs?: number; autoPrint?: boolean }): string {
  const logoSrc = opts?.logoSrc ?? '';
  const autoCloseMs = typeof opts?.autoCloseMs === 'number' ? opts!.autoCloseMs : 3000;
  const autoPrint = opts?.autoPrint ?? true;
  const now = new Date();
  const dateStr = isNaN(now.getTime()) ? '' : `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

  const logoBlock = logoSrc
    ? `<img src="${logoSrc}" alt="GADGETBOY" style="height:72px; width:auto;" />`
    : `<div style="height:72px; display:flex; align-items:center; font-weight:800; font-size:22pt; letter-spacing:0.8px;">GADGETBOY</div>`;

  const items = Array.isArray(wo.items) ? wo.items : [];
  const rows = items.map(li => `
    <tr>
      <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; overflow-wrap:anywhere;">${htmlEscape(li.description || '')}</td>
      <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${(li.parts ?? 0).toFixed(2)}</td>
      <td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:right;">${(li.labor ?? 0).toFixed(2)}</td>
    </tr>
  `);
  const fillerCount = Math.max(0, 5 - rows.length);
  for (let i = 0; i < fillerCount; i++) {
    rows.push(`
      <tr>
        <td style="padding:12px 8px; border-bottom:1px solid #e5e7eb;">&nbsp;</td>
        <td style="padding:12px 8px; border-bottom:1px solid #e5e7eb;">&nbsp;</td>
        <td style="padding:12px 8px; border-bottom:1px solid #e5e7eb;">&nbsp;</td>
      </tr>
    `);
  }

  const remaining = (wo.subTotalParts + wo.subTotalLabor - wo.discount + wo.taxes) - wo.amountPaid;

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Customer Receipt - ${htmlEscape(wo.invoiceId)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      html, body { background:#f3f4f6; color:#111; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; font-size: 11pt; }
      .page { width: 210mm; min-height: 297mm; margin: 10px auto 24px; background: #fff; padding: 12mm; box-shadow: 0 2px 20px rgba(0,0,0,0.12); box-sizing: border-box; display:flex; flex-direction:column; position:relative; }
      .page-inner { display:flex; flex-direction:column; min-height: 0; }
      .brand { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
      .brand-left { display:flex; align-items:center; gap:12px; }
      .brand-right { text-align:right; font-size: 10pt; line-height:1.2; }
      .brand-title { font-weight:700; letter-spacing:0.3px; }
      .slogan { color:#444; font-style:italic; margin-top:4px; }
      .section { border:1px solid #d1d5db; border-radius:6px; padding:8px; margin-bottom:10px; }
      .muted-bg { background: #f8fafc; }
      .info-grid { display:grid; grid-template-columns: 1.1fr 1fr 1fr 1fr; gap:6px 10px; align-items:start; }
      .field { display:flex; gap:6px; align-items:baseline; min-width:0; }
      .label-inline { color:#555; font-size:9.5pt; font-weight:600; }
      .value-inline { font-size:10.5pt; color:#111; min-width:0; overflow-wrap:anywhere; }
      .items { width:100%; border-collapse:collapse; }
      .items thead th { text-align:left; border-bottom:1px solid #d1d5db; padding:6px 8px; font-size:10pt; color:#222; font-weight:600; background:#f3f4f6; }
      .items tbody tr:nth-child(odd) { background: #fafafa; }
      .items td:first-child { font-weight:600; color:#111; }
      .footer { margin-top:auto; }
      .totals { width:48%; margin-left:auto; border:1px solid #d1d5db; border-radius:6px; padding:10px; }
      .totals .row { display:flex; gap:12px; align-items:center; }
      .totals .label { width:60%; color:#444; }
      .circuit { position:absolute; top: 8mm; right: 8mm; pointer-events:none; opacity:0.06; }
      .toolbar { position: sticky; top: 0; display:flex; gap:8px; justify-content:flex-end; margin-bottom:8px; }
      .toolbar button { background:#111; color:#fff; border:1px solid #111; padding:6px 10px; border-radius:6px; cursor:pointer; }
      .toolbar button.secondary { background:#fff; color:#111; border:1px solid #d1d5db; }
      .print-hidden { display:none !important; }
      @media print {
        html, body { background:#fff; margin: 0; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { margin: 0 auto; width: auto; height: calc(297mm - 24mm); box-shadow: none; display:flex; flex-direction:column; position: relative; padding: 0; }
        .page-inner { padding: 12mm; padding-bottom: 50mm; }
        .footer { position: absolute; left: 0; right: 0; bottom: 0; margin-top: 0; page-break-inside: avoid; }
        .print-hidden { display: none !important; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar print-hidden">
      <button id="printBtn">Print</button>
      <button id="closeBtn" class="secondary">Close</button>
    </div>
    <div class="page">
      <svg class="circuit" width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#39FF14" stop-opacity="0.5" />
            <stop offset="100%" stop-color="#39FF14" stop-opacity="0.2" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#g1)" stroke-width="1.2">
          <rect x="10" y="10" width="30" height="30" rx="4" />
          <rect x="60" y="20" width="40" height="20" rx="4" />
          <path d="M40 25 L60 25" />
          <circle cx="50" cy="25" r="2" />
          <path d="M25 40 L25 70 L90 70" />
          <circle cx="25" cy="55" r="2.5" />
          <circle cx="90" cy="70" r="2.5" />
          <path d="M90 70 L100 80 M100 80 L110 70" />
          <path d="M75 40 L75 55 L95 55" />
          <circle cx="95" cy="55" r="2" />
        </g>
      </svg>
      <div class="page-inner">
        <div class="brand">
          <div class="brand-left">
            ${logoBlock}
            <div>
              <div class="brand-title">GADGETBOY Repair & Retail</div>
              <div style="font-size:10pt; color:#222;">2822 Devine Street, Columbia, SC 29205</div>
              <div style="font-size:10pt; color:#222;">(803) 708-0101 • gadgetboysc@gmail.com</div>
              <div class="slogan">The Solution Lives Here!</div>
            </div>
          </div>
          <div class="brand-right">
            <div><strong>Invoice:</strong> ${htmlEscape(wo.invoiceId)}</div>
            <div><strong>Date/Time:</strong> ${htmlEscape(dateStr)}</div>
            <div><strong>Client:</strong> ${htmlEscape(wo.clientName)}</div>
            <div><strong>Phone:</strong> ${htmlEscape(wo.phone)}</div>
            ${wo.email ? `<div><strong>Email:</strong> ${htmlEscape(wo.email)}</div>` : ''}
          </div>
        </div>

        <div class="section muted-bg">
          <div class="info-grid">
            <div class="field"><span class="label-inline">Device:</span><span class="value-inline">${htmlEscape(wo.device)}</span></div>
            <div class="field"><span class="label-inline">Model:</span><span class="value-inline">${htmlEscape(wo.model)}</span></div>
            <div class="field"><span class="label-inline">Serial #:</span><span class="value-inline">${htmlEscape(wo.serialNumber)}</span></div>
            <div class="field"><span class="label-inline">Password:</span><span class="value-inline">${htmlEscape(wo.password)}</span></div>

            <div class="field" style="grid-column: 1 / span 4"><span class="label-inline">Description:</span><span class="value-inline"><span class="chip">${htmlEscape(wo.description)}</span></span></div>
            <div class="field" style="grid-column: 1 / span 4; margin-top:2px;"><span class="label-inline">Problem:</span><span class="value-inline">${htmlEscape(wo.problem)}</span></div>
          </div>
        </div>

        <div class="section muted-bg">
          <div style="font-weight:600; margin-bottom:6px;">Items</div>
          <table class="items" role="table">
            <thead>
              <tr>
                <th scope="col">Repair Service / Description</th>
                <th scope="col" style="text-align:right;">Parts</th>
                <th scope="col" style="text-align:right;">Labor</th>
              </tr>
            </thead>
            <tbody>
              ${rows.join('')}
            </tbody>
          </table>
        </div>

        <div class="footer">
          <div class="totals" style="margin-bottom:10px;">
            <div class="row"><div class="label">Total Parts</div><div style="margin-left:auto;">${wo.subTotalParts.toFixed(2)}</div></div>
            <div class="row"><div class="label">Total Labor</div><div style="margin-left:auto;">${wo.subTotalLabor.toFixed(2)}</div></div>
            <div class="row"><div class="label">Discount</div><div style="margin-left:auto;">${wo.discount.toFixed(2)}</div></div>
            <div class="row"><div class="label">Taxes (${(wo.taxRate).toFixed(2)}%)</div><div style="margin-left:auto;">${wo.taxes.toFixed(2)}</div></div>
            <div class="row"><div class="label">Amount Paid</div><div style="margin-left:auto;">${wo.amountPaid.toFixed(2)}</div></div>
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:8px 0;" />
            <div class="row"><div class="label"><strong>Remaining Balance</strong></div><div style="margin-left:auto;"><strong>${remaining.toFixed(2)}</strong></div></div>
          </div>
        </div>
      </div>
    </div>
    <script>
      (function(){
        function doPrint(){ try { window.focus(); window.print(); } catch(e){} }
        function doClose(){ try { window.close(); } catch(e){} }
        var printBtn = document.getElementById('printBtn');
        var closeBtn = document.getElementById('closeBtn');
        if (printBtn) printBtn.addEventListener('click', doPrint);
        if (closeBtn) closeBtn.addEventListener('click', doClose);
        function onReady(){
          var auto = ${autoPrint ? 'true' : 'false'};
          if (auto) {
            doPrint();
            var ms = ${autoCloseMs};
            if (ms && ms > 0) setTimeout(doClose, ms);
          }
        }
        if (document.readyState === 'complete') onReady(); else window.onload = onReady;
      })();
    </script>
  </body>
  </html>`;
}

function openPopupAndPrint(html: string): boolean {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return false;
  try {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return true;
  } catch {
    try { w.close(); } catch {}
    return false;
  }
}

function iframeFallback(html: string) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.55)';
  overlay.style.zIndex = '999999';
  const panel = document.createElement('div');
  panel.style.position = 'absolute';
  panel.style.top = '5%';
  panel.style.left = '50%';
  panel.style.transform = 'translateX(-50%)';
  panel.style.width = '85%';
  panel.style.height = '90%';
  panel.style.background = '#111827';
  panel.style.border = '1px solid #374151';
  panel.style.borderRadius = '10px';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  const bar = document.createElement('div');
  bar.style.display = 'flex';
  bar.style.justifyContent = 'space-between';
  bar.style.alignItems = 'center';
  bar.style.padding = '8px 10px';
  bar.style.color = '#e5e7eb';
  bar.style.borderBottom = '1px solid #374151';
  bar.innerHTML = '<div style="font-weight:600">Print Preview</div>';
  const btns = document.createElement('div');
  const close = document.createElement('button');
  close.textContent = 'Close';
  close.style.marginLeft = '8px';
  const print = document.createElement('button');
  print.textContent = 'Print';
  btns.appendChild(print); btns.appendChild(close);
  [print, close].forEach(b => {
    b.style.background = '#10b981';
    b.style.color = '#000';
    b.style.border = 'none';
    b.style.padding = '6px 12px';
    b.style.borderRadius = '6px';
    b.style.cursor = 'pointer';
  });
  close.style.background = '#f3f4f6';
  bar.appendChild(btns);
  const content = document.createElement('div');
  content.style.flex = '1';
  content.style.background = '#111';
  const iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  content.appendChild(iframe);
  panel.appendChild(bar);
  panel.appendChild(content);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  const doc = iframe.contentDocument;
  if (doc) { doc.open(); doc.write(html); doc.close(); }
  close.onclick = () => document.body.removeChild(overlay);
  print.onclick = () => iframe.contentWindow?.print();
}

export async function printCustomerReceipt(workOrder: WorkOrder, opts?: { logoSrc?: string; autoCloseMs?: number; autoPrint?: boolean }): Promise<void> {
  let resolvedLogoSrc = opts?.logoSrc;
  if (!resolvedLogoSrc) {
    resolvedLogoSrc = (await fetchPublicAssetAsDataUrl('logo.png')) || (await fetchPublicAssetAsDataUrl('logo-spin.gif')) || '';
  }
  const html = buildHtml(workOrder, { ...opts, logoSrc: resolvedLogoSrc });
  const ok = openPopupAndPrint(html);
  if (!ok) iframeFallback(html);
}
