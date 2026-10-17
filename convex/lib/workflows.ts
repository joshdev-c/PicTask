export type StepStatus = 'open' | 'done' | 'snoozed';
export type StepState = { index: number; status: StepStatus };

export function isWorkflowStepReady(steps: StepState[], index: number): boolean {
  const current = steps.find((step) => step.index === index);
  if (!current || current.status === 'done') {
    return false;
  }
  if (index === 0) {
    return true;
  }
  const previous = steps.find((step) => step.index === index - 1);
  return previous?.status === 'done';
}

export function shouldFireReminderForStep(steps: StepState[], index: number): boolean {
  return isWorkflowStepReady(steps, index);
}
