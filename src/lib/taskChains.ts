import type { TaskRecord } from '../types';

const compareTaskOrder = (a: TaskRecord, b: TaskRecord) =>
  a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export function getTaskPrerequisite(tasks: TaskRecord[], task: TaskRecord): TaskRecord | undefined {
  const chain = tasks
    .filter((item) => item.documentId === task.documentId)
    .sort(compareTaskOrder);
  const taskIndex = chain.findIndex((item) => item.id === task.id);

  if (taskIndex <= 0) return undefined;
  return chain.slice(0, taskIndex).find((item) => !item.completed);
}

export function getCurrentTaskInChain(tasks: TaskRecord[]): TaskRecord | undefined {
  return [...tasks].sort(compareTaskOrder).find((task) => !task.completed);
}

export function getCurrentTasks(tasks: TaskRecord[]): TaskRecord[] {
  const taskChains = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    const chain = taskChains.get(task.documentId) ?? [];
    chain.push(task);
    taskChains.set(task.documentId, chain);
  }
  return Array.from(taskChains.values(), getCurrentTaskInChain)
    .filter((task): task is TaskRecord => task !== undefined);
}
