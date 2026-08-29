import { isSharedTaskAssignment, taskAssignmentIncludes, taskIsCompleted } from './calendarTasks';

type DailyTask = { category?: string; technician?: string; taskCompleted?: boolean; [key: string]: any };

export function sharedDailyLookTasks<T extends DailyTask>(tasks: T[]): T[] {
  return (tasks || []).filter((task) => task.category === 'task' && isSharedTaskAssignment(task.technician));
}

export function tasksForSelectedTechnician<T extends DailyTask>(tasks: T[], technician: string): T[] {
  return (tasks || []).filter((task) => task.category === 'task' && !isSharedTaskAssignment(task.technician) && taskAssignmentIncludes(task.technician, technician));
}

export function countOpenTasksByTechnician<T extends DailyTask>(tasks: T[], technicianNames: string[]): Record<string, number> {
  return Object.fromEntries((technicianNames || []).map((name) => [name, tasksForSelectedTechnician(tasks, name).filter((task) => !taskIsCompleted(task)).length]));
}
