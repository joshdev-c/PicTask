import { buildAgendaItems } from '../convex/lib/agenda';

describe('buildAgendaItems', () => {
  test('groups workflow tasks into one row', () => {
    const items = buildAgendaItems({
      now: Date.UTC(2026, 9, 14),
      documents: [{ _id: 'd1', title: 'Enrollment_Form.pdf' }],
      tasks: [
        {
          _id: 't1',
          documentId: 'd1',
          workflowId: 'w1',
          title: 'Step 1',
          status: 'done',
        },
        {
          _id: 't2',
          documentId: 'd1',
          workflowId: 'w1',
          title: 'Step 2',
          status: 'open',
          dueAt: Date.UTC(2026, 9, 20),
        },
        {
          _id: 't3',
          documentId: 'd1',
          title: 'Pay Meralco bill',
          status: 'open',
          dueAt: Date.UTC(2026, 9, 17),
          amount: 3482.5,
          currency: 'PHP',
        },
      ],
      workflows: [
        { _id: 'w1', documentId: 'd1', title: 'Submit school enrollment form', status: 'open' },
      ],
      steps: [
        { workflowId: 'w1', taskId: 't1', index: 0 },
        { workflowId: 'w1', taskId: 't2', index: 1 },
      ],
    });
    expect(items).toHaveLength(2);
    const workflow = items.find((item) => item.kind === 'workflow');
    const task = items.find((item) => item.kind === 'task');
    expect(workflow && workflow.kind === 'workflow' && workflow.currentIndex).toBe(1);
    expect(workflow && workflow.kind === 'workflow' && workflow.doneCount).toBe(1);
    expect(workflow && workflow.kind === 'workflow' && workflow.totalCount).toBe(2);
    expect(task && task.kind === 'task' && task.title).toBe('Pay Meralco bill');
  });
});
