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

// New clean learning era requested for QR-driven shop workflow. Records must
// contain both workflow timestamps on or after this instant to qualify.
export const REPAIR_STATISTICS_BASELINE = '2026-09-12T04:00:00.000Z';
const baselineTimestamp = timestamp(REPAIR_STATISTICS_BASELINE);

const isExcludedCharge = (item: any, value: string) => {
  if (clean(item?.feeType)) return true;
  return /diagnostic|expedited|rush\s*(service\s*)?fee|additional\s*fee|service\s*fee|storage\s*fee/i.test(value);
};

export function substantiveRepairNames(record: any): string[] {
  return [...new Set<string>((Array.isArray(record?.items) ? record.items : [])
    .map((item: any): { item: any; value: string } => ({ item, value: clean(item?.repair || item?.description || item?.title || item?.name) }))
    .filter(({ item, value }: { item: any; value: string }) => value && !isExcludedCharge(item, value))
    .map(({ value }: { value: string }) => value))];
}

export function repairPatternKey(record: any): string {
  const category = normalized(record?.productCategory || record?.deviceCategory || record?.category);
  const repairs = substantiveRepairNames(record).map(normalized).filter(Boolean).sort().join('|');
  return repairs ? `${category}::${repairs}` : '';
}

export function repairTurnaroundHours(record: any): number | null {
  if (/not.*(repairable|possible)|declined/i.test(clean(record?.repairStatus || record?.workflowStatus || record?.statusUpdate))) return null;
  const startedAt = timestamp(record?.diagnosisStartedAt || record?.diagnosis_started_at);
  const finishedAt = timestamp(record?.repairCompletionDate || record?.repair_completion_date);
  return startedAt >= baselineTimestamp && finishedAt >= baselineTimestamp && finishedAt > startedAt ? (finishedAt - startedAt) / 3_600_000 : null;
}

export type RepairStatistics = {
  completedSamples: number;
  averageTurnaroundHours: number;
  medianTurnaroundHours: number;
  quickCompletedCount: number;
  quickTurnaroundRate: number;
  averageDiagnosisHours: number;
  averageTestingHours: number;
  mostCommonRepairs: Array<{ name: string; count: number }>;
  quickPatterns: Array<{ key: string; label: string; samples: number; medianHours: number }>;
  quickPatternKeys: string[];
};

export function buildRepairStatistics(records: any[] = []): RepairStatistics {
  const durations: number[] = [];
  const diagnosisDurations: number[] = [];
  const testingDurations: number[] = [];
  const patternSamples = new Map<string, { durations: number[]; label: string }>();
  const repairCounts = new Map<string, { name: string; count: number }>();
  records.forEach(record => {
    const duration = repairTurnaroundHours(record);
    const names = substantiveRepairNames(record);
    if (duration == null || !names.length) return;
    names.forEach(name => {
      const key = normalized(name);
      const current = repairCounts.get(key) || { name, count: 0 };
      current.count += 1;
      repairCounts.set(key, current);
    });
    durations.push(duration);
    const diagnosisAt = timestamp(record?.diagnosisStartedAt || record?.diagnosis_started_at);
    const testingAt = timestamp(record?.testingStartedAt || record?.testing_started_at);
    const completedAt = timestamp(record?.repairCompletionDate || record?.repair_completion_date);
    if (testingAt >= diagnosisAt && testingAt <= completedAt) {
      diagnosisDurations.push((testingAt - diagnosisAt) / 3_600_000);
      testingDurations.push((completedAt - testingAt) / 3_600_000);
    }
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
    averageDiagnosisHours: diagnosisDurations.length ? round2(diagnosisDurations.reduce((sum, hours) => sum + hours, 0) / diagnosisDurations.length) : 0,
    averageTestingHours: testingDurations.length ? round2(testingDurations.reduce((sum, hours) => sum + hours, 0) / testingDurations.length) : 0,
    mostCommonRepairs: [...repairCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 10),
    quickPatterns,
    quickPatternKeys: quickPatterns.map(pattern => pattern.key),
  };
}
