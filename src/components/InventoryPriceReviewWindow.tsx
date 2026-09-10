import React, { useEffect, useMemo, useState } from 'react';
import { scrapePartUrl, type PriceCandidate } from '../lib/partOrdering';
import { classifyPriceResult, priceDifference, rankPriceCandidates, type PriceResultKind } from '../lib/inventoryPriceReview';
import { supabase } from '../lib/supabase';

type Item = { id?: number; cloudId?: string; itemDescription?: string; internalCost?: number; distributor?: string; reorderUrlTemplate?: string; productUrl?: string };
type Result = { id?: string; item: Item; url: string; kind: PriceResultKind; detectedCost?: number; proposedCost?: number; confidence?: number; warning?: string; selectorFingerprint?: string; sourceKind?: string };

const labels: Record<PriceResultKind, string> = { changed: 'Changed', unchanged: 'Unchanged', 'needs-review': 'Needs Review', 'login-required': 'Login Required', failed: 'Failed' };

export default function InventoryPriceReviewWindow({ items, onClose, onApproved }: { items: Item[]; onClose: () => void; onApproved: () => void }) {
  const [results, setResults] = useState<Result[]>([]);
  const [checked, setChecked] = useState(0);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Result[] = [];
      let shopId = '';
      let runId = '';
      try {
        const session = await supabase.auth.getSession();
        const userId = session.data.session?.user?.id;
        const profile = userId ? await supabase.from('staff_profiles').select('shop_id').eq('user_id', userId).eq('status', 'active').maybeSingle() : null;
        shopId = String(profile?.data?.shop_id || '');
        if (shopId) {
          const run = await supabase.from('inventory_price_check_runs').insert({ shop_id: shopId, total_items: items.length }).select('id').single();
          runId = String(run.data?.id || '');
        }
      } catch { /* The local review remains available while cloud sync reconnects. */ }
      for (const item of items) {
        if (cancelled) return;
        const url = String(item.reorderUrlTemplate || item.productUrl || '').trim();
        if (!url) { next.push({ item, url, kind: 'failed', warning: 'No supplier URL.' }); setChecked(next.length); continue; }
        try {
          const meta = await scrapePartUrl(url);
          const loginRequired = /login|sign in|authentication/i.test(String(meta?.error || ''));
          const fallback: PriceCandidate[] = typeof meta?.price === 'number' ? [{ value: meta.price, currency: meta.currency || 'USD', sourceKind: 'current', selectorFingerprint: 'legacy-best-price', confidence: .8, evidence: 'Detected product price' }] : [];
          const ranked = rankPriceCandidates(meta?.priceCandidates?.length ? meta.priceCandidates : fallback);
          const kind = classifyPriceResult(Number(item.internalCost || 0), ranked, { loginRequired });
          const best = ranked[0];
          const result: Result = { item, url, kind, detectedCost: best?.value, proposedCost: best?.value, confidence: best?.confidence, selectorFingerprint: best?.selectorFingerprint, sourceKind: best?.sourceKind, warning: kind === 'needs-review' ? 'Large or ambiguous change—verify the page before approving.' : meta?.error };
          if (shopId && runId && item.cloudId) {
            const saved = await supabase.from('inventory_price_check_results').insert({ shop_id: shopId, run_id: runId, product_id: item.cloudId, result_status: kind, previous_cost: Number(item.internalCost || 0), detected_cost: best?.value ?? null, source_url: url, supplier_domain: (() => { try { return new URL(url).hostname; } catch { return ''; } })(), selector_fingerprint: best?.selectorFingerprint || null, source_kind: best?.sourceKind || null, confidence: best?.confidence || null, warning: result.warning || null }).select('id').single();
            result.id = saved.data?.id;
          }
          next.push(result);
        } catch (error) { next.push({ item, url, kind: 'failed', warning: String((error as any)?.message || error) }); }
        setResults([...next]); setChecked(next.length);
      }
      if (runId) await supabase.from('inventory_price_check_runs').update({ status: 'complete', checked_items: next.length, completed_at: new Date().toISOString() }).eq('id', runId);
      if (!cancelled) setBusy(false);
    })();
    return () => { cancelled = true; };
  }, [items]);
  const counts = useMemo(() => Object.fromEntries(Object.keys(labels).map(key => [key, results.filter(result => result.kind === key).length])), [results]);
  const update = (id: number | undefined, patch: Partial<Result>) => setResults(current => current.map(result => result.item.id === id ? { ...result, ...patch } : result));
  const approve = async (result: Result) => {
    const approvedCost = Number(result.proposedCost);
    if (!result.item.id || !Number.isFinite(approvedCost) || approvedCost < 0) return;
    if (result.id) {
      const approval = await supabase.rpc('approve_inventory_cost_change', { p_result_id: result.id, p_approved_cost: approvedCost });
      if (approval.error) throw new Error(approval.error.message);
    }
    await (window as any).api.dbUpdate('products', result.item.id, { ...result.item, internalCost: approvedCost, updatedAt: new Date().toISOString() });
    update(result.item.id, { kind: 'unchanged', warning: `Approved at $${approvedCost.toFixed(2)}. Previous value remains available in the synchronized cost-change audit.` });
    onApproved();
  };
  return <div className="fixed inset-0 z-[80] overflow-auto bg-black/80 p-3 text-zinc-100"><section className="mx-auto max-w-6xl rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-700 bg-zinc-950 p-4"><div><h2 className="text-xl font-black">Supplier Cost Review</h2><p className="text-xs text-zinc-400">{busy ? `Checking ${checked} of ${items.length}…` : `Checked ${checked} items`}</p></div><button type="button" onClick={onClose} className="rounded border border-zinc-600 px-3 py-2">Close</button></header>
    <div className="grid grid-cols-2 gap-2 border-b border-zinc-800 p-3 sm:grid-cols-5">{Object.entries(labels).map(([key, label]) => <div key={key} className="rounded bg-zinc-900 p-2 text-center"><strong className="block text-lg">{counts[key] || 0}</strong><span className="text-xs text-zinc-400">{label}</span></div>)}</div>
    <div className="space-y-3 p-3">{results.map(result => { const diff = priceDifference(Number(result.item.internalCost || 0), Number(result.proposedCost || 0)); return <article key={result.item.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3"><div className="flex flex-wrap justify-between gap-2"><div><strong>{result.item.itemDescription || 'Inventory item'}</strong><div className="text-xs text-zinc-400">{result.item.distributor || 'Supplier'} · {labels[result.kind]}</div></div><div className="text-xs text-zinc-400">Confidence {Math.round(Number(result.confidence || 0) * 100)}%</div></div><div className="mt-3 grid gap-3 sm:grid-cols-4"><label className="text-xs text-zinc-400">Previous cost<input readOnly value={Number(result.item.internalCost || 0).toFixed(2)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-2" /></label><label className="text-xs text-zinc-400">Proposed cost<input type="number" value={result.proposedCost ?? ''} step="0.01" min="0" onChange={event => update(result.item.id, { proposedCost: Number(event.target.value) })} className="mt-1 w-full rounded border border-[#39FF14]/60 bg-zinc-950 p-2 text-[#39FF14]" /></label><div className="text-xs text-zinc-400">Difference<div className="mt-1 p-2 text-sm text-zinc-100">{diff.difference >= 0 ? '+' : ''}${diff.difference.toFixed(2)} {diff.percentage == null ? '' : `(${diff.percentage >= 0 ? '+' : ''}${diff.percentage}%)`}</div></div><div className="flex items-end gap-2"><button type="button" onClick={() => (window as any).api.openUrl(result.url)} disabled={!result.url} className="rounded border border-blue-400 px-3 py-2 text-xs text-blue-200">Open Part URL</button><button type="button" onClick={() => void approve(result)} disabled={result.proposedCost == null} className="rounded bg-[#39FF14] px-3 py-2 text-xs font-bold text-black">Approve</button><button type="button" onClick={() => update(result.item.id, { kind: 'unchanged', warning: 'Skipped.' })} className="rounded border border-zinc-600 px-3 py-2 text-xs">Skip</button></div></div>{result.warning ? <p className="mt-2 text-xs text-amber-300">{result.warning}</p> : null}</article>; })}{busy ? <div className="p-6 text-center text-zinc-400">Checking supplier pages one at a time to avoid rate limits…</div> : null}</div>
  </section></div>;
}
