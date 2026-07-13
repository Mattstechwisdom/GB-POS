import React, { useEffect, useState } from 'react';

type ReleaseAsset = {
  name?: string;
  browser_download_url?: string;
};

type GitHubRelease = {
  tag_name?: string;
  name?: string;
  html_url?: string;
  assets?: ReleaseAsset[];
};

type MobileUpdate = {
  version: string;
  releaseName: string;
  apkName: string;
  apkUrl: string;
  releaseUrl: string;
};

const repoLatestUrl = 'https://api.github.com/repos/Mattstechwisdom/GB-POS/releases/latest';
const skippedKey = 'gbpos-mobile-skipped-update';
const skippedSessionKey = 'gbpos-mobile-skipped-update-session';

type MobileUpdateCheckProps = {
  checkKey?: string;
  delayMs?: number;
};

function normalizeVersion(raw: string): string {
  return String(raw || '').trim().replace(/^v/i, '');
}

function compareVersions(aRaw: string, bRaw: string): number {
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

async function getLatestMobileUpdate(): Promise<MobileUpdate | null> {
  const res = await fetch(repoLatestUrl, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const release = (await res.json()) as GitHubRelease;
  const version = normalizeVersion(release.tag_name || '');
  if (!version || compareVersions(version, __APP_VERSION__) <= 0) return null;

  const asset = (release.assets || []).find((item) => {
    const name = String(item.name || '');
    return /^Android-APK-universal-.+\.apk$/i.test(name);
  });
  const apkUrl = String(asset?.browser_download_url || '');
  if (!apkUrl) return null;

  return {
    version,
    releaseName: release.name || `GadgetBoy POS ${version}`,
    apkName: String(asset?.name || `Android-APK-universal-${version}.apk`),
    apkUrl,
    releaseUrl: release.html_url || apkUrl,
  };
}

export default function MobileUpdateCheck({ checkKey = 'default', delayMs = 2500 }: MobileUpdateCheckProps) {
  const [update, setUpdate] = useState<MobileUpdate | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: number | null = null;

    const runCheck = async () => {
      try {
        setChecking(true);
        const next = await getLatestMobileUpdate();
        if (!alive || !next) return;
        try {
          window.localStorage.removeItem(skippedKey);
        } catch {
          // ignore legacy skip cleanup
        }
        const skipped = window.sessionStorage.getItem(skippedSessionKey);
        if (skipped === `${checkKey}:${next.version}`) return;
        setUpdate(next);
      } catch {
        // Update checks should never block POS startup.
      } finally {
        if (alive) setChecking(false);
      }
    };

    const scheduleCheck = (delay = delayMs) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void runCheck();
      }, Math.max(0, delay));
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleCheck(600);
    };
    const onOnline = () => scheduleCheck(600);

    scheduleCheck();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [checkKey, delayMs]);

  if (!update) return null;

  const download = () => {
    window.open(update.apkUrl, '_blank', 'noopener,noreferrer');
  };

  const skip = () => {
    try {
      window.sessionStorage.setItem(skippedSessionKey, `${checkKey}:${update.version}`);
    } catch {
      // ignore
    }
    setUpdate(null);
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-sm rounded-lg border border-[#39FF14]/40 bg-zinc-950 text-zinc-100 shadow-2xl">
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-[#39FF14]">Android Update</div>
          <div className="mt-1 text-lg font-semibold">GadgetBoy POS {update.version}</div>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm text-zinc-300">
          <p>A newer Android APK is available for this device.</p>
          <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
            {update.apkName}
          </div>
          <p className="text-xs text-zinc-500">
            Windows devices use the Windows installer update feed separately.
          </p>
        </div>
        <div className="flex gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={download}
            className="flex-1 rounded bg-[#39FF14] px-3 py-2 text-sm font-semibold text-black"
          >
            Download APK
          </button>
          <button
            type="button"
            onClick={skip}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          >
            Skip for now
          </button>
        </div>
        {checking && <div className="sr-only">Checking for Android update</div>}
      </div>
    </div>
  );
}
