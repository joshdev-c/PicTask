import { parseExtractionJson } from '../convex/lib/extraction';
import { planAcceptSuggestions } from '../convex/lib/accept';

const extraction = parseExtractionJson(
  JSON.stringify({
    title: 'Meralco bill',
    kind: 'bill',
    pageCount: 1,
    fields: { amount: 3482.5, currency: 'PHP', dueAt: '2026-10-17' },
    rawText: '',
    tasks: [
      {
        title: 'Pay Meralco bill',
        amount: 3482.5,
        dueAt: '2026-10-17',
        sourceQuote: 'Please pay on or before October 17, 2026.',
        afterIndex: null,
      },
      { title: 'Save receipt to vault', afterIndex: 0 },
    ],
  }),
);

describe('planAcceptSuggestions', () => {
  test('creates a workflow when a selected task points at another selected task', () => {
    const plan = planAcceptSuggestions(extraction, [0, 1]);
    expect(plan.createWorkflow).toBe(true);
    expect(plan.tasks).toHaveLength(2);
    expect(plan.workflowTitle).toBe('Meralco bill');
  });

  test('does not create a workflow for a single selected task', () => {
    const plan = planAcceptSuggestions(extraction, [0]);
    expect(plan.createWorkflow).toBe(false);
    expect(plan.tasks).toHaveLength(1);
  });
});
