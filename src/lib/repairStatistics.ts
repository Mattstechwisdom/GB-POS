const clean = (value: unknown) => String(value ?? '').trim();
const normalized = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const timestamp = (value: unknown) => {
  const parsed = new Date(String(value || 0)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function substantiveRepairNames(record: any): string[] {
  return [...new Set<string>((Array.isArray(record?.items) ? record.items : [])
    .map((item: any) => clean(item?.repair || item?.description || item?.title || item?.name))
    .filter((value: string) => value && !/^(diagnostic|diagnostic fee|expedited service fee|rush fee|additional fee)$/i.test(value)))];
}

export function repairPatternKey(record: any): string {
  const category = normalized(record?.productCategory || record?.deviceCategory || record?.category);
  const repairs = substantiveRepairNames(record).map(normalized).filter(Boolean).sort().join('|');
  return repairs ? `${category}::${repairs}` : '';
}

export function repairTurnaroundHours(record: any): number | null {
  const startedAt = timestamp(record?.diagnosisStartedAt || record?.diagnosis_started_at || record?.checkInAt || record?.createdAt);
  const finishedAt = timestamp(record?.repairCompletionDate || record?.pickupReadyAt || record?.checkoutDate);
  return startedAt && finishedAt > startedAt ? (finishedAt - startedAt) / 3_600_000 : null;
}

export type RepairStatistics = {
  completedSamples: number;
  averageTurnaroundHours: number;
  medianTurnaroundHours: number;
  quickCompletedCount: number;
  quickTurnaroundRate: number;
  mostCommonRepairs: Array<{ name: string; count: number }>;
  quickPatterns: Array<{ key: string; label: string; samples: number; medianHours: number }>;
  quickPatternKeys: string[];
};

export function buildRepairStatistics(records: any[] = []): RepairStatistics {
  const durations: number[] = [];
  const patternSamples = new Map<string, { durations: number[]; label: string }>();
  const repairCounts = new Map<string, { name: string; count: number }>();
  records.forEach(record => {
    const duration = repairTurnaroundHours(record);
    const names = substantiveRepairNames(record);
    names.forEach(name => {
      const key = normalized(name);
      const current = repairCounts.get(key) || { name, count: 0 };
      current.count += 1;
      repairCounts.set(key, current);
    });
    if (duration == null) return;
    durations.push(duration);
    const key = repairPatternKey(record);
    if (!key) return;
    const current = patternSamples.get(key) || { durations: [], label: [clean(record?.productCategory || record?.deviceCategory || record?.category), names.join(' + ')].filter(Boolean).join(' · ') };
    current.durations.push(duration);
    patternSamples.set(key, current);
  });
  const quickPatterns = [...patternSamples.entries()].filter(([, sample]) => sample.durations.length >= 2 && median(sample.durations) <= 24).map(([key, sample]) => ({ key, label: sample.label, samples: sample.durations.length, medianHours: round2(median(sample.durations)) })).sort((a, b) => a.medianHours - b.medianHours || b.samples - a.samples);
  const completedSamples = durations.length;
  const quickCompletedCount = durations.filter(hours => hours <= 24).length;
  return {
    completedSamples,
    averageTurnaroundHours: completedSamples ? round2(durations.reduce((sum, hours) => sum + hours, 0) / completedSamples) : 0,
    medianTurnaroundHours: completedSamples ? round2(median(durations)) : 0,
    quickCompletedCount,
    quickTurnaroundRate: completedSamples ? round2(quickCompletedCount / completedSamples * 100) : 0,
    mostCommonRepairs: [...repairCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 10),
    quickPatterns,
    quickPatternKeys: quickPatterns.map(pattern => pattern.key),
  };
}
