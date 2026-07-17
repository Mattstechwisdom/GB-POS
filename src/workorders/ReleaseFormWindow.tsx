import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { fetchPublicAssetAsDataUrlCached, publicAsset } from '../lib/publicAsset';
import { formatPhone } from '../lib/format';
import { consumeWindowPayload } from '../lib/windowPayload';

function getPayload() {
  try {
    const stored = consumeWindowPayload('releaseForm');
    if (stored !== null) return stored;
  } catch {}
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('releaseForm');
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw));
  } catch (e) { return null; }
}

const Row: React.FC<{ label: string; value?: any }> = ({ label, value }) => (
  <div style={{ display: 'flex', marginBottom: 6 }}>
    <div style={{ width: 180, color: '#444' }}>{label}</div>
    <div style={{ flex: 1, borderBottom: '1px solid #ddd', paddingBottom: 2 }}>{value ?? ''}</div>
  </div>
);

const ReleaseFormWindow: React.FC = () => {
  const [data, setData] = useState<any>(() => getPayload() || {});

  const [logoSrc, setLogoSrc] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const didAutoPrintRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const src = (await fetchPublicAssetAsDataUrlCached('logo.png')) || (await fetchPublicAssetAsDataUrlCached('logo-spin.gif')) || '';
      if (!alive) return;
      setLogoSrc(src);
    })();
    return () => { alive = false; };
  }, []);

  // Generate technician QR code for status page
  useEffect(() => {
    const recordId = Number((data as any).id || (data as any).workOrderId || 0) || 0;
    if (!recordId) return;
    const type = (data as any).receiptType === 'sale' ? 'sale' : 'repair';
    let alive = true;
    (async () => {
      try {
        let qrUrl = '';
        try {
          const result = await (window as any).api?.qrGetStatusUrl?.(type, recordId);
          if (result?.ok && result.url) qrUrl = result.url;
        } catch { /* QR helper unavailable */ }
        if (!qrUrl) {
          const ipRes = await fetch('http://localhost:7777/ip');
          if (ipRes.ok) {
            const json = await ipRes.json();
            const baseUrl = String(json?.ipUrl || (json?.ip ? `http://${json.ip}:7777` : '')).trim();
            if (baseUrl) qrUrl = `${baseUrl.replace(/\/$/, '')}/status/${type}/${recordId}`;
          }
        }
        if (qrUrl) {
          const dataUrl: string = await QRCode.toDataURL(qrUrl, {
            width: 176, margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
            errorCorrectionLevel: 'M',
          });
          if (alive && dataUrl && dataUrl.startsWith('data:')) setQrDataUrl(dataUrl);
        }
      } catch { /* QR generation failed silently */ }
    })();
    return () => { alive = false; };
  }, [(data as any).id, (data as any).workOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enrich from DB when only workOrderId is provided (e.g. from context menu)
  useEffect(() => {
    const payload = data as any;
    const workOrderId = Number(payload.workOrderId || 0) || 0;
    const hasCoreContact = Boolean(
      String(payload.customerName || '').trim()
      && String(payload.customerPhone || '').trim()
      && String(payload.customerEmail || '').trim()
    );
    if (!workOrderId) return;
    if (hasCoreContact && String(payload.customerPhoneAlt || '').trim()) return;
    let alive = true;
    (async () => {
      try {
        const api = (window as any).api;
        let wo: any = null;
        try {
          const list = await api.findWorkOrders?.({ id: workOrderId });
          wo = Array.isArray(list) && list.length ? list[0] : null;
        } catch {}
        if (!wo) {
          try {
            const list = await api.dbGet?.('workOrders');
            wo = Array.isArray(list) ? list.find((w: any) => Number(w?.id || 0) === workOrderId) || null : null;
          } catch {}
        }
        if (!wo || !alive) return;
        const enriched: any = { ...wo, ...payload };
        if (wo.customerId && api.findCustomers) {
          try {
            const customers = await api.findCustomers({ id: wo.customerId });
            const c = Array.isArray(customers) && customers.length ? customers[0] : null;
            if (c) {
              const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
              if (full) enriched.customerName = full;
              if (c.phone) enriched.customerPhone = c.phone;
              if (c.phoneAlt) enriched.customerPhoneAlt = c.phoneAlt;
              if (c.email) enriched.customerEmail = c.email;
            }
          } catch {}
        }
        if (alive) setData(enriched);
      } catch {}
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Give the logo a chance to resolve before printing, to avoid the broken-image icon.
    if (didAutoPrintRef.current) return;

    // 100ms fallback — if logo hasn't loaded yet, print without it rather than waiting forever.
    const fallback = window.setTimeout(() => {
      if (didAutoPrintRef.current) return;
      didAutoPrintRef.current = true;
      try { window.print(); } catch {}
    }, 100);

    if (logoSrc) {
      window.clearTimeout(fallback);
      didAutoPrintRef.current = true;
      // Single rAF is enough to ensure the logo img has been committed to DOM.
      requestAnimationFrame(() => {
        try { window.print(); } catch {}
      });
    }

    return () => window.clearTimeout(fallback);
  }, [logoSrc]);

  const items = Array.isArray(data.items) ? data.items : [];
  const fullName = data.customerName || data.customer?.name || '';
  const phoneRaw = data.customerPhone || data.customer?.phone || '';
  const phone = formatPhone(String(phoneRaw || '')) || String(phoneRaw || '');
  const phoneAltRaw = (data as any).customerPhoneAlt || (data as any).customer?.phoneAlt || '';
  const phoneAlt = formatPhone(String(phoneAltRaw || '')) || String(phoneAltRaw || '');
  const email = (data as any).customerEmail || (data as any).customer?.email || '';

  return (
    <div style={{ background: '#f3f4f6', color: '#111', minHeight: '100vh', padding: '12px 0', fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        .page { width: 210mm; min-height: 297mm; margin: 0 auto 20px; background: #fff; padding: 12mm; box-shadow: 0 2px 20px rgba(0,0,0,0.12); box-sizing: border-box; display: flex; flex-direction: column; position: relative; }
        .page-inner { display: flex; flex-direction: column; min-height: 0; }
        .section { border:1px solid #e5e7eb; border-radius: 6px; padding: 8px; margin-bottom: 10px; }
        .footer { margin-top: auto; }
        @media print {
          .page { height: calc(297mm - 24mm); margin: 0 auto; box-shadow: none; padding: 0; }
          .page-inner { padding: 12mm; padding-bottom: 95mm; }
          .footer { position: absolute; left: 0; right: 0; bottom: 25mm; margin-top: 0; page-break-inside: avoid; }
        }
      `}</style>
      <div className="page">
        <div className="page-inner">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) auto minmax(210px, 0.9fr)', alignItems: 'flex-start', gap: 0, marginBottom: 12 }}>
        {/* Left — logo + shop name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <img src={logoSrc || publicAsset('logo.png')} alt="GadgetBoy" style={{ height: 60, width: 'auto' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.2, lineHeight: 1.1 }}>GADGETBOY REPAIR</div>
            <div style={{ fontSize: 11, color: '#666' }}>Work Order Release Form</div>
            <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>2822 Devine Street, Columbia, SC 29205</div>
            <div style={{ fontSize: 10, color: '#888' }}>803-708-0101 · Mon–Fri 10–7 · Sat 10–8</div>
          </div>
        </div>
        {/* Center — technician QR code */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '0 10px' }}>
          {qrDataUrl ? (
            <>
              <img src={qrDataUrl} alt="Tech Status QR" style={{ width: 64, height: 64, display: 'block' }} />
              <div style={{ fontSize: 7, color: '#555', textAlign: 'center', marginTop: 3, letterSpacing: '0.4px' }}>TECH SCAN</div>
            </>
          ) : null}
        </div>
        {/* Right — WO info + client */}
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#111' }}>WO: {data.id ? String(data.id).padStart(6, '0') : '—'}</div>
          <div style={{ fontSize: 11, color: '#666' }}>Date: {new Date().toLocaleDateString()}</div>
          {fullName ? <div style={{ fontSize: 11, color: '#111', marginTop: 4 }}><strong>Client:</strong> {fullName}</div> : null}
          {phone ? <div style={{ fontSize: 11, color: '#111' }}><strong>Phone:</strong> {phone}</div> : null}
          {phoneAlt ? <div style={{ fontSize: 11, color: '#111' }}><strong>Alt:</strong> {phoneAlt}</div> : null}
          {email ? <div style={{ fontSize: 11, color: '#666' }}>{email}</div> : null}
        </div>
      </div>

  <div className="section" style={{ background: '#f8fafc' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div><div style={{ color: '#666', fontSize: 11 }}>Customer</div><div style={{ borderBottom: '1px solid #e5e7eb' }}>{fullName}</div></div>
          <div><div style={{ color: '#666', fontSize: 11 }}>Phone</div><div style={{ borderBottom: '1px solid #e5e7eb' }}>{phone}</div></div>
          {phoneAlt ? <div><div style={{ color: '#666', fontSize: 11 }}>Alt Phone</div><div style={{ borderBottom: '1px solid #e5e7eb' }}>{phoneAlt}</div></div> : null}
          {email ? <div><div style={{ color: '#666', fontSize: 11 }}>Email</div><div style={{ borderBottom: '1px solid #e5e7eb' }}>{email}</div></div> : null}
          <div><div style={{ color: '#666', fontSize: 11 }}>Device</div><div style={{ borderBottom: '1px solid #e5e7eb' }}>{data.productDescription || data.productCategory || ''}</div></div>
          <div><div style={{ color: '#666', fontSize: 11 }}>Model</div><div style={{ borderBottom: '1px solid #e5e7eb' }}>{data.model || ''}</div></div>
          <div><div style={{ color: '#666', fontSize: 11 }}>Serial</div><div style={{ borderBottom: '1px solid #e5e7eb' }}>{data.serial || ''}</div></div>
        </div>
        <div style={{ marginTop: 6 }}>
          <div style={{ color: '#666', fontSize: 11 }}>Problem</div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: '6px 8px', minHeight: 28, whiteSpace: 'pre-wrap' }}>{data.problemInfo || ''}</div>
        </div>
      </div>

  <div className="section" style={{ background: '#f8fafc' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Repairs</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '4px 3px', fontSize: 11, color: '#666' }}>Description</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #e5e7eb', padding: '4px 3px', fontSize: 11, color: '#666' }}>Parts</th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #e5e7eb', padding: '4px 3px', fontSize: 11, color: '#666' }}>Labor</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any) => {
              const parts = typeof it.parts === 'number' ? it.parts : (typeof it.partCost === 'number' ? it.partCost : 0);
              const labor = typeof it.labor === 'number' ? it.labor : (typeof it.unitPrice === 'number' ? it.unitPrice : (typeof it.laborCost === 'number' ? it.laborCost : 0));
              const desc = it.repair || it.description || it.title || it.name || it.altDescription || '';
              return (
                <tr key={it.id}>
                  <td style={{ padding: '4px 3px', borderBottom: '1px solid #f1f5f9', overflowWrap: 'anywhere' }}>{desc}</td>
                  <td style={{ padding: '4px 3px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>{parts ? parts.toFixed(2) : ''}</td>
                  <td style={{ padding: '4px 3px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>{labor ? labor.toFixed(2) : ''}</td>
                </tr>
              );
            })}
            {Array.from({ length: Math.max(0, 5 - items.length) }).map((_, idx) => (
              <tr key={`filler-${idx}`}>
                <td style={{ padding: '12px 3px', borderBottom: '1px solid #f1f5f9' }}>&nbsp;</td>
                <td style={{ padding: '12px 3px', borderBottom: '1px solid #f1f5f9' }}>&nbsp;</td>
                <td style={{ padding: '12px 3px', borderBottom: '1px solid #f1f5f9' }}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="footer" style={{ display: 'flex', gap: 24, alignItems: 'stretch' }}>
        <div style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, background: '#fff' }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Totals</div>
          <Row label="Parts" value={Number(data.partCosts || data.parts || 0).toFixed(2)} />
          <Row label="Labor" value={Number(data.laborCost || data.labor || 0).toFixed(2)} />
          {data.discount ? <Row label="Discount" value={Number(data.discount).toFixed(2)} /> : null}
          {data.taxRate ? <Row label="Tax Rate" value={`${data.taxRate}%`} /> : null}
          <Row label="Total" value={Number(data.totals?.total || 0).toFixed(2)} />
          <Row label="Amount Paid" value={Number(data.amountPaid || 0).toFixed(2)} />
          <Row label="Remaining" value={Number(data.totals?.remaining || 0).toFixed(2)} />
        </div>

        <div style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, background: '#fff' }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Acknowledgements</div>
          <div style={{ fontSize: 12, color: '#444', lineHeight: 1.5, marginBottom: 54 }}>
            By signing below, I confirm the client, phone, email, and device information above is correct. I authorize GadgetBoy Repair to diagnose and/or repair the device. I acknowledge that data backup is my responsibility and GadgetBoy is not liable for data loss. I agree to the diagnostic, repair, and storage terms listed.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 120, color: '#444' }}>Customer Signature</div>
            <div style={{ flex: 1, borderBottom: '1px solid #000', height: 26 }}></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <div style={{ width: 120, color: '#444' }}>Date</div>
            <div style={{ flex: 1, borderBottom: '1px solid #000', height: 26 }}></div>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
};

export default ReleaseFormWindow;
