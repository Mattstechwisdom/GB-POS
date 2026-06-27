import React, { useEffect, useState } from 'react';

const api = () => (window as any).api;

export default function CloverSettingsWindow() {
  // ── Local (LAN) mode ─────────────────────────────────────────────────────
  const [deviceIp, setDeviceIp] = useState('');
  const [devicePort, setDevicePort] = useState('12346');
  const [localToken, setLocalToken] = useState('');
  const [hasLocalToken, setHasLocalToken] = useState(false);
  const [showLocalToken, setShowLocalToken] = useState(false);

  // ── Cloud API mode (optional) ────────────────────────────────────────────
  const [showCloud, setShowCloud] = useState(false);
  const [merchantId, setMerchantId] = useState('');
  const [deviceSerial, setDeviceSerial] = useState('');
  const [environment, setEnvironment] = useState<'production' | 'sandbox'>('production');
  const [cloudToken, setCloudToken] = useState('');
  const [hasCloudToken, setHasCloudToken] = useState(false);
  const [cloudTokenChanged, setCloudTokenChanged] = useState(false);

  // ── Status ───────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [testingLocal, setTestingLocal] = useState(false);
  const [testingCloud, setTestingCloud] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    api().cloverGetConfig?.().then((cfg: any) => {
      if (!cfg) return;
      setDeviceIp(cfg.deviceIp || '');
      setDevicePort(String(cfg.devicePort || 12346));
      setHasLocalToken(!!cfg.hasLocalToken);
      setMerchantId(cfg.merchantId || '');
      setDeviceSerial(cfg.deviceSerial || '');
      setEnvironment(cfg.environment === 'sandbox' ? 'sandbox' : 'production');
      setHasCloudToken(!!cfg.hasToken);
      if (cfg.merchantId) setShowCloud(true);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const patch: any = {
        deviceIp: deviceIp.trim(),
        devicePort: Number(devicePort) || 12346,
        merchantId,
        deviceSerial,
        environment,
      };
      if (localToken.trim()) patch.localAuthToken = localToken.trim();
      const res = await api().cloverSaveConfig(patch);
      if (!res?.ok) { setStatus({ type: 'error', msg: res?.error || 'Save failed.' }); return; }
      if (cloudTokenChanged && cloudToken.trim()) {
        const tok = await api().cloverSetAccessToken(cloudToken.trim());
        if (!tok?.ok) { setStatus({ type: 'error', msg: tok?.error || 'Failed to save cloud token.' }); return; }
        setHasCloudToken(true);
        setCloudToken('');
        setCloudTokenChanged(false);
      }
      if (localToken.trim()) { setHasLocalToken(true); setLocalToken(''); }
      setStatus({ type: 'success', msg: 'Settings saved.' });
    } catch (e: any) {
      setStatus({ type: 'error', msg: String(e?.message || e) });
    } finally {
      setSaving(false);
    }
  };

  const testLocal = async () => {
    setTestingLocal(true);
    setStatus(null);
    try {
      const res = await api().cloverTestLocalConnection();
      setStatus({ type: res?.ok ? 'success' : 'error', msg: res?.message || res?.error || 'Unknown result.' });
    } finally {
      setTestingLocal(false);
    }
  };

  const testCloud = async () => {
    setTestingCloud(true);
    setStatus(null);
    try {
      const res = await api().cloverTestConnection();
      setStatus({ type: res?.ok ? 'success' : 'error', msg: res?.ok ? `Connected — ${res.merchantName}` : (res?.error || 'Connection failed.') });
    } finally {
      setTestingCloud(false);
    }
  };

  const close = () => {
    try { api().closeSelfWindow?.({ focusMain: true }); } catch { try { window.close(); } catch {} }
  };

  return (
    <div className="h-screen bg-zinc-900 text-zinc-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-950 shrink-0">
        <div>
          <div className="text-base font-bold text-zinc-100">⬛ Clover Pay Display</div>
          <div className="text-xs text-zinc-400 mt-0.5">Send checkout totals to your Clover Flex to take card payment.</div>
        </div>
        <button onClick={close} className="h-8 w-8 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded text-zinc-400 hover:border-zinc-400 hover:text-zinc-100">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* ── STEP 1 ─────────────────────────────────────────────────────── */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
          <div className="text-sm font-bold text-zinc-200 mb-2">Step 1 — Enable Pay Display on your Clover Flex</div>
          <ol className="text-sm text-zinc-400 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>On the Flex: open the <span className="text-zinc-200 font-semibold">App Market</span> and install <span className="text-zinc-200 font-semibold">Pay Display</span> if not already there.</li>
            <li>Open the <span className="text-zinc-200 font-semibold">Pay Display</span> app — the device will show a waiting screen with its <span className="text-zinc-200 font-semibold">IP address</span>.</li>
            <li>Note that IP address and enter it below. Both devices must be on the <span className="text-zinc-200 font-semibold">same Wi-Fi network</span>.</li>
          </ol>
        </div>

        {/* ── STEP 2 ─────────────────────────────────────────────────────── */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
          <div className="text-sm font-bold text-zinc-200">Step 2 — Enter Device IP</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Device IP Address</label>
              <input
                type="text"
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#39FF14]"
                placeholder="192.168.1.235"
                value={deviceIp}
                onChange={e => setDeviceIp(e.target.value)}
                spellCheck={false}
              />
              <div className="text-[11px] text-zinc-500 mt-1">The IP shown on the Pay Display screen</div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Port</label>
              <input
                type="text"
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#39FF14]"
                value={devicePort}
                onChange={e => setDevicePort(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Auth Token{' '}
              <span className="text-zinc-600 font-normal">(leave blank if device doesn't require one)</span>
              {hasLocalToken && !localToken && <span className="ml-2 text-[#39FF14] font-semibold">✓ Token saved</span>}
            </label>
            <div className="flex gap-2">
              <input
                type={showLocalToken ? 'text' : 'password'}
                className="flex-1 bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#39FF14]"
                placeholder={hasLocalToken ? '(leave blank to keep current)' : 'Token from device pairing (if required)…'}
                value={localToken}
                onChange={e => setLocalToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" onClick={() => setShowLocalToken(v => !v)}
                className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-300 hover:bg-zinc-600 shrink-0">
                {showLocalToken ? '🙈' : '👁'}
              </button>
            </div>
          </div>
        </div>

        {/* ── STEP 3 ─────────────────────────────────────────────────────── */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3">
          <div className="text-sm font-bold text-zinc-200">Step 3 — Save &amp; Test</div>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving}
              className="px-5 py-2 bg-[#39FF14] text-black font-bold rounded text-sm hover:brightness-110 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
            <button onClick={testLocal} disabled={testingLocal || !deviceIp.trim()}
              className="px-4 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm text-zinc-100 hover:bg-zinc-600 disabled:opacity-50">
              {testingLocal ? 'Pinging…' : '📡 Test Connection'}
            </button>
          </div>
          <div className="text-xs text-zinc-500">
            Make sure <strong className="text-zinc-400">Pay Display is open on the Flex</strong> and both devices are on the same network before testing.
          </div>
        </div>

        {/* Status */}
        {status && (
          <div className={`rounded-lg px-4 py-3 text-sm font-medium ${status.type === 'success' ? 'bg-emerald-900/50 border border-emerald-700 text-emerald-300' : 'bg-red-900/50 border border-red-700 text-red-300'}`}>
            {status.type === 'success' ? '✅' : '❌'} {status.msg}
          </div>
        )}

        <div className="text-xs text-zinc-500">
          Status:{' '}
          {deviceIp ? (
            <span className="text-[#39FF14] font-semibold">✅ Device configured — {deviceIp}:{devicePort}</span>
          ) : (
            <span className="text-zinc-400">⚠️ No device IP set — Clover button will not appear in checkout</span>
          )}
        </div>

        {/* ── Cloud API (collapsible, optional) ─────────────────────────── */}
        <div className="border border-zinc-700 rounded-lg overflow-hidden">
          <button onClick={() => setShowCloud(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800 text-sm text-zinc-400 hover:text-zinc-200">
            <span className="font-semibold">☁️ Cloud API <span className="font-normal text-zinc-600">(optional — for recording in Clover Dashboard)</span></span>
            <span>{showCloud ? '▲' : '▼'}</span>
          </button>
          {showCloud && (
            <div className="bg-zinc-900 px-4 py-4 space-y-3 border-t border-zinc-700">
              <div className="text-xs text-zinc-500">Only needed if you want sales recorded in the Clover cloud dashboard. Not required for Pay Display.</div>
              <div className="flex gap-2">
                {(['production', 'sandbox'] as const).map(env => (
                  <button key={env} onClick={() => setEnvironment(env)}
                    className={`px-3 py-1 rounded text-xs font-semibold capitalize ${environment === env ? 'bg-[#39FF14] text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                    {env}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Merchant ID</label>
                <input className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#39FF14]"
                  placeholder="A1B2C3D4E5F6G" value={merchantId} onChange={e => setMerchantId(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Device Serial <span className="text-zinc-600">(optional)</span></label>
                <input className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#39FF14]"
                  placeholder="C021UQ12345678" value={deviceSerial} onChange={e => setDeviceSerial(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">API Token {hasCloudToken && !cloudTokenChanged && <span className="ml-2 text-[#39FF14]">✓ Saved</span>}</label>
                {hasCloudToken && !cloudTokenChanged ? (
                  <div className="flex gap-2">
                    <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-500 text-sm tracking-widest">••••••••••••••••</div>
                    <button onClick={() => setCloudTokenChanged(true)} className="px-3 py-2 bg-zinc-700 rounded text-xs hover:bg-zinc-600">Replace</button>
                  </div>
                ) : (
                  <input type="password" className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#39FF14]"
                    placeholder="Paste API token…" value={cloudToken}
                    onChange={e => { setCloudToken(e.target.value); setCloudTokenChanged(true); }}
                    autoComplete="new-password" />
                )}
                <div className="text-[11px] text-zinc-500 mt-1">Dashboard → Settings → API Tokens (needs ORDERS_W + PAYMENTS_W)</div>
              </div>
              <button onClick={testCloud} disabled={testingCloud}
                className="px-4 py-2 bg-zinc-700 border border-zinc-600 rounded text-sm hover:bg-zinc-600 disabled:opacity-50">
                {testingCloud ? 'Testing…' : 'Test Cloud Connection'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
