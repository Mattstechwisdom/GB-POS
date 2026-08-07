import React, { useEffect, useMemo, useRef, useState } from 'react';
import Input from './Input';
import { formatNameCase, formatPhoneTyping } from '../lib/format';
import { Customer } from '../lib/types';

interface Props {
  customer?: Partial<Customer>;
  onChange: (c: Partial<Customer>) => void;
  requireContactDecision?: boolean;
  declinedPhone?: boolean;
  declinedEmail?: boolean;
  onDeclinedPhoneChange?: (declined: boolean) => void;
  onDeclinedEmailChange?: (declined: boolean) => void;
  keyboardSafeEmail?: boolean;
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

const CustomerForm: React.FC<Props> = ({
  customer = {},
  onChange,
  requireContactDecision = false,
  declinedPhone = false,
  declinedEmail = false,
  onDeclinedPhoneChange,
  onDeclinedEmailChange,
  keyboardSafeEmail = false,
}) => {
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
    <div className="gb-customer-form-grid grid grid-cols-2 gap-3">
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
        <div className="mb-1 flex min-h-4 items-center justify-between gap-2">
          <label className="block text-[12px] text-zinc-400">Phone</label>
          {requireContactDecision ? <label className="flex shrink-0 items-center gap-1 text-[10px] text-zinc-400"><input type="checkbox" aria-label="Phone contact declined" className="h-3.5 w-3.5 shrink-0 accent-[#BC13FE]" style={{ width: 14, minWidth: 14, maxWidth: 14, height: 14, minHeight: 14, maxHeight: 14 }} checked={declinedPhone} onChange={event => { const checked = event.target.checked; if (checked) update('phone', ''); onDeclinedPhoneChange?.(checked); }} />Declined</label> : null}
        </div>
        <Input
          value={local.phone || ''}
          onChange={e => { onDeclinedPhoneChange?.(false); update('phone', formatPhoneTyping(e.target.value)); }}
          onBlur={() => setPhoneTouched(true)}
          inputMode="tel"
          autoComplete="tel"
          disabled={requireContactDecision && declinedPhone}
        />
        {phoneTouched && local.phone && local.phone.replace(/\D/g, '').length !== 10 ? (
          <div className="mt-1 text-[11px] text-red-400">Phone should be 10 digits (###-###-####)</div>
        ) : null}
      </div>
      <div>
        <div className="mb-1 flex min-h-4 items-center justify-between gap-2">
          <label className="block text-[12px] text-zinc-400">Email</label>
          {requireContactDecision ? <label className="flex shrink-0 items-center gap-1 text-[10px] text-zinc-400"><input type="checkbox" aria-label="Email contact declined" className="h-3.5 w-3.5 shrink-0 accent-[#BC13FE]" style={{ width: 14, minWidth: 14, maxWidth: 14, height: 14, minHeight: 14, maxHeight: 14 }} checked={declinedEmail} onChange={event => { const checked = event.target.checked; if (checked) update('email', ''); onDeclinedEmailChange?.(checked); }} />Declined</label> : null}
        </div>
        <Input
          value={local.email || ''}
          onChange={e => { onDeclinedEmailChange?.(false); update('email', e.target.value); }}
          list={keyboardSafeEmail ? undefined : emailListIdRef.current}
          inputMode="email"
          autoComplete="email"
          disabled={requireContactDecision && declinedEmail}
        />
        {!keyboardSafeEmail ? (
          <datalist id={emailListIdRef.current}>
            {emailSuggestions.map(s => (
              <option key={s} value={s} />
            ))}
          </datalist>
        ) : null}
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
      <div className="gb-customer-notes-field col-span-2">
        <label className="block text-[12px] text-zinc-400">Notes</label>
        <textarea value={local.notes || ''} onChange={e => update('notes', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-sm h-28" />
      </div>
    </div>
  );
};

export default CustomerForm;
