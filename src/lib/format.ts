const DAY_MS = 24 * 60 * 60 * 1000;

function formatNumber(amount: number): string {
  return amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPeso(amount?: number, currency?: string): string {
  if (typeof amount !== 'number') return '';
  const formatted = formatNumber(amount);
  if (currency && currency !== 'PHP') return `${currency} ${formatted}`;
  return `₱${formatted}`;
}

export function formatDue(ms?: number): string {
  if (typeof ms !== 'number') return '';
  const date = new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  return `Due ${date}`;
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatRelativeDue(ms?: number, now: number = Date.now()): string {
  if (typeof ms !== 'number') return '';
  const days = Math.round((startOfDay(ms) - startOfDay(now)) / DAY_MS);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}
