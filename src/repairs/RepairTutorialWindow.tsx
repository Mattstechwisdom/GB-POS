import React, { useMemo } from 'react';
import RepairTutorialPlayer from './RepairTutorialPlayer';
import { classifyRepairTutorialUrl, type RepairTutorialSource } from '../lib/repairTutorial';
import { consumeWindowPayload } from '../lib/windowPayload';

export default function RepairTutorialWindow({ onClose }: { onClose?: () => void }) {
  const source = useMemo<RepairTutorialSource | null>(() => {
    const stored = consumeWindowPayload('repairTutorial');
    if (stored?.normalizedUrl && stored?.mediaType) return stored;
    try {
      const raw = new URLSearchParams(window.location.search).get('repairTutorial');
      return raw ? classifyRepairTutorialUrl(raw) : null;
    } catch { return null; }
  }, []);
  return source ? <RepairTutorialPlayer source={source} onClose={onClose} /> : <div className="p-6 text-zinc-100">Tutorial link unavailable.</div>;
}
