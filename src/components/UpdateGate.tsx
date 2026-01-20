import React, { useEffect, useMemo, useState } from 'react';
import { getServerBaseUrl } from '../lib/config';

type AppInfo = {
  version: string;
  platform: string;
  arch: string;
  error?: string;
};

type ClientPolicyResponse = {
  minVersion?: string;
  latestVersion?: string;
  updateUrl?: string;
  message?: string;
  required?: boolean;
};

type GateState =
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'offline'; reason: string }
  | {
      kind: 'updateRequired';
      app: AppInfo;
      minVersion: string;
      latestVersion?: string;
      updateUrl?: string;
      message?: string;
    }
  | { kind: 'error'; message: string };

function normalizeVersion(v: string): string {
  return String(v || '0.0.0').trim().replace(/^v/i, '');
}

function compareVersions(aRaw: string, bRaw: string): number {
  // Minimal semver-ish compare (major.minor.patch). Ignores prerelease/build metadata.
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

async function fetchClientPolicy(serverBaseUrl: string, app: AppInfo): Promise<ClientPolicyResponse> {
  const url = new URL('/api/client-policy', serverBaseUrl);
  url.searchParams.set('app', 'gadgetboy-pos');
  url.searchParams.set('platform', app.platform);
  url.searchParams.set('arch', app.arch);
  url.searchParams.set('version', app.version);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Policy request failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as ClientPolicyResponse;
}

export default function UpdateGate({ children }: { children: React.ReactNode }) {
  const serverBaseUrl = useMemo(() => getServerBaseUrl(), []);
  const [state, setState] = useState<GateState>({ kind: 'checking' });

  async function checkNow() {
    setState({ kind: 'checking' });

    try {
      if (!navigator.onLine) {
        setState({ kind: 'offline', reason: 'Internet connection is required.' });
        return;
      }

      const appInfo = (await window.api.getAppInfo()) as AppInfo;
      const policy = await fetchClientPolicy(serverBaseUrl, appInfo);

      const minVersion = normalizeVersion(policy.minVersion || '0.0.0');
      const current = normalizeVersion(appInfo.version);

      const forced = policy.required === true;
      const belowMin = compareVersions(current, minVersion) < 0;

      if (forced || belowMin) {
        setState({
          kind: 'updateRequired',
          app: appInfo,
          minVersion,
          latestVersion: policy.latestVersion ? normalizeVersion(policy.latestVersion) : undefined,
          updateUrl: policy.updateUrl,
          message: policy.message,
        });
        return;
      }

      setState({ kind: 'ok' });
    } catch (e: any) {
      // If we can't reach the server, treat as offline (since internet is required by policy).
      const msg = String(e?.message || e);
      setState({ kind: 'offline', reason: msg || 'Unable to reach server.' });
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
            <div className={subClass}>Verifying server connection and required app version.</div>
          </>
        )}

        {state.kind === 'offline' && (
          <>
            <div className={titleClass}>Internet connection required</div>
            <div className={subClass}>{state.reason}</div>
            <div className="mt-4 flex gap-3">
              <button className={primaryBtnClass} onClick={() => checkNow()}>
                Retry
              </button>
              <button className={btnClass} onClick={() => window.close()}>
                Close
              </button>
            </div>
          </>
        )}

        {state.kind === 'updateRequired' && (
          <>
            <div className={titleClass}>Update required</div>
            <div className={subClass}>
              {state.message || 'A newer version is required before you can continue.'}
            </div>
            <div className="mt-4 text-sm text-gray-300 space-y-1">
              <div>
                Current: <span className="text-gray-100">{state.app.version}</span>
              </div>
              <div>
                Required: <span className="text-gray-100">{state.minVersion}+</span>
              </div>
              {state.latestVersion && (
                <div>
                  Latest: <span className="text-gray-100">{state.latestVersion}</span>
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                className={primaryBtnClass}
                onClick={async () => {
                  if (state.updateUrl) {
                    await window.api.openUrl(state.updateUrl);
                  }
                }}
                disabled={!state.updateUrl}
                title={state.updateUrl ? undefined : 'No update URL provided by server'}
              >
                Download update
              </button>
              <button className={btnClass} onClick={() => checkNow()}>
                Re-check
              </button>
              <button className={btnClass} onClick={() => window.close()}>
                Close
              </button>
            </div>

            {!state.updateUrl && (
              <div className="mt-3 text-xs text-gray-400">
                Server did not provide an update URL (`updateUrl`).
              </div>
            )}
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
              <button className={btnClass} onClick={() => window.close()}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
