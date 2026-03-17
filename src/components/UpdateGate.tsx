import React, { useEffect, useState } from 'react';

const GITHUB_REPO = 'Mattstechwisdom/GB-POS';
const UPDATE_CHECK_TIMEOUT_MS = 5000;

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
  | { kind: 'installing'; app: AppInfo; latestVersion: string }
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

function normalizeVersion(v: string) {
  return String(v || '0.0.0').trim().replace(/^v/i, '');
}

function compareVersions(aRaw: string, bRaw: string) {
  const a = normalizeVersion(aRaw).split(/[.+-]/)[0].split('.').map((x) => parseInt(x, 10));
  const b = normalizeVersion(bRaw).split(/[.+-]/)[0].split('.').map((x) => parseInt(x, 10));
  for (let i = 0; i < 3; i += 1) {
    const av = Number.isFinite(a[i]) ? a[i] : 0;
    const bv = Number.isFinite(b[i]) ? b[i] : 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

async function fetchGitHubLatestRelease() {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = window.setTimeout(() => controller?.abort(), UPDATE_CHECK_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10&t=${Date.now()}`, {
      headers: {
        'User-Agent': 'gbpos-update-gate',
        Accept: 'application/vnd.github+json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
      signal: controller?.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`GitHub releases check failed: ${res.status}`);
  const json = await res.json();
  const releases = Array.isArray(json) ? json : [];
  const candidate = releases
    .filter((release: any) => !release?.draft && !release?.prerelease)
    .map((release: any) => {
      const assets = Array.isArray(release?.assets)
        ? release.assets
            .map((asset: any) => ({
              name: String(asset?.name || '').trim(),
              downloadUrl: String(asset?.browser_download_url || '').trim(),
            }))
            .filter((asset: any) => asset.name && asset.downloadUrl)
        : [];
      const hasInstaller = assets.some((asset: any) => /\.exe$/i.test(asset.name));
      const hasMetadata = assets.some((asset: any) => /(^|[\\/])latest\.yml$/i.test(asset.name));
      return {
        latestVersion: normalizeVersion(release?.tag_name || release?.name || ''),
        releaseName: typeof release?.name === 'string' ? release.name : undefined,
        releaseNotes: release?.body,
        hasPublishedAssets: hasInstaller || hasMetadata,
      };
    })
    .filter((release: any) => !!release.latestVersion && release.hasPublishedAssets)
    .sort((a: any, b: any) => compareVersions(b.latestVersion, a.latestVersion))[0];
  if (!candidate?.latestVersion) return null;
  return {
    latestVersion: candidate.latestVersion,
    releaseName: candidate.releaseName,
    releaseNotes: candidate.releaseNotes,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId != null) window.clearTimeout(timeoutId);
  }
}

export default function UpdateGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: 'checking' });

  const shouldEnforceGate = (import.meta as any).env?.PROD;

  function pickNewerRelease(
    currentVersion: string,
    primary: { latestVersion?: string; releaseName?: string; releaseNotes?: any } | null | undefined,
    secondary: { latestVersion?: string; releaseName?: string; releaseNotes?: any } | null | undefined,
  ) {
    const primaryVersion = primary?.latestVersion ? normalizeVersion(primary.latestVersion) : '';
    const secondaryVersion = secondary?.latestVersion ? normalizeVersion(secondary.latestVersion) : '';
    const bestVersion = [primaryVersion, secondaryVersion]
      .filter(Boolean)
      .sort((a, b) => compareVersions(b, a))[0];

    if (!bestVersion) return null;
    if (compareVersions(currentVersion, bestVersion) >= 0) return null;

    const chosen = primaryVersion === bestVersion ? primary : secondary;
    return {
      latestVersion: bestVersion,
      releaseName: chosen?.releaseName,
      releaseNotes: chosen?.releaseNotes,
    };
  }

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
      const currentVersion = normalizeVersion(appInfo.version);
      let fallbackRelease: { latestVersion: string; releaseName?: string; releaseNotes?: any } | null = null;

      try {
        fallbackRelease = await fetchGitHubLatestRelease();
      } catch {}

      // If the packaged app has update support, ask the main process to check.
      if (typeof api.updateCheck !== 'function') {
        const bestRelease = pickNewerRelease(currentVersion, null, fallbackRelease);
        if (bestRelease) {
          setState({ kind: 'updateAvailable', app: appInfo, latestVersion: bestRelease.latestVersion, releaseName: bestRelease.releaseName, releaseNotes: bestRelease.releaseNotes });
          return;
        }
        setState({ kind: 'ok' });
        return;
      }

      const res = await withTimeout(Promise.resolve(api.updateCheck()), UPDATE_CHECK_TIMEOUT_MS, 'Update check');
      if (res?.notPackaged) {
        setState({ kind: 'ok' });
        return;
      }
      if (!res?.ok) {
        const msg = String(res?.error || 'Update check failed');
        console.warn('[UpdateGate] update check failed:', msg);
        const bestRelease = pickNewerRelease(currentVersion, null, fallbackRelease);
        if (bestRelease) {
          setState({ kind: 'updateAvailable', app: appInfo, latestVersion: bestRelease.latestVersion, releaseName: bestRelease.releaseName, releaseNotes: bestRelease.releaseNotes });
          return;
        }
        // In production, surface the failure so the user knows updates aren't working.
        if (shouldEnforceGate) {
          setState({ kind: 'error', message: `Could not check for updates: ${msg}` });
        } else {
          setState({ kind: 'ok' });
        }
        return;
      }

      const bestRelease = pickNewerRelease(currentVersion, {
        latestVersion: res?.latestVersion,
        releaseName: res?.releaseName,
        releaseNotes: res?.releaseNotes,
      }, fallbackRelease);

      if (bestRelease) {
        setState({
          kind: 'updateAvailable',
          app: appInfo,
          latestVersion: bestRelease.latestVersion,
          releaseName: bestRelease.releaseName,
          releaseNotes: bestRelease.releaseNotes,
        });
        return;
      }

      if (res?.warning) {
        const warn = String(res.warning || '').trim();
        if (warn) {
          console.warn('[UpdateGate] update check warning:', warn);
          if (shouldEnforceGate) {
            setState({ kind: 'error', message: `Could not check for updates: ${warn}` });
            return;
          }
        }
      }

      setState({ kind: 'ok' });
    } catch (e: any) {
      const msg = String(e?.message || e);

      console.warn('[UpdateGate] update check threw:', msg);
      try {
        const api = (window as any)?.api;
        const appInfo = typeof api?.getAppInfo === 'function' ? ((await api.getAppInfo()) as AppInfo) : null;
        const fallbackRelease = await fetchGitHubLatestRelease();
        const bestRelease = appInfo ? pickNewerRelease(normalizeVersion(appInfo.version), null, fallbackRelease) : null;
        if (appInfo && bestRelease) {
          setState({
            kind: 'updateAvailable',
            app: appInfo,
            latestVersion: bestRelease.latestVersion,
            releaseName: bestRelease.releaseName,
            releaseNotes: bestRelease.releaseNotes,
          });
          return;
        }
      } catch {}
      if (shouldEnforceGate) setState({ kind: 'error', message: `Could not check for updates: ${msg}` });
      else setState({ kind: 'ok' });
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

  if (state.kind === 'ok' || state.kind === 'checking') return <>{children}</>;

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
        {state.kind === 'updateAvailable' && (
          <>
            <div className={titleClass}>Update available</div>
            <div className={subClass}>Update now, or continue and update later.</div>
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
                        })
                      : null;

                    try {
                      const res = await api.updateDownload();
                      if (!res?.ok) throw new Error(res?.error || 'Download failed');
                    } finally {
                      try { if (unsub) unsub(); } catch {}
                    }

                    // Immediately run the installer and restart.
                    if (!api?.updateQuitAndInstall) throw new Error('Update install is unavailable.');
                    setState({ kind: 'installing', app: state.app, latestVersion: state.latestVersion });
                    await api.updateQuitAndInstall();
                  } catch (e: any) {
                    setState({ kind: 'error', message: String(e?.message || e) });
                  }
                }}
              >
                Update now
              </button>
              <button
                className={btnClass}
                onClick={() => setState({ kind: 'ok' })}
              >
                Later
              </button>
              <button
                className={btnClass}
                onClick={async () => {
                  try {
                    await (window as any)?.api?.updateOpenReleases?.();
                  } catch {}
                }}
              >
                Open releases
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

        {state.kind === 'installing' && (
          <>
            <div className={titleClass}>Installing update…</div>
            <div className={subClass}>Launching the installer. The app will close and restart after updating.</div>
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
