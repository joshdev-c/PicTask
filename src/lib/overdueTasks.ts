import type { TaskRecord } from '../types';

const localDateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const toUtcDay = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return Math.floor(timestamp / 86_400_000);
};

export function getOverdueTasksForFollowUp(tasks: TaskRecord[], today = localDateValue(new Date())): TaskRecord[] {
  const todayDay = toUtcDay(today);
  if (todayDay === undefined) return [];

  return tasks.filter((task) => {
    if (task.completed || !task.dueDate) return false;
    const dueDay = toUtcDay(task.dueDate);
    return dueDay !== undefined && todayDay - dueDay > 30;
  });
}

export function getRecentOverdueTasks(tasks: TaskRecord[], today = localDateValue(new Date())): TaskRecord[] {
  const todayDay = toUtcDay(today);
  if (todayDay === undefined) return [];

  return tasks.filter((task) => {
    if (task.completed || !task.dueDate) return false;
    const dueDay = toUtcDay(task.dueDate);
    const daysOverdue = dueDay === undefined ? 0 : todayDay - dueDay;
    return daysOverdue > 0 && daysOverdue <= 30;
  });
}

export function isMoreThanDaysPast(dueDate: string | undefined, days: number, today = localDateValue(new Date())): boolean {
  const todayDay = toUtcDay(today);
  const dueDay = dueDate ? toUtcDay(dueDate) : undefined;
  return todayDay !== undefined && dueDay !== undefined && todayDay - dueDay > days;
}
