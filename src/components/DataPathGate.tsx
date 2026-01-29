import React, { useEffect, useState } from 'react';

type Props = {
  children: React.ReactNode;
};

type Status =
  | { phase: 'loading'; message: string }
  | { phase: 'ready' }
  | { phase: 'error'; message: string; detail?: string };

export default function DataPathGate({ children }: Props) {
  const [status, setStatus] = useState<Status>({ phase: 'loading', message: 'Preparing storage…' });
  const [dataRoot, setDataRoot] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;

    async function run() {
      try {
        setStatus({ phase: 'loading', message: 'Checking storage location…' });

        const ensure = await window.api.storageEnsure();
        if (canceled) return;

        if (!ensure?.ok) {
          setStatus({
            phase: 'error',
            message: 'Storage setup failed',
            detail: ensure?.error || 'Unknown error',
          });
          return;
        }

        setDataRoot(ensure.dataRoot || null);

        // Run a quick diagnostics pass (non-blocking unless it hard-fails)
        try {
          const diag = await window.api.runDiagnostics();
          if (!canceled && diag && diag.ok === false) {
            const results = Array.isArray(diag.results) ? diag.results : [];
            const writeAccess = results.find((r: any) => r?.name === 'writeAccess');
            const dbRead = results.find((r: any) => r?.name === 'dbRead');

            const criticalFailed = (writeAccess && writeAccess.ok === false) || (dbRead && dbRead.ok === false);
            if (criticalFailed) {
              setStatus({
                phase: 'error',
                message: 'Storage diagnostics failed',
                detail: 'GadgetBoy POS could not verify it can read/write its data folder.',
              });
              return;
            }
          }
        } catch {
          // ignore diagnostics errors
        }

        setStatus({ phase: 'ready' });
      } catch (e: any) {
        if (canceled) return;
        setStatus({
          phase: 'error',
          message: 'Storage setup failed',
          detail: e?.message || String(e),
        });
      }
    }

    run();
    return () => {
      canceled = true;
    };
  }, []);

  if (status.phase === 'ready') return <>{children}</>;

  if (status.phase === 'error') {
    return (
      <div className="min-h-screen bg-zinc-900 text-gray-100 flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-950/40 p-6 space-y-3">
          <div className="text-lg font-semibold">{status.message}</div>
          {status.detail ? <div className="text-sm text-gray-300">{status.detail}</div> : null}
          <div className="text-sm text-gray-400">
            Data folder: <span className="text-gray-200 break-all">{dataRoot || 'Unknown'}</span>
          </div>
          <div className="text-sm text-gray-400">
            Try restarting the app. If this keeps happening, choose “Use Per-User (AppData)” when prompted.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-gray-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-950/40 p-6 space-y-3">
        <div className="text-lg font-semibold">Initial setup</div>
        <div className="text-sm text-gray-300">{status.message}</div>
        <div className="h-2 w-full rounded bg-zinc-800 overflow-hidden">
          <div className="h-full w-1/2 bg-[#39FF14]/70 animate-pulse" />
        </div>
        {dataRoot ? (
          <div className="text-xs text-gray-500 break-all">{dataRoot}</div>
        ) : null}
      </div>
    </div>
  );
}
