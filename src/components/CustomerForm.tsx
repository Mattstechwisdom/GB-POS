import React, { useEffect, useMemo, useRef, useState } from 'react';
import Input from './Input';
import { formatNameCase, formatPhoneTyping } from '../lib/format';
import { Customer } from '../lib/types';

interface Props {
  customer?: Partial<Customer>;
  onChange: (c: Partial<Customer>) => void;
}

const EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'aol.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'live.com',
  'msn.com',
];

const CustomerForm: React.FC<Props> = ({ customer = {}, onChange }) => {
  const [local, setLocal] = useState<Partial<Customer>>(customer);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [phoneAltTouched, setPhoneAltTouched] = useState(false);
  const emailListIdRef = useRef(`gbpos-email-suggestions-${Math.random().toString(36).slice(2)}`);

  // Sync local state only when the customer's id changes (a different customer was loaded).
  // This suppresses the round-trip re-render caused by our own onChange being reflected
  // back down as a new object reference from the parent on every keystroke.
  const customerId = (customer as any)?.id;
  useEffect(() => {
    setLocal(customer);
    setPhoneTouched(false);
    setPhoneAltTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const emailSuggestions = useMemo(() => {
    const raw = String(local.email || '').trim();
    if (!raw) return [] as string[];
    const atIndex = raw.indexOf('@');
    const user = atIndex >= 0 ? raw.slice(0, atIndex) : raw;
    const domainPart = atIndex >= 0 ? raw.slice(atIndex + 1).toLowerCase() : '';
    if (!user) return [] as string[];
    const domains = EMAIL_DOMAINS.filter(d => !domainPart || d.startsWith(domainPart));
    return domains.map(d => `${user}@${d}`);
  }, [local.email]);

  function update(k: string, v: any) {
    const next = { ...local, [k]: v } as Partial<Customer>;
    setLocal(next);
    onChange(next);
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-[12px] text-zinc-400">First</label>
        <Input
          value={local.firstName || ''}
          onChange={e => update('firstName', formatNameCase(e.target.value))}
          autoComplete="given-name"
        />
      </div>
      <div>
        <label className="block text-[12px] text-zinc-400">Last</label>
        <Input
          value={local.lastName || ''}
          onChange={e => update('lastName', formatNameCase(e.target.value))}
          autoComplete="family-name"
        />
      </div>
      <div>
        <label className="block text-[12px] text-zinc-400">Phone</label>
        <Input
          value={local.phone || ''}
          onChange={e => update('phone', formatPhoneTyping(e.target.value))}
          onBlur={() => setPhoneTouched(true)}
          inputMode="tel"
          autoComplete="tel"
        />
        {phoneTouched && local.phone && local.phone.replace(/\D/g, '').length !== 10 ? (
          <div className="mt-1 text-[11px] text-red-400">Phone should be 10 digits (###-###-####)</div>
        ) : null}
      </div>
      <div>
        <label className="block text-[12px] text-zinc-400">Email</label>
        <Input
          value={local.email || ''}
          onChange={e => update('email', e.target.value)}
          list={emailListIdRef.current}
          inputMode="email"
          autoComplete="email"
        />
        <datalist id={emailListIdRef.current}>
          {emailSuggestions.map(s => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="block text-[12px] text-zinc-400">Alt. Phone</label>
        <Input
          value={local.phoneAlt || ''}
          onChange={e => update('phoneAlt', formatPhoneTyping(e.target.value))}
          onBlur={() => setPhoneAltTouched(true)}
          inputMode="tel"
          autoComplete="tel"
        />
        {phoneAltTouched && local.phoneAlt && local.phoneAlt.replace(/\D/g, '').length !== 10 ? (
          <div className="mt-1 text-[11px] text-red-400">Alt. phone should be 10 digits (###-###-####)</div>
        ) : null}
      </div>

      <div>
        <label className="block text-[12px] text-zinc-400">Zip</label>
        <Input value={local.zip || ''} onChange={e => update('zip', e.target.value)} inputMode="numeric" autoComplete="postal-code" />
      </div>
      <div className="col-span-2">
        <label className="block text-[12px] text-zinc-400">Notes</label>
        <textarea value={local.notes || ''} onChange={e => update('notes', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-sm h-28" />
      </div>
    </div>
  );
};

export default CustomerForm;
