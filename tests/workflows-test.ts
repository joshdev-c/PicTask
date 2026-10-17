import { isWorkflowStepReady, shouldFireReminderForStep } from '../convex/lib/workflows';

const steps = [
  { index: 0, status: 'done' as const },
  { index: 1, status: 'open' as const },
  { index: 2, status: 'open' as const },
];

describe('workflow steps', () => {
  test('step 0 is not ready after it is done', () => {
    expect(isWorkflowStepReady(steps, 0)).toBe(false);
  });

  test('step 1 is ready when step 0 is done', () => {
    expect(isWorkflowStepReady(steps, 1)).toBe(true);
  });

  test('step 2 stays blocked until step 1 is done', () => {
    expect(isWorkflowStepReady(steps, 2)).toBe(false);
  });

  test('snoozed previous step does not unlock the next', () => {
    const snoozed = [
      { index: 0, status: 'snoozed' as const },
      { index: 1, status: 'open' as const },
    ];
    expect(isWorkflowStepReady(snoozed, 1)).toBe(false);
    expect(shouldFireReminderForStep(snoozed, 1)).toBe(false);
    expect(shouldFireReminderForStep(snoozed, 0)).toBe(true);
  });

  test('locked steps do not get reminders', () => {
    expect(shouldFireReminderForStep(steps, 2)).toBe(false);
    expect(shouldFireReminderForStep(steps, 1)).toBe(true);
  });
});
