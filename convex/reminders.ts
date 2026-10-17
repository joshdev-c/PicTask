import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { snoozeFireAt } from './lib/reminders';
import { shouldFireReminderForStep, type StepState } from './lib/workflows';

type ReminderRow = {
  reminderId: string;
  taskId: string;
  title: string;
  fireAt: number;
  locked: boolean;
  blockedByStepIndex?: number;
  amount?: number;
  currency?: string;
  documentId?: string;
  sourceName?: string;
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    const reminders = await ctx.db.query('reminders').collect();
    const rows: ReminderRow[] = [];
    for (const reminder of reminders) {
      if (reminder.status !== 'scheduled') continue;
      const task = await ctx.db.get(reminder.taskId);
      if (!task) continue;
      const document = await ctx.db.get(task.documentId);
      let locked = false;
      let blockedByStepIndex: number | undefined;
      if (task.workflowId) {
        const workflowId = task.workflowId;
        const steps = await ctx.db
          .query('workflowSteps')
          .withIndex('by_workflow', (q) => q.eq('workflowId', workflowId))
          .collect();
        const states: StepState[] = await Promise.all(
          steps.map(async (step) => {
            const stepTask = await ctx.db.get(step.taskId);
            return { index: step.index, status: stepTask?.status ?? 'open' };
          }),
        );
        const current = steps.find((step) => step.taskId === reminder.taskId);
        locked = !shouldFireReminderForStep(states, current?.index ?? 0);
        if (locked) blockedByStepIndex = current?.blockedByStepIndex;
      }
      rows.push({
        reminderId: reminder._id,
        taskId: task._id,
        title: task.title,
        fireAt: reminder.fireAt,
        locked,
        blockedByStepIndex,
        amount: task.amount,
        currency: task.currency,
        documentId: task.documentId,
        sourceName: document?.title,
      });
    }
    return rows;
  },
});

export const snooze = mutation({
  args: { reminderId: v.id('reminders') },
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder) throw new Error('Reminder not found');
    const task = await ctx.db.get(reminder.taskId);
    if (!task) throw new Error('Task not found');
    await ctx.db.patch(reminder._id, { status: 'cancelled' });
    await ctx.db.patch(task._id, { status: 'snoozed' });
    await ctx.db.insert('reminders', {
      taskId: task._id,
      fireAt: snoozeFireAt(new Date()).getTime(),
      kind: 'snooze',
      status: 'scheduled',
    });
  },
});
