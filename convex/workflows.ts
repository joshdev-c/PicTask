import { v } from 'convex/values';

import { mutation, query, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { isWorkflowStepReady, type StepState } from './lib/workflows';

// Deliberately duplicated from convex/tasks.ts: Convex function modules must
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
      const stepTask = await ctx.db.get(step.taskId);
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
  args: { workflowId: v.id('workflows') },
  handler: async (ctx, args) => {
    const workflow = await ctx.db.get(args.workflowId);
    if (!workflow) throw new Error('Workflow not found');
    const steps = await ctx.db
      .query('workflowSteps')
      .withIndex('by_workflow', (q) => q.eq('workflowId', args.workflowId))
      .collect();
    steps.sort((a, b) => a.index - b.index);
    const stepsWithTasks = await Promise.all(
      steps.map(async (step) => ({ ...step, task: await ctx.db.get(step.taskId) })),
    );
    const document = await ctx.db.get(workflow.documentId);
    const documentUrl = document ? await ctx.storage.getUrl(document.storageId) : null;
    return { workflow, steps: stepsWithTasks, documentUrl };
  },
});

export const completeStep = mutation({
  args: { workflowId: v.id('workflows'), stepIndex: v.number() },
  handler: async (ctx, args) => {
    const steps = await ctx.db
      .query('workflowSteps')
      .withIndex('by_workflow', (q) => q.eq('workflowId', args.workflowId))
      .collect();
    const step = steps.find((candidate) => candidate.index === args.stepIndex);
    if (!step) throw new Error('Step not found');
    const states: StepState[] = await Promise.all(
      steps.map(async (candidate) => {
        const task = await ctx.db.get(candidate.taskId);
        return { index: candidate.index, status: task?.status ?? 'open' };
      }),
    );
    if (!isWorkflowStepReady(states, args.stepIndex)) throw new Error('Step is locked');
    await completeTask(ctx, step.taskId);
  },
});
