type IdentifiedRecord = { id?: string | number | null };

export function replaceRecordById<T extends IdentifiedRecord>(records: readonly T[], saved: T): T[] {
  const savedId = String(saved?.id ?? '');
  if (!savedId) return records.slice();
  let replaced = false;
  const next = records.map(record => {
    if (String(record?.id ?? '') !== savedId) return record;
    replaced = true;
    return saved;
  });
  return replaced ? next : [...next, saved];
}

type TaskRecord = IdentifiedRecord & {
  taskCompleted?: boolean;
  taskCompletedAt?: string;
  taskCompletedBy?: string;
  recurrenceRule?: any;
  updatedAt?: string;
};

export function taskCompletionPatch<T extends TaskRecord>(
  task: T,
  completed: boolean,
  occurrenceDate: string,
  completedBy: string,
  now = new Date().toISOString(),
): T {
  const recurrenceRule = task.recurrenceRule
    ? { ...task.recurrenceRule, completedDates: [...(task.recurrenceRule.completedDates || [])] }
    : null;
  if (recurrenceRule) {
    const completedDates = new Set<string>(recurrenceRule.completedDates);
    if (completed) completedDates.add(occurrenceDate);
    else completedDates.delete(occurrenceDate);
    recurrenceRule.completedDates = Array.from(completedDates).sort();
  }
  return {
    ...task,
    recurrenceRule,
    taskCompleted: completed,
    taskCompletedAt: completed ? now : '',
    taskCompletedBy: completed ? completedBy : '',
    updatedAt: now,
  };
}
