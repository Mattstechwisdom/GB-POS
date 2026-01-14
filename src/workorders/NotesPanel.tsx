import React, { useState } from 'react';

interface NoteEntry { id: number; text: string; createdAt?: string }
interface Props { notes: string; onChange: (n: string) => void; log?: NoteEntry[]; onAdd?: (text: string) => void }

const NotesPanel: React.FC<Props> = ({ notes, onChange, log = [], onAdd }) => {
  const [draft, setDraft] = useState('');

  function add() {
    if (!draft.trim()) return;
    if (onAdd) {
      onAdd(draft.trim());
    } else {
      const stamp = new Date().toISOString().slice(0,16).replace('T',' ');
      onChange((notes || '') + (notes ? '\n' : '') + `${stamp} — ${draft.trim()}`);
    }
    setDraft('');
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-3">
      <h4 className="text-sm font-semibold text-zinc-200 mb-2">Internal notes</h4>
      <div className="grid" style={{ gridTemplateColumns: '220px 1fr', columnGap: 12 }}>
        <div className="flex flex-col">
          <textarea className="w-full h-28 bg-zinc-800 border border-zinc-700 rounded p-2 text-sm resize-none" placeholder="Add note..." value={draft} onChange={e => setDraft(e.target.value)} />
          <div className="flex justify-end mt-2">
            <button className="px-3 py-1 rounded font-semibold bg-neon-green text-zinc-900 text-xs shadow hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-neon-green/70 active:scale-[0.97]" onClick={add}>Add</button>
          </div>
        </div>
        <div className="min-h-[112px] max-h-40 overflow-y-auto pr-1 text-xs space-y-1">
          {log.length === 0 && <div className="text-zinc-500 italic">No notes yet</div>}
          {log.slice().reverse().map(entry => {
            const stamp = entry.createdAt || entry.text.slice(0,16); // fallback
            return (
              <div key={entry.id} className="border border-zinc-700 rounded p-2 bg-zinc-800/60">
                <div className="text-[10px] text-zinc-400 mb-1 font-mono">{stamp}</div>
                <div className="whitespace-pre-wrap leading-snug">{entry.text.replace(/^\d{4}-\d{2}-\d{2}[^—]*—\s*/, '')}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default NotesPanel;
