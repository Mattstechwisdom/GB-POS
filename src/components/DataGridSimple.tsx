import React from 'react';

export default function DataGridSimple({ columns, rows, selectedId, onSelect } : any) {
  return (
    <div className="overflow-auto border border-zinc-700 rounded">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-zinc-800 text-left text-xs uppercase tracking-wide">
            {columns.map((c: any) => (
              <th key={c.key} className="px-3 py-2 font-semibold border-r border-zinc-700">{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} className={`cursor-pointer hover:bg-zinc-800 ${selectedId === r.id ? 'bg-zinc-700' : ''}`} onClick={() => onSelect?.(r.id)}>
              {columns.map((c: any) => (
                <td key={c.key} className="px-3 py-2 border-r border-zinc-700 align-top">{r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
