import React from 'react';
import { Customer } from '../lib/types';
import { formatDate } from '../lib/format';

interface Props {
  customers: Customer[];
  selectedId?: number | null;
  onSelect: (c: Customer) => void;
  onActivate: (c: Customer) => void;
}

const CustomerTable: React.FC<Props> = ({ customers, selectedId, onSelect, onActivate }) => {
  return (
    <div className="border border-zinc-700 rounded overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-zinc-800 text-zinc-400">
          <tr>
            <th className="text-left px-2 py-1">Create Date</th>
            <th className="text-left px-2 py-1">First</th>
            <th className="text-left px-2 py-1">Last</th>
            <th className="text-left px-2 py-1">Phone</th>
            <th className="text-left px-2 py-1">Email</th>
            <th className="text-left px-2 py-1">Phone (alt)</th>
          </tr>
        </thead>
        <tbody>
          {customers.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">No customers found.</td>
            </tr>
          )}
          {customers.map((c, i) => {
            const selected = c.id === selectedId;
            return (
              <tr
                key={c.id}
                onClick={() => onSelect(c)}
                onDoubleClick={() => onActivate(c)}
                className={`${i % 2 ? 'bg-zinc-900' : 'bg-zinc-800'} cursor-pointer hover:bg-zinc-700/60 ${selected ? 'outline-none' : ''}`}
              >
                <td className={`px-2 py-1 border-l-4 ${selected ? 'border-neon-green' : 'border-transparent'}`}>{c.createdAt ? formatDate(c.createdAt) : ''}</td>
                <td className="px-2 py-1">{c.firstName}</td>
                <td className="px-2 py-1">{c.lastName}</td>
                <td className="px-2 py-1">{c.phone}</td>
                <td className="px-2 py-1 truncate max-w-[180px]">{c.email}</td>
                <td className="px-2 py-1">{c.phoneAlt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default CustomerTable;
