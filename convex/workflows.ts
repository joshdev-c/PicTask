import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { completeTask } from './lib/completeTask';
import { isWorkflowStepReady, type StepState } from './lib/workflows';

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
