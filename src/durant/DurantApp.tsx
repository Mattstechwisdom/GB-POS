import React, { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import './durant.css';

type Props = { session: Session; shopId: string; onSignOut: () => void };
type Ticket = { id: string; legacy_id?: number; customer_id?: string; product_category?: string; product_description?: string; problem_info?: string; status?: string; items?: any[]; durant_full_transfer?: boolean; customer?: any };

export default function DurantApp({ session, shopId, onSignOut }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(location.search).get('durantTicket') || '');
  const [proposal, setProposal] = useState<any>({ status: 'draft', proposed_data: { items: [], findings: '', laborCost: 0, durantFullTransfer: false } });
  const [notes, setNotes] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const forcePassword = session.user.user_metadata?.force_password_change === true;
  const [newPassword, setNewPassword] = useState('');

  async function load() {
    setBusy(true); setMessage('');
    const { data, error } = await supabase.from('work_orders').select('id,legacy_id,customer_id,product_category,product_description,problem_info,status,items,durant_full_transfer,customers(first_name,last_name,email,phone)').eq('shop_id', shopId).eq('work_order_type', 'durantReport').order('updated_at', { ascending: false });
    if (error) setMessage(error.message); else setTickets((data || []).map((row: any) => ({ ...row, customer: row.customers })));
    setBusy(false);
  }
  useEffect(() => { void load(); }, [shopId]);
  const selected = useMemo(() => tickets.find(ticket => String(ticket.legacy_id || ticket.id) === selectedId) || tickets[0] || null, [tickets, selectedId]);
  useEffect(() => {
    if (!selected) return;
    setSelectedId(String(selected.legacy_id || selected.id));
    void Promise.all([
      supabase.from('durant_proposals').select('*').eq('work_order_id', selected.id).eq('author_user_id', session.user.id).maybeSingle(),
      supabase.from('durant_shared_notes').select('*').eq('work_order_id', selected.id).order('created_at'),
      supabase.from('durant_history').select('*').eq('work_order_id', selected.id).order('created_at'),
    ]).then(([p, n, h]) => { if (p.data) setProposal(p.data); else setProposal({ status: 'draft', proposed_data: { items: selected.items || [], findings: '', laborCost: 0, durantFullTransfer: !!selected.durant_full_transfer } }); setNotes(n.data || []); setHistory(h.data || []); });
  }, [selected?.id, session.user.id]);

  async function save(status: 'draft' | 'ready') {
    if (!selected) return; setBusy(true); setMessage('');
    const payload = { shop_id: shopId, work_order_id: selected.id, author_user_id: session.user.id, status, proposed_data: proposal.proposed_data, submitted_at: status === 'ready' ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('durant_proposals').upsert(payload, { onConflict: 'work_order_id,author_user_id' }).select().single();
    if (error) setMessage(error.message); else { setProposal(data); await supabase.from('durant_history').insert({ shop_id: shopId, work_order_id: selected.id, actor_user_id: session.user.id, event_type: status === 'ready' ? 'submitted' : 'draft_saved', summary: status === 'ready' ? 'Durant submitted changes for GadgetBoy review' : 'Durant saved a draft', safe_data: { proposalId: data.id } }); setMessage(status === 'ready' ? 'Ready for GadgetBoy Review.' : 'Draft saved.'); }
    setBusy(false);
  }
  async function addNote() { if (!selected || !note.trim()) return; const { error } = await supabase.from('durant_shared_notes').insert({ shop_id: shopId, work_order_id: selected.id, author_user_id: session.user.id, body: note.trim() }); if (error) setMessage(error.message); else { setNote(''); const rows = await supabase.from('durant_shared_notes').select('*').eq('work_order_id', selected.id).order('created_at'); setNotes(rows.data || []); } }

  if (forcePassword) return <main className="durant-login"><form onSubmit={async e => { e.preventDefault(); if (newPassword.length < 10) { setMessage('Use at least 10 characters.'); return; } const { error } = await supabase.auth.updateUser({ password: newPassword, data: { force_password_change: false } }); if (error) setMessage(error.message); else location.reload(); }}><h1>Secure your Durant login</h1><p>The temporary PIN can only be used for setup. Choose a private password now.</p><input type="password" minLength={10} required value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" /><button>Set secure password</button>{message && <p>{message}</p>}</form></main>;

  return <main className="durant-shell"><header><div><strong>GADGETBOY</strong><span>Durant Media Workspace</span></div><button onClick={onSignOut}>Sign out</button></header><div className="durant-layout"><aside><h2>Durant Reports</h2>{busy && !tickets.length ? <p>Loading…</p> : tickets.map(ticket => <button key={ticket.id} className={ticket.id === selected?.id ? 'active' : ''} onClick={() => setSelectedId(String(ticket.legacy_id || ticket.id))}><strong>#{ticket.legacy_id}</strong><span>{ticket.product_description || ticket.product_category}</span></button>)}</aside><section className="durant-ticket">{selected ? <><div className="durant-ticket-head"><div><h1>Durant Report #{selected.legacy_id}</h1><p>{selected.customer?.first_name} {selected.customer?.last_name} · {selected.customer?.phone} · {selected.customer?.email}</p><p><strong>{selected.product_description || selected.product_category}</strong> — {selected.problem_info}</p></div><span className={`durant-status ${proposal.status}`}>{proposal.status === 'ready' ? 'Ready for GadgetBoy Review' : proposal.status}</span></div><label>Findings<textarea rows={4} value={proposal.proposed_data?.findings || ''} onChange={e => setProposal((p: any) => ({ ...p, proposed_data: { ...p.proposed_data, findings: e.target.value } }))} /></label><div className="durant-grid"><label>Labor charge<input type="number" min="0" step="0.01" value={proposal.proposed_data?.laborCost || 0} onChange={e => setProposal((p: any) => ({ ...p, proposed_data: { ...p.proposed_data, laborCost: Number(e.target.value) } }))} /></label><label>Invoice link<input type="url" placeholder="https://supplier.example/invoice" value={proposal.proposed_data?.invoiceUrl || ''} onChange={e => setProposal((p: any) => ({ ...p, proposed_data: { ...p.proposed_data, invoiceUrl: e.target.value } }))} /></label></div><label className="durant-check"><input type="checkbox" checked={!!proposal.proposed_data?.durantFullTransfer} onChange={e => setProposal((p: any) => ({ ...p, proposed_data: { ...p.proposed_data, durantFullTransfer: e.target.checked } }))} />Full Transfer — diagnostic payment applies toward Durant bench fee</label><div className="durant-actions"><button onClick={() => void save('draft')} disabled={busy}>Save draft</button><button className="primary" onClick={() => void save('ready')} disabled={busy}>Ready for GadgetBoy Review</button><button onClick={() => window.print()}>Print receipt</button></div>{message && <p className="durant-message">{message}</p>}<div className="durant-collab"><section><h2>Shared Notes</h2><div className="durant-note-entry"><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note visible to GadgetBoy…"/><button onClick={() => void addNote()}>Add</button></div>{notes.map(row => <article key={row.id}><time>{new Date(row.created_at).toLocaleString()}</time><p>{row.body}</p></article>)}</section><section><h2>History</h2>{history.map(row => <article key={row.id}><time>{new Date(row.created_at).toLocaleString()}</time><strong>{row.summary}</strong></article>)}</section></div></> : <p>No Durant Report tickets are assigned to this shop.</p>}</section></div></main>;
}
