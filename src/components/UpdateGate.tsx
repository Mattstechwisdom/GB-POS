import React, { useEffect, useState } from 'react';

type AppInfo = {
  version: string;
  platform: string;
  arch: string;
  error?: string;
};

type GateState =
  | { kind: 'checking' }
  | { kind: 'ok' }
  | {
      kind: 'updateAvailable';
      app: AppInfo;
      latestVersion: string;
      releaseName?: string;
      releaseNotes?: any;
    }
  | { kind: 'downloading'; app: AppInfo; latestVersion: string; progressPct: number }
  | { kind: 'downloaded'; app: AppInfo; latestVersion: string }
  | { kind: 'error'; message: string };

function fmtBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function UpdateGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: 'checking' });

  const shouldEnforceGate = (import.meta as any).env?.PROD;

  async function checkNow() {
    setState({ kind: 'checking' });

    try {
      const api = (window as any)?.api;
      const hasBridge = api && typeof api.getAppInfo === 'function';
      if (!hasBridge && !shouldEnforceGate) {
        setState({ kind: 'ok' });
        return;
      }

      if (!hasBridge) {
        setState({
          kind: 'error',
          message:
            'App bridge is unavailable (window.api.getAppInfo). If you opened the Vite URL in a browser, use the Electron app window instead.',
        });
        return;
      }

      const appInfo = (await api.getAppInfo()) as AppInfo;

      // If the packaged app has update support, ask the main process to check.
      if (typeof api.updateCheck !== 'function') {
        setState({ kind: 'ok' });
        return;
      }

      const res = await api.updateCheck();
      if (res?.notPackaged) {
        setState({ kind: 'ok' });
        return;
      }
      if (!res?.ok) {
        // In prod, show error UI but allow “Continue anyway”.
        setState({ kind: 'error', message: res?.error || 'Unable to check for updates.' });
        return;
      }

      if (res?.updateAvailable && res?.latestVersion) {
        setState({
          kind: 'updateAvailable',
          app: appInfo,
          latestVersion: String(res.latestVersion),
          releaseName: res?.releaseName,
          releaseNotes: res?.releaseNotes,
        });
        return;
      }

      setState({ kind: 'ok' });
    } catch (e: any) {
      const msg = String(e?.message || e);

      if (!shouldEnforceGate) {
        setState({ kind: 'ok' });
        return;
      }

      setState({ kind: 'error', message: msg || 'Unable to check for updates.' });
    }
  }

  useEffect(() => {
    checkNow();
    // Re-check when connectivity changes
    const onOnline = () => checkNow();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === 'ok') return <>{children}</>;

  const cardClass = 'w-full max-w-xl rounded-lg bg-zinc-900 border border-zinc-700 p-6';
  const titleClass = 'text-xl font-semibold text-gray-100';
  const subClass = 'mt-2 text-sm text-gray-300';
  const btnClass =
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-zinc-800 text-gray-100 hover:bg-zinc-700 border border-zinc-700';
  const primaryBtnClass =
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-[#39FF14] text-black hover:opacity-90';

  return (
    <div className="min-h-screen bg-zinc-950 text-gray-100 flex items-center justify-center p-6">
      <div className={cardClass}>
        {state.kind === 'checking' && (
          <>
            <div className={titleClass}>Checking for updates…</div>
            <div className={subClass}>Looking for a newer version of GadgetBoy POS.</div>
          </>
        )}

        {state.kind === 'updateAvailable' && (
          <>
            <div className={titleClass}>Update available</div>
            <div className={subClass}>
              A newer version is available. Download to ensure you’re up to date.
            </div>
            <div className="mt-4 text-sm text-gray-300 space-y-1">
              <div>
                Current: <span className="text-gray-100">{state.app.version}</span>
              </div>
              <div>
                New: <span className="text-gray-100">{state.latestVersion}</span>
              </div>
              {state.releaseName && (
                <div>
                  Release: <span className="text-gray-100">{state.releaseName}</span>
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                className={primaryBtnClass}
                onClick={async () => {
                  const api = (window as any)?.api;
                  try {
                    if (!api?.updateDownload) throw new Error('Update download is unavailable.');
                    setState({ kind: 'downloading', app: state.app, latestVersion: state.latestVersion, progressPct: 0 });

                    const unsub = typeof api?.onUpdateEvent === 'function'
                      ? api.onUpdateEvent((ev: any) => {
                          if (ev?.kind === 'progress' && typeof ev?.percent === 'number') {
                            setState((prev) => {
                              if (prev.kind !== 'downloading') return prev;
                              return { ...prev, progressPct: Math.max(0, Math.min(100, Number(ev.percent))) };
                            });
                          }
                          if (ev?.kind === 'downloaded') {
                            setState({ kind: 'downloaded', app: state.app, latestVersion: state.latestVersion });
                          }
                        })
                      : null;

                    const res = await api.updateDownload();
                    if (unsub) unsub();
                    if (!res?.ok) throw new Error(res?.error || 'Download failed');
                    // If the downloaded event didn't arrive for some reason, fall back.
                    setState((prev) => (prev.kind === 'downloading' ? { kind: 'downloaded', app: state.app, latestVersion: state.latestVersion } : prev));
                  } catch (e: any) {
                    setState({ kind: 'error', message: String(e?.message || e) });
                  }
                }}
              >
                Download update
              </button>
              <button
                className={btnClass}
                onClick={async () => {
                  const api = (window as any)?.api;
                  try {
                    if (api?.updateSkip) await api.updateSkip(state.latestVersion);
                  } catch {}
                  setState({ kind: 'ok' });
                }}
              >
                Skip (can’t ensure up to date)
              </button>
              <button className={btnClass} onClick={() => checkNow()}>
                Re-check
              </button>
            </div>
          </>
        )}

        {state.kind === 'downloading' && (
          <>
            <div className={titleClass}>Downloading update…</div>
            <div className={subClass}>Please keep this window open.</div>
            <div className="mt-4">
              <div className="h-3 bg-zinc-800 rounded">
                <div
                  className="h-3 bg-[#39FF14] rounded"
                  style={{ width: `${Math.max(0, Math.min(100, state.progressPct))}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-gray-400">{state.progressPct.toFixed(0)}%</div>
            </div>
          </>
        )}

        {state.kind === 'downloaded' && (
          <>
            <div className={titleClass}>Update ready</div>
            <div className={subClass}>Restart to apply the update and continue.</div>
            <div className="mt-4 flex gap-3">
              <button
                className={primaryBtnClass}
                onClick={async () => {
                  const api = (window as any)?.api;
                  try {
                    await api.updateQuitAndInstall();
                  } catch (e) {
                    console.error(e);
                  }
                }}
              >
                Restart and apply
              </button>
              <button className={btnClass} onClick={() => setState({ kind: 'ok' })}>
                Later
              </button>
            </div>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <div className={titleClass}>Startup error</div>
            <div className={subClass}>{state.message}</div>
            <div className="mt-4 flex gap-3">
              <button className={primaryBtnClass} onClick={() => checkNow()}>
                Retry
              </button>
              <button className={btnClass} onClick={() => setState({ kind: 'ok' })}>
                Continue anyway
              </button>
            </div>
            <div className="mt-3 text-xs text-gray-400">
              {shouldEnforceGate ? 'Updates may not be configured yet (electron-builder publish settings).' : 'Update checking is optional in dev.'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
