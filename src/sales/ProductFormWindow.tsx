// @ts-nocheck
import React, { useEffect, useMemo } from 'react';
import { publicAsset } from '../lib/publicAsset';

function getPayload() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('productForm');
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw));
  } catch { return null; }
}

const Row: React.FC<{ label: string; value?: any }> = ({ label, value }) => (
  <div style={{ display: 'flex', marginBottom: 6 }}>
    <div style={{ width: 180, color: '#444' }}>{label}</div>
    <div style={{ flex: 1, borderBottom: '1px solid #ddd', paddingBottom: 2 }}>{value ?? ''}</div>
  </div>
);

const ProductFormWindow: React.FC = () => {
  const data = useMemo(() => getPayload() || {}, []);

  useEffect(() => { setTimeout(() => { try { window.print(); } catch {} }, 300); }, []);

  const fullName = data.customerName || '';
  const phone = data.customerPhone || '';
  const item = data.itemDescription || data.productDescription || '';
  const qty = Number(data.quantity || 1);
  const price = Number(data.price || data.total || 0);
  const subtotal = qty * price;

  const terms = `By purchasing this product, the customer acknowledges and agrees that all sales are final unless otherwise stated by GadgetBoy Repair & Retail. Each device includes a 30-day limited warranty covering hardware defects or malfunctions not caused by misuse, physical or liquid damage, unauthorized repair attempts, or software alterations. The customer understands and accepts the condition of the device as described at the time of sale, including any cosmetic wear consistent with its grade (Fair, Good, or Excellent). This warranty applies only to the specific issue diagnosed and repaired or to the product as sold, and does not cover wear and tear, battery health degradation, accidental damage, or user-inflicted issues. GadgetBoy reserves the right to inspect and verify any warranty claim prior to service or replacement. The customer accepts responsibility for maintaining and using the product as intended, and understands that any tampering or modification voids the warranty.`;

  return (
    <div style={{ background: '#f3f4f6', color: '#111', minHeight: '100vh', padding: '12px 0', fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        .page { width: 210mm; min-height: 297mm; margin: 0 auto 20px; background: #fff; padding: 12mm; box-shadow: 0 2px 20px rgba(0,0,0,0.12); box-sizing: border-box; display: flex; flex-direction: column; position: relative; }
        .page-inner { display: flex; flex-direction: column; min-height: 0; }
        .section { border:1px solid #e5e7eb; border-radius: 6px; padding: 8px; margin-bottom: 10px; }
        .footer { margin-top: 10px; }
        @media print {
          .page { height: calc(297mm - 24mm); margin: 0 auto; box-shadow: none; padding: 0; }
          .page-inner { padding: 12mm; }
        }
        .totals { width: 48%; margin-left: auto; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; background: #fff; }
        .totals .row { display:flex; gap:12px; align-items:center; }
        .totals .label { width:60%; color:#444; }
        .terms { font-size: 9pt; color: #222; }
        .toolbar { display:flex; justify-content:flex-end; gap:8px; margin-bottom:8px; position:sticky; top:0; background:#fff; padding-bottom:6px; z-index:5; }
        @media print { .toolbar { display:none; } }
      `}</style>
      <div className="page">
        <div className="page-inner">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={publicAsset('logo.png')} alt="GadgetBoy" style={{ height: 36, width: 'auto' }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.1 }}>GADGETBOY REPAIR & RETAIL</div>
                <div style={{ fontSize: 11, color: '#666' }}>Product Sales Form</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#111' }}>2822 Devine Street, Columbia, SC 29205</div>
              <div style={{ fontSize: 11, color: '#111' }}>803-708-0101</div>
              <div style={{ fontSize: 10, color: '#666' }}>Mon–Fri 10am–7pm · Sat 10am–8pm</div>
              <div style={{ marginTop: 2, fontSize: 11, color: '#666' }}>Sale: {data.id ? String(data.id).padStart(6, '0') : '—'}</div>
              <div style={{ fontSize: 11, color: '#666' }}>Date: {new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <div className="section" style={{ background: '#f8fafc' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><div style={{ color: '#666', fontSize: 11 }}>Customer</div><div style={{ borderBottom: '1px solid #e5e7eb' }}>{fullName}</div></div>
              <div><div style={{ color: '#666', fontSize: 11 }}>Phone</div><div style={{ borderBottom: '1px solid #e5e7eb' }}>{phone}</div></div>
              <div><div style={{ color: '#666', fontSize: 11 }}>Item</div><div style={{ borderBottom: '1px solid #e5e7eb' }}>{item}</div></div>
              <div><div style={{ color: '#666', fontSize: 11 }}>Condition</div><div style={{ borderBottom: '1px solid #e5e7eb' }}>{data.condition || ''}</div></div>
            </div>
            <div style={{ marginTop: 6 }}>
              <div style={{ color: '#666', fontSize: 11 }}>Notes</div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: '6px 8px', minHeight: 28, whiteSpace: 'pre-wrap' }}>{data.notes || ''}</div>
            </div>
          </div>

          <div className="section" style={{ background: '#f8fafc' }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Items</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '4px 3px', fontSize: 11, color: '#666' }}>Description</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #e5e7eb', padding: '4px 3px', fontSize: 11, color: '#666' }}>Qty</th>
                  <th style={{ textAlign: 'right', borderBottom: '1px solid #e5e7eb', padding: '4px 3px', fontSize: 11, color: '#666' }}>Price</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '4px 3px', borderBottom: '1px solid #f1f5f9', overflowWrap: 'anywhere' }}>{item}</td>
                  <td style={{ padding: '4px 3px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>{qty}</td>
                  <td style={{ padding: '4px 3px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>${price.toFixed(2)}</td>
                </tr>
                {Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={`filler-${idx}`}>
                    <td style={{ padding: '12px 3px', borderBottom: '1px solid #f1f5f9' }}>&nbsp;</td>
                    <td style={{ padding: '12px 3px', borderBottom: '1px solid #f1f5f9' }}>&nbsp;</td>
                    <td style={{ padding: '12px 3px', borderBottom: '1px solid #f1f5f9' }}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="toolbar">
            <button
              onClick={async () => {
                try {
                  const html = document.documentElement.outerHTML;
                  const base = `product-form-${data.id || 'draft'}`;
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

          {/* Totals under the list, aligned right */}
          <div className="totals">
            <div className="row"><div className="label">Subtotal</div><div style={{ marginLeft: 'auto' }}>{subtotal.toFixed(2)}</div></div>
            {data.discount ? <div className="row"><div className="label">Discount</div><div style={{ marginLeft: 'auto' }}>{Number(data.discount).toFixed(2)}</div></div> : null}
            {data.taxRate ? <div className="row"><div className="label">Tax Rate</div><div style={{ marginLeft: 'auto' }}>{`${data.taxRate}%`}</div></div> : null}
            <div className="row"><div className="label">Total</div><div style={{ marginLeft: 'auto' }}>{Number(data.totals?.total || subtotal).toFixed(2)}</div></div>
            <div className="row"><div className="label">Amount Paid</div><div style={{ marginLeft: 'auto' }}>{Number(data.amountPaid || 0).toFixed(2)}</div></div>
            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '8px 0' }} />
            <div className="row"><div className="label"><strong>Remaining</strong></div><div style={{ marginLeft: 'auto' }}><strong>{Number(data.totals?.remaining || 0).toFixed(2)}</strong></div></div>
          </div>

          {/* Terms and signature removed per request */}
        </div>
      </div>
    </div>
  );
};

export default ProductFormWindow;
