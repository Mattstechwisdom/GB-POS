import React, { useEffect, useMemo, useState } from 'react';

type FeedbackEntry = {
  id: number | string;
  subject: string;
  body: string;
  completed?: boolean;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

const blankDraft = () => ({ subject: '', body: '' });
const COMPLETED_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

function completedExpiry(entry: FeedbackEntry) {
  if (!entry.completed) return 0;
  const completedAt = new Date(entry.completedAt || entry.updatedAt || '').getTime();
  return Number.isNaN(completedAt) ? 0 : completedAt + COMPLETED_RETENTION_MS;
}

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

export default function FeedbackWindow() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [selected, setSelected] = useState<FeedbackEntry | null>(null);
  const [draft, setDraft] = useState(blankDraft);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadEntries = async () => {
    try {
      const list = await window.api.dbGet('feedbackEntries');
      const loaded = Array.isArray(list) ? list as FeedbackEntry[] : [];
      const now = Date.now();
      const expired = loaded.filter(entry => {
        const expiry = completedExpiry(entry);
        return expiry > 0 && expiry <= now;
      });
      if (expired.length) {
        await Promise.all(expired.map(entry => window.api.dbDelete('feedbackEntries', entry.id)));
      }
      setEntries(loaded.filter(entry => !expired.some(item => String(item.id) === String(entry.id))).sort((left: FeedbackEntry, right: FeedbackEntry) => {
        if (!!left.completed !== !!right.completed) return left.completed ? 1 : -1;
        return String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || ''));
      }));
    } catch {
      setError('Feedback could not be loaded.');
    }
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  const openNew = () => {
    setSelected(null);
    setDraft(blankDraft());
    setError('');
    setEditorOpen(true);
  };

  const openEntry = (entry: FeedbackEntry) => {
    setSelected(entry);
    setDraft({ subject: entry.subject || '', body: entry.body || '' });
    setError('');
    setEditorOpen(true);
  };

  const save = async () => {
    const subject = draft.subject.trim();
    const body = draft.body.trim();
    if (!subject || !body) {
      setError('Enter both a subject and details.');
      return;
    }
    setSaving(true);
    setError('');
    const now = new Date().toISOString();
    try {
      if (selected) {
        await window.api.dbUpdate('feedbackEntries', selected.id, { ...selected, subject, body, updatedAt: now });
      } else {
        await window.api.dbAdd('feedbackEntries', { id: crypto.randomUUID(), subject, body, completed: false, createdAt: now, updatedAt: now });
      }
      setEditorOpen(false);
      await loadEntries();
    } catch {
      setError('Feedback could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCompleted = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    const completed = !selected.completed;
    try {
      await window.api.dbUpdate('feedbackEntries', selected.id, {
        ...selected,
        completed,
        completedAt: completed ? new Date().toISOString() : undefined,
        updatedAt: new Date().toISOString(),
      });
      setEditorOpen(false);
      await loadEntries();
    } catch {
      setError('Feedback status could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete feedback "${selected.subject}"? This cannot be undone.`)) return;
    setSaving(true);
    setError('');
    try {
      await window.api.dbDelete('feedbackEntries', selected.id);
      setEditorOpen(false);
      setSelected(null);
      await loadEntries();
    } catch {
      setError('Feedback could not be deleted.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!editorOpen || !selected) return;
    const onDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      void deleteSelected();
    };
    window.addEventListener('keydown', onDeleteKey);
    return () => window.removeEventListener('keydown', onDeleteKey);
  }, [editorOpen, selected]);

  const counts = useMemo(() => ({ open: entries.filter(entry => !entry.completed).length, completed: entries.filter(entry => entry.completed).length }), [entries]);

  return (
    <div className="min-h-full bg-zinc-900 p-5 text-zinc-100 sm:p-7">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 border-b border-zinc-700 pb-4">
        <div>
          <h1 className="text-xl font-bold">Feedback</h1>
          <p className="mt-1 text-sm text-zinc-400">{counts.open} open, {counts.completed} completed</p>
        </div>
        <button type="button" onClick={openNew} className="rounded border border-[#39FF14] bg-[#39FF14] px-4 py-2 text-sm font-bold text-black hover:brightness-110">New Feedback</button>
      </div>
      {error && !editorOpen ? <div className="mx-auto mt-4 max-w-4xl rounded border border-red-500/60 bg-red-950/40 px-3 py-2 text-sm text-red-100">{error}</div> : null}
      <div className="mx-auto mt-4 max-w-4xl overflow-hidden rounded border border-zinc-700 bg-zinc-950">
        {entries.length === 0 ? <div className="p-8 text-center text-sm text-zinc-400">No feedback has been logged yet.</div> : entries.map(entry => (
          <button key={String(entry.id)} type="button" onClick={() => openEntry(entry)} className="flex w-full items-center gap-3 border-b border-zinc-800 px-4 py-3 text-left last:border-b-0 hover:bg-zinc-900">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${entry.completed ? 'bg-zinc-600' : 'bg-[#39FF14]'}`} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.subject}</span>
            <span className={`shrink-0 text-xs ${entry.completed ? 'text-zinc-500' : 'text-[#39FF14]'}`}>{entry.completed ? 'Completed - retained 3 days' : 'Open'}</span>
            <span className="hidden shrink-0 text-xs text-zinc-500 sm:block">{formatDate(entry.updatedAt || entry.createdAt)}</span>
          </button>
        ))}
      </div>
      {editorOpen ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={selected ? 'Edit feedback' : 'New feedback'} onMouseDown={event => { if (event.target === event.currentTarget) setEditorOpen(false); }}>
          <div className="w-full max-w-xl rounded border border-zinc-600 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{selected ? 'Feedback Details' : 'New Feedback'}</h2><button type="button" onClick={() => setEditorOpen(false)} className="rounded border border-zinc-700 px-2 py-1 text-sm text-zinc-300 hover:border-red-500 hover:text-white">Close</button></div>
            <label className="mb-3 block text-sm font-semibold text-zinc-300">Subject<input value={draft.subject} onChange={event => setDraft(current => ({ ...current, subject: event.target.value }))} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 outline-none focus:border-[#39FF14]" /></label>
            <label className="block text-sm font-semibold text-zinc-300">Details<textarea value={draft.body} onChange={event => setDraft(current => ({ ...current, body: event.target.value }))} rows={8} className="mt-1 w-full resize-y rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 outline-none focus:border-[#39FF14]" /></label>
            {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
            {selected?.completed ? <p className="mt-3 text-xs text-zinc-400">Completed feedback is automatically removed three days after completion.</p> : null}
            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {selected ? <button type="button" disabled={saving} onClick={() => void toggleCompleted()} className="rounded border border-amber-400 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-400/10 disabled:opacity-60">{selected.completed ? 'Reopen' : 'Mark Completed'}</button> : null}
                {selected ? <button type="button" disabled={saving} onClick={() => void deleteSelected()} className="rounded border border-red-500 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-60">Delete</button> : null}
              </div>
              <button type="button" disabled={saving} onClick={() => void save()} className="rounded border border-[#39FF14] bg-[#39FF14] px-4 py-2 text-sm font-bold text-black hover:brightness-110 disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
