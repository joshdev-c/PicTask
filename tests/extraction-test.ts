import { parseExtractionJson } from '../convex/lib/extraction';

const sample = {
  title: 'Meralco bill',
  kind: 'bill',
  pageCount: 1,
  fields: {
    amount: 3482.5,
    currency: 'PHP',
    dueAt: '2026-10-17',
    accountNo: '2208-4471-93',
  },
  rawText: 'Please pay on or before October 17, 2026.',
  tasks: [
    {
      title: 'Pay Meralco bill',
      amount: 3482.5,
      dueAt: '2026-10-17',
      sourceQuote: 'Please pay on or before October 17, 2026.',
      sourcePage: 1,
      afterIndex: null,
    },
    {
      title: 'Save receipt to vault',
      afterIndex: 0,
    },
  ],
};

describe('parseExtractionJson', () => {
  test('parses the spec contract', () => {
    const result = parseExtractionJson(JSON.stringify(sample));
    expect(result.title).toBe('Meralco bill');
    expect(result.kind).toBe('bill');
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[1].afterIndex).toBe(0);
  });

  test('strips markdown fences', () => {
    const result = parseExtractionJson('```json\n' + JSON.stringify(sample) + '\n```');
    expect(result.tasks[0].title).toBe('Pay Meralco bill');
  });

  test('rejects empty tasks', () => {
    expect(() =>
      parseExtractionJson(JSON.stringify({ ...sample, tasks: [] })),
    ).toThrow(/no tasks/i);
  });

  test('rejects unknown kind', () => {
    expect(() =>
      parseExtractionJson(JSON.stringify({ ...sample, kind: 'invoice' })),
    ).toThrow(/kind/i);
  });

  test('rejects afterIndex out of range', () => {
    const bad = {
      ...sample,
      tasks: [{ title: 'Only', afterIndex: 3 }],
    };
    expect(() => parseExtractionJson(JSON.stringify(bad))).toThrow(/afterIndex/i);
  });
});
