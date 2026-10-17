export type AgendaItem =
  | {
      kind: 'task';
      taskId: string;
      documentId: string;
      title: string;
      dueAt?: number;
      amount?: number;
      currency?: string;
      sourceName: string;
      urgency: 'dueSoon' | 'open';
    }
  | {
      kind: 'workflow';
      workflowId: string;
      documentId: string;
      title: string;
      dueAt?: number;
      sourceName: string;
      doneCount: number;
      totalCount: number;
      currentIndex: number;
      urgency: 'dueSoon' | 'open';
    };

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function urgency(dueAt: number | undefined, now: number): 'dueSoon' | 'open' {
  if (dueAt === undefined) return 'open';
  return dueAt - now <= THREE_DAYS_MS ? 'dueSoon' : 'open';
}

export function buildAgendaItems(input: {
  now: number;
  documents: { _id: string; title: string }[];
  tasks: {
    _id: string;
    documentId: string;
    workflowId?: string;
    title: string;
    status: 'open' | 'done' | 'snoozed';
    dueAt?: number;
    amount?: number;
    currency?: string;
  }[];
  workflows: {
    _id: string;
    documentId: string;
    title: string;
    dueAt?: number;
    status: 'open' | 'done';
  }[];
  steps: { workflowId: string; taskId: string; index: number }[];
}): AgendaItem[] {
  const docs = new Map(input.documents.map((doc) => [doc._id, doc.title]));
  const items: AgendaItem[] = [];
  for (const workflow of input.workflows) {
    if (workflow.status === 'done') continue;
    const workflowSteps = input.steps
      .filter((step) => step.workflowId === workflow._id)
      .sort((a, b) => a.index - b.index);
    const stepTasks = workflowSteps.map((step) =>
      input.tasks.find((task) => task._id === step.taskId),
    );
    const doneCount = stepTasks.filter((task) => task?.status === 'done').length;
    if (doneCount === workflowSteps.length && workflowSteps.length > 0) continue;
    const current = workflowSteps.find((step, i) => stepTasks[i]?.status !== 'done');
    const dueAt = workflow.dueAt;
    items.push({
      kind: 'workflow',
      workflowId: workflow._id,
      documentId: workflow.documentId,
      title: workflow.title,
      dueAt,
      sourceName: docs.get(workflow.documentId) ?? '',
      doneCount,
      totalCount: workflowSteps.length,
      currentIndex: current?.index ?? 0,
      urgency: urgency(dueAt, input.now),
    });
  }
  for (const task of input.tasks) {
    if (task.workflowId) continue;
    if (task.status === 'done') continue;
    items.push({
      kind: 'task',
      taskId: task._id,
      documentId: task.documentId,
      title: task.title,
      dueAt: task.dueAt,
      amount: task.amount,
      currency: task.currency,
      sourceName: docs.get(task.documentId) ?? '',
      urgency: urgency(task.dueAt, input.now),
    });
  }
  return items.sort(
    (a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER),
  );
}
