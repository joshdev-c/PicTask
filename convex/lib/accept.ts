import { ExtractionResult } from './extraction';

export type PlannedAcceptTask = {
  title: string;
  dueAt?: number;
  amount?: number;
  currency?: string;
  sourceQuote?: string;
  sourcePage?: number;
  sortOrder: number;
  afterIndex: number | null;
};

export type PlannedAccept = {
  createWorkflow: boolean;
  workflowTitle: string;
  workflowDueAt?: number;
  tasks: PlannedAcceptTask[];
};

function dateOnlyToUtcNoon(value?: string): number | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0).getTime();
}

export function planAcceptSuggestions(
  extraction: ExtractionResult,
  selectedIndexes: number[],
): PlannedAccept {
  const unique = [...new Set(selectedIndexes)].filter(
    (index) => index >= 0 && index < extraction.tasks.length,
  );
  unique.sort((a, b) => a - b);
  const selected = new Set(unique);
  const tasks: PlannedAcceptTask[] = unique.map((index, sortOrder) => {
    const task = extraction.tasks[index];
    const afterIndex =
      task.afterIndex !== null && selected.has(task.afterIndex)
        ? unique.indexOf(task.afterIndex)
        : null;
    return {
      title: task.title,
      dueAt: dateOnlyToUtcNoon(task.dueAt) ?? dateOnlyToUtcNoon(extraction.fields.dueAt),
      amount: task.amount ?? extraction.fields.amount,
      currency: extraction.fields.currency,
      sourceQuote: task.sourceQuote,
      sourcePage: task.sourcePage,
      sortOrder,
      afterIndex,
    };
  });
  const createWorkflow = tasks.length >= 2 && tasks.some((task) => task.afterIndex !== null);
  const workflowDueAt = tasks
    .map((task) => task.dueAt)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => b - a)[0];
  return {
    createWorkflow,
    workflowTitle: extraction.title,
    workflowDueAt,
    tasks,
  };
}
