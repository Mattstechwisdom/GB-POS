import React, { useEffect, useMemo } from 'react';
import { publicAsset } from '../lib/publicAsset';

function getPayload() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('customerReceipt');
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw));
  } catch (e) { return null; }
}

const CustomerReceiptWindow: React.FC = () => {
  const data = useMemo(() => getPayload() || {}, []);
  const now = new Date();

  useEffect(() => {
    setTimeout(() => { try { window.print(); } catch {} }, 300);
  }, []);

  const items = Array.isArray(data.items) ? data.items : [];
  const fullName = data.customerName || data.customer?.name || '';
  const phone = data.customerPhone || data.customer?.phone || '';

  return (
    <div style={{ background: '#f3f4f6', color: '#111', minHeight: '100vh', padding: '12px 0', fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto 20px; background: #fff; padding: 12mm; box-shadow: 0 2px 20px rgba(0,0,0,0.12); box-sizing: border-box; display: flex; flex-direction: column; position: relative; }
  .page-inner { display: flex; flex-direction: column; min-height: 0; }
        .brand { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .brand-left { display:flex; align-items:center; gap:12px; }
        .brand-right { text-align:right; font-size: 10pt; line-height:1.2; }
        .brand-title { font-weight:700; letter-spacing:0.3px; }
        .slogan { color:#444; font-style:italic; margin-top:4px; }
  .section { border:1px solid #d1d5db; border-radius:6px; padding:8px; margin-bottom:10px; }
  .muted-bg { background: #f8fafc; }
  .chip { display:inline-block; padding:3px 6px; border-radius:6px; background:#f3f4f6; border:1px solid #e5e7eb; }
        .info-grid { display:grid; grid-template-columns: 1.1fr 1fr 1fr 1fr; gap:6px 10px; align-items:start; }
        .field { display:flex; gap:6px; align-items:baseline; min-width:0; }
        .label-inline { color:#555; font-size:9.5pt; font-weight:600; }
        .value-inline { font-size:10.5pt; color:#111; min-width:0; overflow-wrap:anywhere; }
  .items { width:100%; border-collapse:collapse; }
  .items thead th { text-align:left; border-bottom:1px solid #d1d5db; padding:6px 8px; font-size:10pt; color:#222; font-weight:600; background:#f3f4f6; }
  .items tbody tr:nth-child(odd) { background: #fafafa; }
        .items td:first-child { font-weight:600; color:#111; }
  .footer { margin-top: 10px; }
  @media print {
    .page { height: calc(297mm - 24mm); margin: 0 auto; box-shadow: none; padding: 0; }
    .page-inner { padding: 12mm; }
  }
        .totals { width:48%; margin-left:auto; border:1px solid #d1d5db; border-radius:6px; padding:10px; }
        .totals .row { display:flex; gap:12px; align-items:center; }
        .totals .label { width:60%; color:#444; }
        .circuit { position:absolute; top: 8mm; right: 8mm; pointer-events:none; opacity:0.06; }
        .terms { font-size:9pt; color:#222; }
        .toolbar { display:flex; justify-content:flex-end; gap:8px; margin-bottom:8px; position:sticky; top:0; background:#fff; padding-bottom:6px; z-index:5; }
        @media print { .toolbar { display:none; } }
      `}</style>
      <div className="page">
        <svg className="circuit" width="120" height="120" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#39FF14" stopOpacity="0.5" />
              <stop offset="100%" stop-color="#39FF14" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <g fill="none" stroke="url(#g1)" strokeWidth="1.2">
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
        <div className="page-inner">
        <div className="toolbar">
          <button
            onClick={async () => {
              try {
                const html = document.documentElement.outerHTML;
                const base = `workorder-receipt-${data.id || 'draft'}`;
                const res = await (window as any).api.exportPdf(html, base);
                if (!res?.ok && res?.canceled) return;
                if (!res?.ok) alert('Export failed: ' + (res?.error || 'Unknown error'));
              } catch (e:any) {
                alert('Export failed: ' + (e?.message || String(e)));
              }
            }}
            style={{ background:'#111', color:'#39FF14', border:'1px solid #39FF14', padding:'6px 12px', borderRadius:6, fontSize:'10pt', cursor:'pointer' }}
          >Download PDF</button>
        </div>
        <div className="brand">
          <div className="brand-left">
            <img src={publicAsset('logo.png')} alt="GADGETBOY" style={{ height: 72, width: 'auto' }} />
            <div>
              <div className="brand-title">GADGETBOY Repair & Retail</div>
              <div style={{ fontSize: '10pt', color: '#222' }}>2822 Devine Street, Columbia, SC 29205</div>
              <div style={{ fontSize: '10pt', color: '#222' }}>(803) 708-0101 • gadgetboysc@gmail.com</div>
              <div className="slogan">The Solution Lives Here!</div>
            </div>
          </div>
          <div className="brand-right">
            <div><strong>Invoice:</strong> {data.id ? String(data.id) : ''}</div>
            <div><strong>Date/Time:</strong> {now.toLocaleDateString()} {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
            <div><strong>Client:</strong> {fullName}</div>
            <div><strong>Phone:</strong> {phone}</div>
          </div>
        </div>

        <div className="section muted-bg">
          <div className="info-grid">
            <div className="field"><span className="label-inline">Device:</span><span className="value-inline">{data.productCategory || ''}</span></div>
            <div className="field"><span className="label-inline">Model:</span><span className="value-inline">{data.model || ''}</span></div>
            <div className="field"><span className="label-inline">Serial #:</span><span className="value-inline">{data.serial || ''}</span></div>
            <div className="field"><span className="label-inline">Password:</span><span className="value-inline">{data.password || ''}</span></div>

            <div className="field" style={{ gridColumn: '1 / span 4' }}><span className="label-inline">Description:</span><span className="value-inline"><span className="chip">{(data.productDescription || data.productCategory || '')}</span></span></div>
            <div className="field" style={{ gridColumn: '1 / span 4', marginTop: 2 }}><span className="label-inline">Problem:</span><span className="value-inline">{data.problemInfo || ''}</span></div>
          </div>
        </div>

        <div className="section muted-bg">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Items</div>
          <table className="items" role="table" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th scope="col">Repair Service / Description</th>
                <th scope="col" style={{ textAlign: 'right' }}>Parts</th>
                <th scope="col" style={{ textAlign: 'right' }}>Labor</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any) => {
                const parts = typeof it.parts === 'number' ? it.parts : (typeof it.partCost === 'number' ? it.partCost : 0);
                const labor = typeof it.labor === 'number' ? it.labor : (typeof it.unitPrice === 'number' ? it.unitPrice : (typeof it.laborCost === 'number' ? it.laborCost : 0));
                const desc = it.repair || it.description || it.title || it.name || it.altDescription || '';
                return (
                  <tr key={it.id}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb', overflowWrap: 'anywhere' }}>{desc}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>{parts ? parts.toFixed(2) : ''}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>{labor ? labor.toFixed(2) : ''}</td>
                  </tr>
                );
              })}
              {Array.from({ length: Math.max(0, 5 - items.length) }).map((_, idx) => (
                <tr key={`filler-${idx}`}>
                  <td style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb' }}>&nbsp;</td>
                  <td style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb' }}>&nbsp;</td>
                  <td style={{ padding: '12px 8px', borderBottom: '1px solid #e5e7eb' }}>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals under list, aligned right */}
        <div className="totals" style={{ marginBottom: 10 }}>
          <div className="row"><div className="label">Total Parts</div><div style={{ marginLeft: 'auto' }}>{Number(data.partCosts || 0).toFixed(2)}</div></div>
          <div className="row"><div className="label">Total Labor</div><div style={{ marginLeft: 'auto' }}>{Number(data.laborCost || 0).toFixed(2)}</div></div>
          <div className="row"><div className="label">Discount</div><div style={{ marginLeft: 'auto' }}>{Number(data.discount || 0).toFixed(2)}</div></div>
          <div className="row"><div className="label">Taxes ({Number(data.taxRate || 0).toFixed(2)}%)</div><div style={{ marginLeft: 'auto' }}>{Number(data.totals?.tax || 0).toFixed(2)}</div></div>
          <div className="row"><div className="label">Amount Paid</div><div style={{ marginLeft: 'auto' }}>{Number(data.amountPaid || 0).toFixed(2)}</div></div>
          <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '8px 0' }} />
          <div className="row"><div className="label"><strong>Remaining Balance</strong></div><div style={{ marginLeft: 'auto' }}><strong>{Number(data.totals?.remaining || 0).toFixed(2)}</strong></div></div>
        </div>

        {/* Terms and signature removed per request */}
        </div>
      </div>
    </div>
  );
};

export default CustomerReceiptWindow;
