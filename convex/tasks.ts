import { v } from 'convex/values';

import { mutation, query, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { buildAgendaItems } from './lib/agenda';

// Deliberately duplicated in convex/workflows.ts: Convex function modules must
// not export non-Convex helpers, so "complete task" stays local to each module
// instead of pulling in a new shared file.
async function completeTask(ctx: MutationCtx, taskId: Id<'tasks'>): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task) throw new Error('Task not found');
  await ctx.db.patch(taskId, { status: 'done' });

  const reminders = await ctx.db
    .query('reminders')
    .withIndex('by_task', (q) => q.eq('taskId', taskId))
    .collect();
  for (const reminder of reminders) {
    if (reminder.status === 'scheduled') {
      await ctx.db.patch(reminder._id, { status: 'cancelled' });
    }
  }

  if (task.workflowId) {
    const workflowId = task.workflowId;
    const steps = await ctx.db
      .query('workflowSteps')
      .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
      .collect();
    let allDone = steps.length > 0;
    for (const step of steps) {
      const stepTask = step.taskId === taskId ? task : await ctx.db.get(step.taskId);
      if (stepTask?.status !== 'done') {
        allDone = false;
        break;
      }
    }
    if (allDone) {
      await ctx.db.patch(workflowId, { status: 'done' });
    }
  }
}

export const get = query({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error('Task not found');
    return task;
  },
});

export const complete = mutation({
  args: { taskId: v.id('tasks') },
  handler: async (ctx, args) => {
    await completeTask(ctx, args.taskId);
  },
});

export const agenda = query({
  args: {},
  handler: async (ctx) => {
    const documents = await ctx.db.query('documents').collect();
    const tasks = await ctx.db.query('tasks').collect();
    const workflows = await ctx.db.query('workflows').collect();
    const steps = await ctx.db.query('workflowSteps').collect();
    return buildAgendaItems({
      now: Date.now(),
      documents: documents.map((document) => ({ _id: document._id, title: document.title })),
      tasks: tasks.map((task) => ({
        _id: task._id,
        documentId: task.documentId,
        workflowId: task.workflowId,
        title: task.title,
        status: task.status,
        dueAt: task.dueAt,
        amount: task.amount,
        currency: task.currency,
      })),
      workflows: workflows.map((workflow) => ({
        _id: workflow._id,
        documentId: workflow.documentId,
        title: workflow.title,
        dueAt: workflow.dueAt,
        status: workflow.status,
      })),
      steps: steps.map((step) => ({
        workflowId: step.workflowId,
        taskId: step.taskId,
        index: step.index,
      })),
    });
  },
});
