import { formatDue, formatPeso, formatRelativeDue } from '../src/lib/format';

test('formats pesos, due dates, and relative days', () => {
  expect(formatPeso(3482.5, 'PHP')).toBe('₱3,482.50');
  expect(formatPeso(3482.5)).toBe('₱3,482.50');
  expect(formatPeso(undefined, 'PHP')).toBe('');
  expect(formatPeso(10, 'USD')).toBe('USD 10.00');

  expect(formatDue(new Date(2026, 9, 17).getTime())).toBe('Due Oct 17');
  expect(formatDue(undefined)).toBe('');

  const now = new Date(2026, 9, 14).getTime();
  expect(formatRelativeDue(new Date(2026, 9, 17).getTime(), now)).toBe('In 3 days');
  expect(formatRelativeDue(new Date(2026, 9, 14).getTime(), now)).toBe('Today');
  expect(formatRelativeDue(new Date(2026, 9, 15).getTime(), now)).toBe('Tomorrow');
  expect(formatRelativeDue(new Date(2026, 9, 13).getTime(), now)).toBe('Overdue');
  expect(formatRelativeDue(undefined, now)).toBe('');
});
