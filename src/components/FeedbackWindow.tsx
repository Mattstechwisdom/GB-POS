import React, { useEffect, useMemo, useRef, useState } from 'react';

type FeedbackAttachment = {
  id: string;
  name: string;
  contentType: string;
  dataUrl: string;
  size: number;
};

type FeedbackEntry = {
  id: number | string;
  subject: string;
  body: string;
  completed?: boolean;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  attachments?: FeedbackAttachment[];
};

const blankDraft = () => ({ subject: '', body: '', attachments: [] as FeedbackAttachment[] });
const COMPLETED_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_FEEDBACK_IMAGES = 4;
const MAX_FEEDBACK_IMAGE_BYTES = 900_000;

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected image could not be opened.'));
    image.src = dataUrl;
  });
}

async function prepareFeedbackImage(file: File): Promise<FeedbackAttachment> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
  const source = await fileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, 1440 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This device could not prepare the screenshot.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  let dataUrl = canvas.toDataURL('image/webp', 0.82);
  let estimatedBytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
  if (estimatedBytes > MAX_FEEDBACK_IMAGE_BYTES) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.68);
    estimatedBytes = Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
  }
  if (estimatedBytes > MAX_FEEDBACK_IMAGE_BYTES) throw new Error(`${file.name} is still too large after compression. Crop it and try again.`);
  return {
    id: crypto.randomUUID(),
    name: file.name || 'Screenshot',
    contentType: dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/webp',
    dataUrl,
    size: estimatedBytes,
  };
}

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
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<FeedbackAttachment | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

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
    setDraft({ subject: entry.subject || '', body: entry.body || '', attachments: Array.isArray(entry.attachments) ? entry.attachments : [] });
    setError('');
    setEditorOpen(true);
  };

  const importScreenshots = async (files: FileList | null) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    const remaining = MAX_FEEDBACK_IMAGES - draft.attachments.length;
    if (remaining <= 0) {
      setError(`Feedback can include up to ${MAX_FEEDBACK_IMAGES} screenshots.`);
      return;
    }
    setAttachmentBusy(true);
    setError('');
    try {
      const prepared: FeedbackAttachment[] = [];
      for (const file of selectedFiles.slice(0, remaining)) prepared.push(await prepareFeedbackImage(file));
      setDraft((current) => ({ ...current, attachments: [...current.attachments, ...prepared] }));
      if (selectedFiles.length > remaining) setError(`Only the first ${remaining} screenshot${remaining === 1 ? '' : 's'} were added. The limit is ${MAX_FEEDBACK_IMAGES}.`);
    } catch (importError: any) {
      setError(importError?.message || 'The screenshot could not be imported.');
    } finally {
      setAttachmentBusy(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    }
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
        await window.api.dbUpdate('feedbackEntries', selected.id, { ...selected, subject, body, attachments: draft.attachments, updatedAt: now });
      } else {
        await window.api.dbAdd('feedbackEntries', { id: crypto.randomUUID(), subject, body, attachments: draft.attachments, completed: false, createdAt: now, updatedAt: now });
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
    const deletingId = selected.id;
    setSaving(true);
    setError('');
    try {
      const deleted = await window.api.dbDelete('feedbackEntries', deletingId);
      if (!deleted) throw new Error('The feedback entry was not found in storage.');
      setEntries(current => current.filter(entry => String(entry.id) !== String(deletingId)));
      setEditorOpen(false);
      setSelected(null);
      await loadEntries();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Feedback could not be deleted.');
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
            <section className="mt-3 rounded border border-zinc-700 bg-zinc-950/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="text-sm font-semibold text-zinc-200">Screenshots</h3><p className="text-xs text-zinc-500">Up to {MAX_FEEDBACK_IMAGES}; images are compressed before syncing.</p></div>
                <button type="button" disabled={attachmentBusy || draft.attachments.length >= MAX_FEEDBACK_IMAGES} onClick={() => attachmentInputRef.current?.click()} className="rounded border border-violet-400 bg-violet-500/15 px-3 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-500/25 disabled:opacity-50">{attachmentBusy ? 'Importing...' : 'Import'}</button>
                <input ref={attachmentInputRef} type="file" accept="image/*" multiple className="hidden" aria-label="Import feedback screenshots" onChange={event => { void importScreenshots(event.target.files); }} />
              </div>
              {draft.attachments.length ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{draft.attachments.map((attachment) => <div key={attachment.id} className="group relative overflow-hidden rounded border border-zinc-700 bg-zinc-900"><button type="button" className="block aspect-video w-full overflow-hidden" onClick={() => setPreviewAttachment(attachment)} aria-label={`Preview ${attachment.name}`}><img src={attachment.dataUrl} alt={attachment.name} className="h-full w-full object-cover" /></button><div className="truncate px-2 py-1.5 text-[11px] text-zinc-400" title={attachment.name}>{attachment.name}</div><button type="button" aria-label={`Remove ${attachment.name}`} className="absolute right-1 top-1 rounded bg-black/80 px-2 py-1 text-xs font-bold text-white hover:bg-red-700" onClick={() => setDraft(current => ({ ...current, attachments: current.attachments.filter(item => item.id !== attachment.id) }))}>X</button></div>)}</div> : <p className="mt-3 text-xs text-zinc-500">No screenshots attached.</p>}
            </section>
            {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
            {selected?.completed ? <p className="mt-3 text-xs text-zinc-400">Completed feedback is automatically removed three days after completion.</p> : null}
            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {selected ? <button type="button" disabled={saving} onClick={() => void toggleCompleted()} className="rounded border border-amber-400 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-400/10 disabled:opacity-60">{selected.completed ? 'Reopen' : 'Mark Completed'}</button> : null}
                {selected ? <button type="button" aria-label="Delete feedback" disabled={saving} onClick={() => void deleteSelected()} className="rounded border border-red-500 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-60">Delete</button> : null}
              </div>
              <button type="button" disabled={saving} onClick={() => void save()} className="rounded border border-[#39FF14] bg-[#39FF14] px-4 py-2 text-sm font-bold text-black hover:brightness-110 disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      ) : null}
      {previewAttachment ? <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-label="Screenshot preview" onMouseDown={event => { if (event.target === event.currentTarget) setPreviewAttachment(null); }}><div className="relative max-h-[92dvh] max-w-[94vw]"><img src={previewAttachment.dataUrl} alt={previewAttachment.name} className="max-h-[88dvh] max-w-[92vw] rounded border border-zinc-600 object-contain shadow-2xl" /><button type="button" onClick={() => setPreviewAttachment(null)} className="absolute right-2 top-2 rounded bg-black/80 px-3 py-2 text-sm font-bold text-white">Close</button></div></div> : null}
    </div>
  );
}
