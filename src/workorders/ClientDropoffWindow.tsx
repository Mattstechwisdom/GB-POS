import React, { useEffect, useMemo, useRef, useState } from 'react';
import { deviceTypes } from '../lib/deviceTypes';
import { publicAsset } from '../lib/publicAsset';
import { buildDropoffCatalog, buildDropoffWorkOrder, findDropoffCustomer } from '../lib/clientDropoff';

const emptyForm = { firstName: '', lastName: '', phone: '', email: '', deviceCategory: '', deviceName: '', customCategory: '', customDevice: '', problem: '', unlockType: 'None', password: '' };

export default function ClientDropoffWindow() {
  const [form, setForm] = useState(emptyForm);
  const [catalogRows, setCatalogRows] = useState<any[]>([]);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const holdTimer = useRef<number | null>(null);

  useEffect(() => { void (window as any).api?.dbGet?.('deviceCategories').then((rows: any[]) => setCatalogRows(Array.isArray(rows) ? rows : [])).catch(() => setCatalogRows([])); }, []);
  const catalog = useMemo(() => buildDropoffCatalog(catalogRows, deviceTypes.map(row => row.label || row.type)), [catalogRows]);
  const deviceOptions = form.deviceCategory === 'Other' ? ['Other'] : (catalog.devicesByCategory[form.deviceCategory] || ['Other']);
  const set = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const returnToCommandCenter = () => {
    window.close();
    window.setTimeout(() => { if (!window.closed) window.location.href = `${window.location.origin}${window.location.pathname}`; }, 120);
  };
  const startHold = () => { holdTimer.current = window.setTimeout(returnToCommandCenter, 1200); };
  const cancelHold = () => { if (holdTimer.current != null) window.clearTimeout(holdTimer.current); holdTimer.current = null; };

  const submit = async () => {
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    const deviceCategory = form.deviceCategory === 'Other' ? form.customCategory.trim() : form.deviceCategory;
    const deviceName = form.deviceName === 'Other' ? form.customDevice.trim() : form.deviceName;
    if (!firstName || !lastName || (!phone && !email) || !deviceCategory || !deviceName || !form.problem.trim()) {
      setError('Please complete your name, phone or email, device information, and the problem description.');
      return;
    }
    setBusy(true); setError('');
    try {
      const api: any = (window as any).api;
      const customers = await api.dbGet('customers');
      let customer = findDropoffCustomer(customers, { phone, email });
      if (!customer) customer = await api.dbAdd('customers', { firstName, lastName, phone, email, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      if (!customer?.id) throw new Error('Client information could not be saved.');
      const workOrder = buildDropoffWorkOrder({ customerId: customer.id, customerName: `${firstName} ${lastName}`, customerPhone: phone, customerEmail: email, deviceCategory, deviceName, problem: form.problem, unlockType: form.unlockType, password: form.unlockType === 'None' ? '' : form.password });
      const saved = await api.dbAdd('workOrders', workOrder);
      if (!saved?.id) throw new Error('The dropoff could not be added.');
      setComplete(true);
    } catch (caught: any) { setError(caught?.message || 'The form could not be completed. Please hand the device to a technician.'); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen overflow-auto bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-8">
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl sm:p-8">
      <header className="mb-7 text-center">
        <img src={publicAsset('logo.png')} alt="GadgetBoy" className="mx-auto h-20 w-auto select-none object-contain" draggable={false} onDoubleClick={returnToCommandCenter} onPointerDown={startHold} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold} />
        <h1 className="mt-3 text-2xl font-black text-[#39FF14]">Device Dropoff</h1>
        {!complete ? <p className="mt-2 text-sm text-zinc-400">Tell us who you are and what is happening with your device.</p> : null}
      </header>
      {complete ? <div className="py-12 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#39FF14] text-3xl font-black text-zinc-950">✓</div>
        <h2 className="text-2xl font-bold">Your form is complete</h2>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-zinc-300">Please hand the device back to a technician to complete your dropoff.</p>
      </div> : <form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-6">
        <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 text-base font-bold text-zinc-200">Your information</legend>
          <label className="text-sm text-zinc-300">First name<input autoComplete="given-name" value={form.firstName} onChange={e => set('firstName', e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-3 text-base" /></label>
          <label className="text-sm text-zinc-300">Last name<input autoComplete="family-name" value={form.lastName} onChange={e => set('lastName', e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-3 text-base" /></label>
          <label className="text-sm text-zinc-300">Phone<input inputMode="tel" autoComplete="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-3 text-base" /></label>
          <label className="text-sm text-zinc-300">Email<input inputMode="email" autoComplete="email" value={form.email} onChange={e => set('email', e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-3 text-base" /></label>
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 text-base font-bold text-zinc-200">Your device</legend>
          <label className="text-sm text-zinc-300">Device category<select value={form.deviceCategory} onChange={e => setForm(current => ({ ...current, deviceCategory: e.target.value, deviceName: '', customCategory: '', customDevice: '' }))} className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-3 text-base"><option value="">Select a category</option>{catalog.categories.map(value => <option key={value}>{value}</option>)}</select></label>
          {form.deviceCategory === 'Other' ? <label className="text-sm text-zinc-300">Category name<input value={form.customCategory} onChange={e => set('customCategory', e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-3 text-base" /></label> : null}
          <label className="text-sm text-zinc-300">Device name<select disabled={!form.deviceCategory} value={form.deviceName} onChange={e => setForm(current => ({ ...current, deviceName: e.target.value, customDevice: '' }))} className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-3 text-base disabled:opacity-50"><option value="">Select a device</option>{deviceOptions.map(value => <option key={value}>{value}</option>)}</select></label>
          {form.deviceName === 'Other' ? <label className="text-sm text-zinc-300">What device is it?<input value={form.customDevice} onChange={e => set('customDevice', e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-3 text-base" /></label> : null}
        </fieldset>
        <label className="block text-sm text-zinc-300">Describe the problem or issue<textarea value={form.problem} onChange={e => set('problem', e.target.value)} rows={5} className="mt-1 w-full resize-y rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-3 text-base" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-zinc-300">Device lock<select value={form.unlockType} onChange={e => set('unlockType', e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-3 text-base"><option>None</option><option>Password</option><option>PIN</option><option>Pattern</option></select></label>{form.unlockType !== 'None' ? <label className="text-sm text-zinc-300">Password, PIN, or pattern<input value={form.password} onChange={e => set('password', e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-3 text-base" /></label> : null}</div>
        {error ? <p role="alert" className="rounded-lg border border-red-500/50 bg-red-950/40 p-3 text-sm text-red-200">{error}</p> : null}
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#39FF14] px-5 py-4 text-lg font-black text-zinc-950 disabled:opacity-60">{busy ? 'Completing…' : 'Complete Form'}</button>
      </form>}
    </section>
  </main>;
}
