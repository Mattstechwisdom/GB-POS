import React, { useState, useEffect } from 'react';
import Input from './Input';
import Select from './Select';
import Button from './Button';
import Textarea from './Input';
import { Customer } from '../lib/types';

interface Props {
  customer?: Partial<Customer>;
  onChange: (c: Partial<Customer>) => void;
}

const stores = ['Devine Street', 'Forest Acres', 'Online'];

const CustomerForm: React.FC<Props> = ({ customer = {}, onChange }) => {
  const [local, setLocal] = useState<Partial<Customer>>(customer);

  useEffect(() => setLocal(customer), [customer]);

  function update(k: string, v: any) {
    const next = { ...local, [k]: v } as Partial<Customer>;
    setLocal(next);
    onChange(next);
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-[12px] text-zinc-400">First</label>
        <Input value={local.firstName || ''} onChange={e => update('firstName', e.target.value)} />
      </div>
      <div>
        <label className="block text-[12px] text-zinc-400">Last</label>
        <Input value={local.lastName || ''} onChange={e => update('lastName', e.target.value)} />
      </div>
      <div>
        <label className="block text-[12px] text-zinc-400">Email</label>
        <Input value={local.email || ''} onChange={e => update('email', e.target.value)} />
      </div>
      <div>
        <label className="block text-[12px] text-zinc-400">Phone</label>
        <Input value={local.phone || ''} onChange={e => update('phone', e.target.value)} />
      </div>
      <div>
        <label className="block text-[12px] text-zinc-400">Alt. Phone</label>
        <Input value={local.phoneAlt || ''} onChange={e => update('phoneAlt', e.target.value)} />
      </div>
      
      <div>
        <label className="block text-[12px] text-zinc-400">Zip</label>
        <Input value={local.zip || ''} onChange={e => update('zip', e.target.value)} />
      </div>
      <div className="col-span-2">
        <label className="block text-[12px] text-zinc-400">Notes</label>
        <textarea value={local.notes || ''} onChange={e => update('notes', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-sm h-28" />
      </div>
    </div>
  );
};

export default CustomerForm;
