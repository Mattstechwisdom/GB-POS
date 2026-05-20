import React, { useEffect, useMemo, useState } from 'react';
import Button from './Button';
import MoneyInput from './MoneyInput';

type LogLevel = 'info' | 'warn' | 'error';
interface LogEntry { ts: string; level: LogLevel; message: string }

type CloverStatus = {
  state?: 'disconnected' | 'connecting' | 'pairing' | 'connected' | 'ready' | 'error' | string;
  endpoint?: string;
  pairingCode?: string | null;
  lastError?: string | null;
  updatedAt?: string;
};

export default function CloverConnectionWindow() {
  const hasElectron = typeof (window as any).api !== 'undefined';
  const api = hasElectron ? (window as any).api : null;

  const [busy, setBusy] = useState(false);
  const [ipAddress, setIpAddress] = useState('');
  const [status, setStatus] = useState<CloverStatus | null>(null);
  const [pairingCode, setPairingCode] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [saleAmount, setSaleAmount] = useState<number | undefined>(undefined);

  const log = (level: LogLevel, message: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [{ ts, level, message }, ...prev].slice(0, 200));
  };

  const statusLabel = useMemo(() => {
    const s = String(status?.state || 'disconnected');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [status?.state]);

  const cents = useMemo(() => {
    const n = Number(saleAmount || 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }, [saleAmount]);

  useEffect(() => {
    if (!hasElectron) return;
    let offStatus: any = null;
    let offPair: any = null;

    (async () => {
      try {
        const cfg = await api.cloverGetConfig();
        if (cfg?.ok) setIpAddress(String(cfg.ipAddress || ''));
      } catch (e: any) {
        log('error', `Failed to load Clover config: ${e?.message || String(e)}`);
      }

      try {
        const st = await api.cloverGetStatus();
        if (st?.ok) setStatus(st);
      } catch {
        // ignore
      }

      try {
        offStatus = api.onCloverStatus?.((st: any) => {
          setStatus(st);
          if (typeof st?.pairingCode === 'string' && st.pairingCode.trim()) {
            setPairingCode(String(st.pairingCode));
          }
        });
      } catch {
        // ignore
      }

      try {
        offPair = api.onCloverPairingCode?.((code: string) => {
          const c = String(code || '').trim();
          if (!c) return;
          setPairingCode(c);
          log('info', `Pairing code: ${c}`);
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      try { offStatus && offStatus(); } catch {}
      try { offPair && offPair(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasElectron]);

  const saveIp = async () => {
    if (!hasElectron) return;
    const ip = ipAddress.trim();
    if (!ip) throw new Error('Enter the Clover device IP address.');
    const res = await api.cloverSetConfig({ ipAddress: ip });
    if (!res?.ok) throw new Error(res?.error || 'Failed to save Clover config.');
  };

  const connect = async () => {
    if (!hasElectron || busy) return;
    setBusy(true);
    try {
      await saveIp();
      const res = await api.cloverConnect();
      if (!res?.ok) throw new Error(res?.error || 'Connect failed.');
      log('info', 'Connecting…');
    } catch (e: any) {
      log('error', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!hasElectron || busy) return;
    setBusy(true);
    try {
      const res = await api.cloverDisconnect();
      if (!res?.ok) throw new Error(res?.error || 'Disconnect failed.');
      log('info', 'Disconnected.');
      setPairingCode('');
    } catch (e: any) {
      log('error', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendSale = async () => {
    if (!hasElectron || busy) return;
    if (cents <= 0) {
      log('warn', 'Enter a sale amount greater than $0.00');
      return;
    }
    setBusy(true);
    try {
      const res = await api.cloverSale(cents);
      if (!res?.ok) throw new Error(res?.error || 'Sale failed.');
      const summary = res?.response;
      if (summary && typeof summary === 'object') {
        log(summary.success ? 'info' : 'error', `${summary.success ? 'Sale approved' : 'Sale declined'}${summary.message ? `: ${summary.message}` : ''}`);
      } else {
        log('info', 'Sale request sent.');
      }
    } catch (e: any) {
      log('error', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const openDrawer = async () => {
    if (!hasElectron || busy) return;
    setBusy(true);
    try {
      const res = await api.cloverOpenCashDrawer({ reason: 'GadgetBoy POS' });
      if (!res?.ok) throw new Error(res?.error || 'Open cash drawer failed.');
      log('info', 'Open cash drawer request sent.');
    } catch (e: any) {
      log('error', e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!hasElectron) {
    return (
      <div className="p-8 text-zinc-300">
        <div className="text-xl font-bold mb-2">Clover Connection</div>
        <div className="text-sm text-zinc-400">This screen is only available in the desktop app.</div>
      </div>
    );
  }

  return (
    <div className="p-6 text-zinc-100">
      <div className="max-w-3xl">
        <div className="text-2xl font-bold">Clover Connection</div>
        <div className="text-sm text-zinc-400 mt-1">
          Enter the IP address of your Clover device to connect over LAN.
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded p-4">
            <div className="font-semibold mb-2">Device</div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-400">IP Address</label>
              <input
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-[#39FF14]"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="192.168.1.50"
                disabled={busy}
              />
              <div className="flex items-center gap-2 mt-2">
                <Button neon onClick={connect} disabled={busy}>
                  Connect
                </Button>
                <Button onClick={disconnect} disabled={busy}>
                  Disconnect
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded p-4">
            <div className="font-semibold mb-2">Status</div>
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <span className="text-zinc-400">State:</span>
                <span className={status?.state === 'ready' ? 'text-[#39FF14] font-semibold' : (status?.state === 'error' ? 'text-red-400 font-semibold' : 'text-zinc-100 font-semibold')}>
                  {statusLabel}
                </span>
              </div>
              {status?.endpoint && (
                <div className="mt-1 text-xs text-zinc-400 break-all">{status.endpoint}</div>
              )}
              {status?.lastError && (
                <div className="mt-2 text-sm text-red-300">{status.lastError}</div>
              )}
              {pairingCode && (
                <div className="mt-3">
                  <div className="text-xs text-zinc-400">Pairing Code</div>
                  <div className="mt-1 inline-block px-3 py-2 rounded bg-zinc-800 border border-zinc-700 font-mono text-lg tracking-wider">
                    {pairingCode}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">Enter this code on the Clover device when prompted.</div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded p-4">
            <div className="font-semibold mb-2">Actions</div>
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-xs text-zinc-400 mb-1">Send Sale Amount</div>
                <div className="flex items-center gap-2">
                  <MoneyInput
                    value={saleAmount}
                    onValueChange={setSaleAmount}
                    allowEmpty
                    className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm w-40"
                    placeholder="0.00"
                    disabled={busy}
                  />
                  <Button neon onClick={sendSale} disabled={busy}>
                    Send
                  </Button>
                </div>
                <div className="text-xs text-zinc-500 mt-1">Sent as integer cents (${(cents / 100).toFixed(2)}).</div>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={openDrawer} disabled={busy}>
                  Open Cash Drawer
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-700 rounded p-4">
            <div className="font-semibold mb-2">Log</div>
            {logs.length === 0 ? (
              <div className="text-sm text-zinc-500">No events yet.</div>
            ) : (
              <div className="max-h-56 overflow-auto text-xs">
                {logs.map((l, idx) => (
                  <div key={idx} className="py-1 border-b border-zinc-800">
                    <span className="text-zinc-500">[{l.ts}]</span>{' '}
                    <span className={l.level === 'error' ? 'text-red-300' : (l.level === 'warn' ? 'text-yellow-200' : 'text-zinc-200')}>
                      {l.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
