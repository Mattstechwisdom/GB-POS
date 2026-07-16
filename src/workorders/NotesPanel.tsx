import React, { useState } from 'react';

interface NoteEntry { id: number; text: string; createdAt?: string }
interface Props { notes: string; onChange: (n: string) => void; log?: NoteEntry[]; onAdd?: (text: string) => void }

function noteBody(text: string): string {
  return String(text || '').replace(/^\d{4}-\d{2}-\d{2}[^\n]*?(?: - | \u2014 | \u00e2\u20ac\u201d )/, '');
}

const NotesPanel: React.FC<Props> = ({ notes, onChange, log = [], onAdd }) => {
  const [draft, setDraft] = useState('');
  const [journalOpen, setJournalOpen] = useState(false);

  function add() {
    if (!draft.trim()) return;
    if (onAdd) {
      onAdd(draft.trim());
    } else {
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      onChange((notes || '') + (notes ? '\n' : '') + `${stamp} - ${draft.trim()}`);
    }
    setDraft('');
  }

  const newest = log.slice().reverse().slice(0, 2);

  return (
    <div className="gb-wo-notes-card bg-zinc-900 border border-zinc-700 rounded p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <h4 className="text-sm font-semibold text-zinc-200">Internal notes</h4>
          <div className="text-[11px] text-zinc-500">Saved notes are archived to this work order.</div>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800 text-xs font-semibold text-zinc-100 hover:border-[#39FF14] hover:text-[#39FF14]"
          onClick={() => setJournalOpen(true)}
        >
          Repair Journal
        </button>
      </div>

      <div className="gb-wo-notes-layout grid" style={{ gridTemplateColumns: 'minmax(260px, 0.8fr) minmax(0, 1fr)', columnGap: 12 }}>
        <div className="flex flex-col">
          <textarea
            className="gb-wo-note-input w-full h-44 bg-zinc-800 border border-zinc-700 rounded p-2 text-sm resize-y min-h-[11rem]"
            placeholder="Add technician note..."
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          <div className="flex justify-end mt-2">
            <button
              className="px-3 py-1.5 rounded font-semibold bg-neon-green text-zinc-900 text-xs shadow hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-neon-green/70 active:scale-[0.97]"
              onClick={add}
            >
              Save Note
            </button>
          </div>
        </div>

        <div className="min-h-[11rem] overflow-y-auto pr-1 text-xs space-y-1">
          {newest.length === 0 && <div className="text-zinc-500 italic">No saved notes yet</div>}
          {newest.map(entry => {
            const stamp = entry.createdAt || entry.text.slice(0, 16);
            return (
              <div key={entry.id} className="border border-zinc-700 rounded p-2 bg-zinc-800/60">
                <div className="text-[10px] text-zinc-400 mb-1 font-mono">{stamp}</div>
                <div className="whitespace-pre-wrap leading-snug">{noteBody(entry.text)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {journalOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-2xl max-h-[82vh] bg-zinc-950 border border-zinc-700 rounded shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-zinc-100">Repair Journal</div>
                <div className="text-xs text-zinc-500">{log.length} saved note{log.length === 1 ? '' : 's'} on this work order</div>
              </div>
              <button
                type="button"
                aria-label="Close repair journal"
                className="h-9 w-9 flex items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-[#39FF14] hover:text-[#39FF14]"
                onClick={() => setJournalOpen(false)}
              >
                x
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {log.length === 0 && <div className="text-sm text-zinc-500 italic">No saved journal notes yet.</div>}
              {log.slice().reverse().map(entry => {
                const stamp = entry.createdAt || entry.text.slice(0, 16);
                return (
                  <div key={entry.id} className="border border-zinc-800 rounded p-3 bg-zinc-900">
                    <div className="text-[11px] text-zinc-500 mb-1 font-mono">{stamp}</div>
                    <div className="text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed">{noteBody(entry.text)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesPanel;
