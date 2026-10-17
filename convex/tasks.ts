import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { buildAgendaItems } from './lib/agenda';
import { completeTask } from './lib/completeTask';

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

export const listByDocument = query({
  args: { documentId: v.id('documents') },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_document', (q) => q.eq('documentId', args.documentId))
      .collect();
    return tasks.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});
