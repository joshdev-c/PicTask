import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

export async function completeTask(ctx: MutationCtx, taskId: Id<'tasks'>): Promise<void> {
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
