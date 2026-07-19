import React from 'react';
import { Customer } from '../lib/types';
import { formatDate, formatPhone } from '../lib/format';

interface Props {
  customers: Customer[];
  selectedId?: number | null;
  onSelect: (c: Customer) => void;
  onActivate: (c: Customer) => void;
	onContextMenu?: (e: React.MouseEvent, c: Customer) => void;
}

const CustomerTable: React.FC<Props> = ({ customers, selectedId, onSelect, onActivate, onContextMenu }) => {
  return (
    <div className="w-full max-w-full border border-zinc-700 rounded overflow-hidden">
      <table className="gb-customer-table w-full table-fixed text-[11px] md:table-auto md:text-xs">
        <thead className="bg-zinc-800 text-zinc-400">
          <tr>
            <th className="w-[34%] px-2 py-2 text-left md:hidden">Full Name</th>
            <th className="hidden text-left px-2 py-1 md:table-cell">Create Date</th>
            <th className="hidden text-left px-2 py-1 md:table-cell">First</th>
            <th className="hidden text-left px-2 py-1 md:table-cell">Last</th>
            <th className="w-[29%] px-2 py-2 text-left md:w-auto md:py-1">Phone</th>
            <th className="w-[37%] px-2 py-2 text-left md:w-auto md:py-1">Email</th>
            <th className="hidden text-left px-2 py-1 md:table-cell">Phone (alt)</th>
          </tr>
        </thead>
        <tbody>
          {customers.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">No customers found.</td>
            </tr>
          )}
          {customers.map((c, i) => {
            const selected = c.id === selectedId;
            return (
              <tr
                key={c.id}
                onClick={() => onSelect(c)}
                onContextMenu={(e) => onContextMenu?.(e, c)}
                onDoubleClick={() => onActivate(c)}
                className={`${i % 2 ? 'bg-zinc-900' : 'bg-zinc-800'} cursor-pointer hover:bg-zinc-700/60 ${selected ? 'outline-none' : ''}`}
              >
                <td className={`truncate border-l-4 px-2 py-2 font-medium md:hidden ${selected ? 'border-neon-green' : 'border-transparent'}`} title={[c.firstName, c.lastName].filter(Boolean).join(' ')}>{[c.firstName, c.lastName].filter(Boolean).join(' ') || `Client #${c.id}`}</td>
                <td className={`hidden px-2 py-1 border-l-4 md:table-cell ${selected ? 'border-neon-green' : 'border-transparent'}`}>{c.createdAt ? formatDate(c.createdAt) : ''}</td>
                <td className="hidden px-2 py-1 md:table-cell">{c.firstName}</td>
                <td className="hidden px-2 py-1 md:table-cell">{c.lastName}</td>
                <td className="truncate px-2 py-2 md:py-1" title={formatPhone(c.phone || '') || c.phone}>{formatPhone(c.phone || '') || c.phone}</td>
                <td className="truncate px-2 py-2 md:max-w-[180px] md:py-1" title={c.email || ''}>{c.email}</td>
                <td className="hidden px-2 py-1 md:table-cell">{formatPhone((c as any).phoneAlt || '') || (c as any).phoneAlt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default CustomerTable;
