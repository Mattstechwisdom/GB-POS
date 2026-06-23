import React, { useEffect, useState } from 'react';

export default function CloverSettingsWindow() {
  const [merchantId, setMerchantId] = useState('');
  const [deviceSerial, setDeviceSerial] = useState('');
  const [environment, setEnvironment] = useState<'production' | 'sandbox'>('production');
  const [tokenInput, setTokenInput] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [tokenChanged, setTokenChanged] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    (window as any).api?.cloverGetConfig?.().then((cfg: any) => {
      if (!cfg) return;
      setMerchantId(cfg.merchantId || '');
      setDeviceSerial(cfg.deviceSerial || '');
      setEnvironment(cfg.environment === 'sandbox' ? 'sandbox' : 'production');
      setHasToken(!!cfg.hasToken);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveResult(null);
    try {
      const cfgRes = await (window as any).api.cloverSaveConfig({ merchantId, deviceSerial, environment });
      if (!cfgRes?.ok) {
        setSaveResult({ ok: false, message: cfgRes?.error || 'Failed to save settings' });
        return;
      }
      if (tokenChanged && tokenInput.trim()) {
        const tokRes = await (window as any).api.cloverSetAccessToken(tokenInput.trim());
        if (!tokRes?.ok) {
          setSaveResult({ ok: false, message: tokRes?.error || 'Failed to save token' });
          return;
        }
        setHasToken(true);
        setTokenInput('');
        setTokenChanged(false);
      }
      setSaveResult({ ok: true, message: 'Settings saved.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await (window as any).api.cloverTestConnection();
      if (res?.ok) {
        setTestResult({ ok: true, message: `Connected — ${res.merchantName}` });
      } else {
        setTestResult({ ok: false, message: res?.error || 'Connection failed' });
      }
    } finally {
      setTesting(false);
    }
  }

  async function handleClearToken() {
    if (!confirm('Clear the saved Clover API token?')) return;
    await (window as any).api.cloverSetAccessToken('');
    setHasToken(false);
    setTokenInput('');
    setTokenChanged(false);
    setSaveResult({ ok: true, message: 'Token cleared.' });
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-gray-100 p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3 border-b border-zinc-700 pb-4">
        <span className="text-xl font-bold tracking-tight text-white">Clover Settings</span>
        <span className="ml-auto text-xs text-zinc-500">Pay Display integration</span>
      </div>

      {/* Environment */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Environment</label>
        <div className="flex gap-2">
          {(['production', 'sandbox'] as const).map(env => (
            <button
              key={env}
              onClick={() => setEnvironment(env)}
              className={`px-4 py-1.5 rounded text-xs font-semibold capitalize transition-colors ${
                environment === env
                  ? 'bg-[#39FF14] text-zinc-900'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {env}
            </button>
          ))}
        </div>
      </div>

      {/* Merchant ID */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Merchant ID</label>
        <input
          className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#39FF14]"
          placeholder="e.g. A1B2C3D4E5F6G"
          value={merchantId}
          onChange={e => setMerchantId(e.target.value)}
        />
        <p className="text-[11px] text-zinc-500">Found in Clover Dashboard → Account &amp; Setup → Merchants</p>
      </div>

      {/* Device Serial */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Device Serial Number <span className="text-zinc-600 font-normal normal-case">(optional)</span></label>
        <input
          className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#39FF14]"
          placeholder="e.g. C021UQ12345678"
          value={deviceSerial}
          onChange={e => setDeviceSerial(e.target.value)}
        />
        <p className="text-[11px] text-zinc-500">On the back of the Flex, or Dashboard → Devices &amp; Employees → Devices. If blank, uses the first device on the account.</p>
      </div>

      {/* API Token */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">API Access Token</label>
        {hasToken && !tokenChanged ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-500 tracking-widest">
              ••••••••••••••••••••••••
            </div>
            <button
              onClick={() => { setTokenChanged(true); setTokenInput(''); }}
              className="px-3 py-2 rounded bg-zinc-700 text-xs text-zinc-300 hover:bg-zinc-600"
            >
              Replace
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="password"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-[#39FF14]"
              placeholder="Paste token from Clover Dashboard"
              value={tokenInput}
              onChange={e => { setTokenInput(e.target.value); setTokenChanged(true); }}
              autoComplete="new-password"
            />
            {hasToken && (
              <button
                onClick={() => { setTokenChanged(false); setTokenInput(''); }}
                className="px-3 py-2 rounded bg-zinc-700 text-xs text-zinc-300 hover:bg-zinc-600"
              >
                Cancel
              </button>
            )}
          </div>
        )}
        <p className="text-[11px] text-zinc-500">Dashboard → Settings → API Tokens. Requires ORDERS_W and PAYMENTS_W scopes.</p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded bg-[#39FF14] text-zinc-900 text-sm font-bold hover:brightness-110 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          className="px-4 py-2 rounded bg-zinc-700 text-sm text-gray-100 hover:bg-zinc-600 disabled:opacity-50"
        >
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        {hasToken && (
          <button
            onClick={handleClearToken}
            className="ml-auto px-4 py-2 rounded bg-zinc-800 text-sm text-red-400 hover:bg-red-900/30 border border-red-900/40"
          >
            Clear Token
          </button>
        )}
      </div>

      {/* Feedback */}
      {saveResult && (
        <div className={`text-sm px-3 py-2 rounded ${saveResult.ok ? 'bg-green-900/30 text-green-400 border border-green-700/40' : 'bg-red-900/30 text-red-400 border border-red-700/40'}`}>
          {saveResult.ok ? '✓ ' : '✗ '}{saveResult.message}
        </div>
      )}
      {testResult && (
        <div className={`text-sm px-3 py-2 rounded ${testResult.ok ? 'bg-green-900/30 text-green-400 border border-green-700/40' : 'bg-red-900/30 text-red-400 border border-red-700/40'}`}>
          {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
        </div>
      )}
    </div>
  );
}
