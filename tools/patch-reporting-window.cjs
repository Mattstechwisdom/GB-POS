const fs = require('fs');

const filePath = 'src/components/ReportingWindow.tsx';
let text = fs.readFileSync(filePath, 'utf8');
const original = text;

function fail(msg) {
  console.error('PATCH_FAIL:', msg);
  process.exit(1);
}

const start = text.indexOf('function downloadCSV() {');
if (start < 0) fail('downloadCSV not found');
const end = text.indexOf('\n  }', start);
if (end < 0) fail('downloadCSV end not found');
const insertAt = end + '\n  }'.length;

if (!text.includes('const paymentTotals = useMemo')) {
  const injectionLines = [
    '',
    '',
    '  const paymentTotals = useMemo(() => {',
    '    let cash = 0;',
    '    let card = 0;',
    '',
    '    const add = (paymentType: any, amount: any) => {',
    '      const amt = Number(amount || 0);',
    '      if (!Number.isFinite(amt) || amt <= 0) return;',
    '      const pt = String(paymentType || "").toLowerCase();',
    '      if (pt.includes("cash")) cash += amt;',
    '      else if (pt.includes("card") || pt.includes("apple") || pt.includes("google") || pt.includes("tap")) card += amt;',
    '      else if (pt) card += amt;',
    '    };',
    '',
    '    for (const w of (filtered || [])) {',
    '      const pays = Array.isArray((w as any)?.payments) ? (w as any).payments : null;',
    '      if (pays?.length) {',
    '        for (const p of pays) add((p as any)?.paymentType, (p as any)?.amount);',
    '        continue;',
    '      }',
    '      add((w as any)?.paymentType, (w as any)?.amountPaid);',
    '    }',
    '',
    '    return { cash, card };',
    '  }, [filtered]);',
    '',
    '  async function downloadSummary() {',
    '    const payload = {',
    '      generatedAt: new Date().toISOString(),',
    '      filters: {',
    '        period,',
    '        from: from || null,',
    '        to: to || null,',
    '        technician: tech || null,',
    '        excludeTax,',
    '        includeRepairs,',
    '        includeSales,',
    '      },',
    '      totals: {',
    '        grandTotal: Number(summary.revenue.toFixed(2)),',
    '        cashTotal: Number(paymentTotals.cash.toFixed(2)),',
    '        cardTotal: Number(paymentTotals.card.toFixed(2)),',
    '      },',
    '      popular: {',
    '        repairs: topRepairs,',
    '        products: topSales,',
    '      },',
    '    };',
    '',
    '    const ts = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);',
    '    const defaultName = "reporting-summary-" + ts + ".json";',
    '',
    '    try {',
    '      const api = (window as any).api;',
    '      if (typeof api?.backupExportPayloadNamed === "function") {',
    '        const res = await api.backupExportPayloadNamed(payload, defaultName);',
    '        if (res?.ok || res?.canceled) return;',
    '      }',
    '    } catch (e) {',
    '      console.warn("backupExportPayloadNamed failed, falling back to browser download", e);',
    '    }',
    '',
    '    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });',
    '    const url = URL.createObjectURL(blob);',
    '    const a = document.createElement("a");',
    '    a.href = url;',
    '    a.download = defaultName;',
    '    a.click();',
    '    URL.revokeObjectURL(url);',
    '  }',
    ''
  ];

  const injection = injectionLines.join('\n');
  text = text.slice(0, insertAt) + injection + text.slice(insertAt);
}

text = text.replace(
  /(<button[^>]*className="px-3 py-2 bg-\[#39FF14\] text-black rounded\s+font-semibold"[^>]*onClick=\{)downloadCSV(\}[^>]*disabled=\{)!csv(\}[^>]*>)(Download CSV)(<\/button>)/m,
  '$1downloadSummary$2!filtered.length$3Download$5'
);

const needle = [
  '      <div className="flex gap-2 flex-wrap">',
  '        <QuickRange onPick={setQuickRange} />',
  '      </div>',
  '',
  '      <div className="grid grid-cols-4 gap-4">'
].join('\n');

if (text.includes(needle) && !text.includes('Cash Total') && !text.includes('Card Total')) {
  const replacement = [
    '      <div className="flex gap-2 flex-wrap">',
    '        <QuickRange onPick={setQuickRange} />',
    '      </div>',
    '',
    '      <div className="grid grid-cols-3 gap-4">',
    '        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">',
    '          <div className="text-sm text-zinc-400">Grand Total</div>',
    '          <div className="mt-2 text-3xl font-bold text-neon-green">${summary.revenue.toFixed(2)}</div>',
    '        </div>',
    '        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">',
    '          <div className="text-sm text-zinc-400">Cash Total</div>',
    '          <div className="mt-2 text-2xl font-bold text-zinc-100">${paymentTotals.cash.toFixed(2)}</div>',
    '        </div>',
    '        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">',
    '          <div className="text-sm text-zinc-400">Card Total</div>',
    '          <div className="mt-2 text-2xl font-bold text-zinc-100">${paymentTotals.card.toFixed(2)}</div>',
    '        </div>',
    '      </div>',
    '',
    '      <div className="grid grid-cols-4 gap-4">'
  ].join('\n');

  text = text.replace(needle, replacement);
}

if (text === original) fail('no changes applied');

const tmpPath = filePath + '.tmp';
const bakPath = filePath + '.bak';
try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
try { if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath); } catch {}

fs.writeFileSync(tmpPath, text, 'utf8');
// Replace via rename to avoid write-denied-on-existing-file scenarios.
fs.renameSync(filePath, bakPath);
fs.renameSync(tmpPath, filePath);
console.log('PATCH_OK');
