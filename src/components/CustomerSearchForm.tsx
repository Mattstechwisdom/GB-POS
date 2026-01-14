import React, { useState } from 'react';
import Input from './Input';
import Button from './Button';

export interface CustomerSearchFilters {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

interface Props {
  onSearch: (filters: CustomerSearchFilters) => void;
}

const CustomerSearchForm: React.FC<Props> = ({ onSearch }) => {
  const [filters, setFilters] = useState<CustomerSearchFilters>({ firstName: '', lastName: '', phone: '', email: '' });

  function update<K extends keyof CustomerSearchFilters>(key: K, value: string) {
    setFilters(f => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSearch(filters);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wide mb-1 text-zinc-400">First Name</label>
          <Input value={filters.firstName} onChange={e => update('firstName', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide mb-1 text-zinc-400">Last Name</label>
          <Input value={filters.lastName} onChange={e => update('lastName', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide mb-1 text-zinc-400">Phone</label>
          <Input value={filters.phone} onChange={e => update('phone', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide mb-1 text-zinc-400">Email</label>
          <Input value={filters.email} onChange={e => update('email', e.target.value)} />
        </div>
      </div>
      <div className="pt-1">
        <Button neon={false} type="submit" className="bg-blue-600 hover:bg-blue-500 focus:ring-blue-400">Search</Button>
      </div>
    </form>
  );
};

export default CustomerSearchForm;
