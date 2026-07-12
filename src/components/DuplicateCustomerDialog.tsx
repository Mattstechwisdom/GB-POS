import React from 'react';
import { customerDisplayName, duplicateReasonsLabel, CustomerDuplicateMatch } from '../lib/customerDuplicates';

type Props = {
  matches: CustomerDuplicateMatch[];
  onOpenCustomer: (customerId: number) => void | Promise<void>;
  onClose: () => void;
};

const DuplicateCustomerDialog: React.FC<Props> = ({ matches, onOpenCustomer, onClose }) => {
  const first = matches[0]?.customer;
  const count = matches.length;

  if (!first) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-lg bg-zinc-950 border border-red-500/70 rounded shadow-2xl">
        <div className="px-4 py-3 border-b border-red-500/40">
          <div className="text-red-300 text-xs font-bold uppercase tracking-wide">Client Already Exists</div>
          <div className="mt-1 text-lg font-semibold text-zinc-100">
            Possible duplicate client found
          </div>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm text-zinc-300">
            This client appears to already be in the POS. Review the existing client before creating another record.
          </p>

          <div className="max-h-56 overflow-y-auto border border-zinc-800 rounded">
            {matches.slice(0, 5).map((match) => (
              <button
                key={match.customer.id}
                type="button"
                onClick={() => onOpenCustomer(Number(match.customer.id))}
                className="w-full text-left px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border-b border-zinc-800 last:border-b-0"
              >
                <div className="text-sm font-semibold text-zinc-100">
                  {customerDisplayName(match.customer)}
                </div>
                <div className="mt-0.5 text-xs text-zinc-400">
                  {duplicateReasonsLabel(match.reasons)}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {[match.customer.phone, match.customer.phoneAlt, match.customer.email].filter(Boolean).join(' | ') || `Client #${match.customer.id}`}
                </div>
              </button>
            ))}
          </div>

          {count > 5 && (
            <div className="text-xs text-zinc-500">
              {count - 5} more possible matches were found. Open the first matching client or search clients to review the full list.
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-zinc-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-semibold rounded border border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500"
          >
            Close Popup
          </button>
          <button
            type="button"
            onClick={() => onOpenCustomer(Number(first.id))}
            className="px-3 py-2 text-sm font-semibold rounded bg-[#39FF14] text-black hover:bg-[#6bff52]"
          >
            Open Client Info
          </button>
        </div>
      </div>
    </div>
  );
};

export default DuplicateCustomerDialog;
