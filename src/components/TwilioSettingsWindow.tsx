import React, { useEffect, useState } from 'react';

const api = () => (window as any).api;

const TwilioSettingsWindow: React.FC = () => {
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [hasTokenSaved, setHasTokenSaved] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api().twilioGetConfig();
        if (cfg?.ok) {
          setAccountSid(cfg.accountSid || '');
          setFromNumber(cfg.fromNumber || '');
          setHasTokenSaved(!!cfg.hasAuthToken);
        }
      } catch {}
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const patch: any = {
        accountSid: accountSid.trim(),
        fromNumber: fromNumber.trim(),
      };
      if (authToken.trim()) patch.authToken = authToken.trim();
      const res = await api().twilioSetConfig(patch);
      if (res?.ok) {
        setHasTokenSaved(!!res.hasAuthToken);
        setAuthToken('');
        setStatus({ type: 'success', msg: 'Settings saved successfully.' });
      } else {
        setStatus({ type: 'error', msg: res?.error || 'Save failed.' });
      }
    } catch (e: any) {
      setStatus({ type: 'error', msg: String(e?.message || e) });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testPhone.trim()) {
      setStatus({ type: 'error', msg: 'Enter a phone number to test.' });
      return;
    }
    setTesting(true);
    setStatus(null);
    try {
      const res = await api().twilioSendSms({
        to: testPhone.trim(),
        body: 'GadgetBoy test message — your Twilio SMS integration is working!',
      });
      if (res?.ok) {
        setStatus({
          type: 'success',
          msg: `Test SMS sent successfully${res.sid ? ` (SID: ${res.sid})` : ''}.`,
        });
      } else {
        setStatus({ type: 'error', msg: res?.error || 'Failed to send test SMS.' });
      }
    } catch (e: any) {
      setStatus({ type: 'error', msg: String(e?.message || e) });
    } finally {
      setTesting(false);
    }
  };

  const close = () => {
    try {
      (window as any).api?.closeSelfWindow?.({ focusMain: true });
    } catch {
      try { window.close(); } catch {}
    }
  };

  return (
    <div className="h-screen bg-zinc-900 text-zinc-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-950 shrink-0">
        <div>
          <div className="text-base font-bold text-zinc-100">📱 SMS Texting — Twilio Setup</div>
          <div className="text-xs text-zinc-400 mt-0.5">
            Connect Twilio to text clients directly from the POS.
          </div>
        </div>
        <button
          onClick={close}
          className="h-8 w-8 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded text-zinc-400 hover:border-zinc-400 hover:text-zinc-100"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* Step 1 */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
          <div className="text-sm font-bold text-zinc-200 mb-1">Step 1 — Create a Twilio Account</div>
          <div className="text-sm text-zinc-400 mb-3">
            Sign up for a free trial at Twilio, then purchase a phone number to send SMS.
          </div>
          <button
            type="button"
            onClick={() => api().openUrl?.('https://www.twilio.com/try-twilio')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded"
          >
            🔗 Sign up at twilio.com →
          </button>
          <div className="mt-3 text-xs text-zinc-500 leading-relaxed">
            Once registered: go to your{' '}
            <span className="text-zinc-400 font-semibold">Console Dashboard</span> and copy your{' '}
            <span className="text-zinc-400 font-semibold">Account SID</span> and{' '}
            <span className="text-zinc-400 font-semibold">Auth Token</span>. Then go to{' '}
            <span className="text-zinc-400 font-semibold">Phone Numbers → Manage → Buy a number</span> to
            get your sending number.
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
          <div className="text-sm font-bold text-zinc-200">Step 2 — Enter Your Credentials</div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Account SID</label>
            <input
              type="text"
              className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#39FF14]"
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={accountSid}
              onChange={e => setAccountSid(e.target.value)}
              spellCheck={false}
            />
            <div className="text-[11px] text-zinc-500 mt-1">Found on your Twilio Console Dashboard (starts with AC)</div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Auth Token
              {hasTokenSaved && !authToken && (
                <span className="ml-2 text-[#39FF14] font-semibold">✓ Token saved securely</span>
              )}
            </label>
            <div className="flex gap-2">
              <input
                type={showToken ? 'text' : 'password'}
                className="flex-1 bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#39FF14]"
                placeholder={hasTokenSaved ? '(leave blank to keep existing token)' : 'Paste your Auth Token…'}
                value={authToken}
                onChange={e => setAuthToken(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-300 hover:bg-zinc-600 shrink-0"
              >
                {showToken ? '🙈 Hide' : '👁 Show'}
              </button>
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">Stored encrypted on this machine — never transmitted to anyone except Twilio.</div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Twilio Phone Number (From Number)</label>
            <input
              type="text"
              className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#39FF14]"
              placeholder="+18037080101"
              value={fromNumber}
              onChange={e => setFromNumber(e.target.value)}
              spellCheck={false}
            />
            <div className="text-[11px] text-zinc-500 mt-1">E.164 format: +1 followed by 10 digits (e.g. +18037080101)</div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
          <div className="text-sm font-bold text-zinc-200">Step 3 — Save &amp; Test</div>

          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 bg-[#39FF14] text-black font-bold rounded text-sm hover:brightness-110 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>

          <div className="border-t border-zinc-700 pt-3">
            <div className="text-xs text-zinc-400 mb-2">
              After saving, send a test SMS to confirm everything is working:
            </div>
            <div className="flex gap-2">
              <input
                type="tel"
                className="flex-1 bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#39FF14]"
                placeholder="Phone number to test (e.g. your cell)…"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
              />
              <button
                onClick={sendTest}
                disabled={testing}
                className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm font-semibold text-zinc-100 hover:bg-zinc-600 disabled:opacity-50 shrink-0"
              >
                {testing ? 'Sending…' : 'Send Test'}
              </button>
            </div>
          </div>
        </div>

        {/* Status banner */}
        {status && (
          <div
            className={`rounded-lg px-4 py-3 text-sm font-medium ${
              status.type === 'success'
                ? 'bg-emerald-900/50 border border-emerald-700 text-emerald-300'
                : 'bg-red-900/50 border border-red-700 text-red-300'
            }`}
          >
            {status.type === 'success' ? '✅' : '❌'} {status.msg}
          </div>
        )}

        {/* Current status */}
        <div className="text-xs text-zinc-500 pb-2">
          Current status:{' '}
          {hasTokenSaved && accountSid && fromNumber ? (
            <span className="text-[#39FF14] font-semibold">✅ Configured — ready to send SMS</span>
          ) : (
            <span className="text-zinc-400">⚠️ Not fully configured (need Account SID, Auth Token, and From Number)</span>
          )}
        </div>

      </div>
    </div>
  );
};

export default TwilioSettingsWindow;
