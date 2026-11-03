import type { DocumentCategory, DocumentDetails, ScanReviewInput, TaskRecord } from '../types';

const PROVIDERS = ['Meralco', 'Maynilad', 'Manila Water', 'Globe', 'PLDT', 'Converge'];

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const toIsoDate = (value?: string): string | undefined => {
  if (!value) return undefined;
  const cleaned = value.replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/,/g, '').trim();
  let year: number;
  let month: number;
  let day: number;
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(cleaned);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = /^([A-Za-z]{3,9})[-\s]+(\d{1,2})[-\s]+(\d{4})$/.exec(cleaned)
      ?? /^(\d{1,2})[-\s]+([A-Za-z]{3,9})[-\s]+(\d{4})$/.exec(cleaned);
    if (match) {
      if (/^[A-Za-z]/.test(match[1])) {
        month = MONTHS[match[1].toLowerCase()];
        day = Number(match[2]);
        year = Number(match[3]);
      } else {
        day = Number(match[1]);
        month = MONTHS[match[2].toLowerCase()];
        year = Number(match[3]);
      }
    } else {
      match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(cleaned);
      if (!match) return undefined;
      const first = Number(match[1]);
      const second = Number(match[2]);
      year = Number(match[3]);
      month = first > 12 ? second : first;
      day = first > 12 ? first : second;
      if (year < 100) year += year < 50 ? 2000 : 1900;
    }
  }
  if (year < 100) year += year < 50 ? 2000 : 1900;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12) return undefined;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return undefined;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const matchGroup = (text: string, expression: RegExp): string | undefined => text.match(expression)?.[1]?.trim();

const findDueDate = (text: string) => {
  const datePattern = '(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|[A-Za-z]{3,9}[-\\s]+\\d{1,2}(?:st|nd|rd|th)?[,]?[-\\s]+\\d{4}|\\d{1,2}(?:st|nd|rd|th)?[-\\s]+[A-Za-z]{3,9}[,]?[-\\s]+\\d{4})';
  const label = '\\b(?:due\\s*date|payment\\s+due(?:\\s+date)?|due\\s+on|due|deadline|pay\\s+on\\s+or\\s+before)\\b';
  const match = new RegExp(`${label}[\\s:,-]*(${datePattern})`, 'i').exec(text);
  return toIsoDate(match?.[1]);
};

const findAmountDue = (text: string) => {
  const label = '\\b(?:please\\s+pay(?:\\s+(?:the\\s+)?amount(?:\\s+of)?)?|total\\s+amount\\s+due|total\\s+due|amount\\s+due|balance\\s+due|amount\\s+payable|total\\s+payable|amount)\\b';
  const number = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
  const expression = new RegExp(`${label}[\\s:=-]*(?:(?:PHP|P(?=\\s|\\d)|₱)\\s*)?${number}(?![\\d/.-])`, 'i');
  const amountText = matchGroup(text, expression);
  if (amountText) {
    const amount = Number(amountText.replace(/,/g, ''));
    if (Number.isFinite(amount)) return amount;
  }

  const decimalAmounts = [...text.matchAll(/(?<![\d.,/-])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{1,2})(?![\d%.,/-])/g)];
  if (decimalAmounts.length !== 1) return undefined;
  return Number(decimalAmounts[0][0].replace(/,/g, ''));
};

export function extractReview(text: string, sourceUri?: string, sourceType: ScanReviewInput['sourceType'] = 'scan'): ScanReviewInput {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const provider = PROVIDERS.find((item) => new RegExp(item, 'i').test(normalized)) ?? '';
  const dueDate = findDueDate(normalized);
  const amountDue = findAmountDue(normalized);
  const accountNumber = matchGroup(normalized, /(?:account(?:\s*(?:no\.?|number))?|reference(?:\s*(?:no\.?|number))?|ref\.)\s*[:#\-]?\s*([A-Za-z0-9-]{5,})/i);
  const billingPeriod = matchGroup(normalized, /(?:billing\s*period|period\s*covered)\s*[:\-]?\s*([A-Za-z0-9\s,\-/]{4,40})/i);
  const category: DocumentCategory = amountDue !== undefined || /bill|statement|utility/i.test(normalized) ? 'bill' : dueDate || /deadline|submit|requirement/i.test(normalized) ? 'deadline' : 'general';
  const details: DocumentDetails = {
    provider,
    title: provider ? `${provider} notice` : category === 'bill' ? 'Bill payment' : category === 'deadline' ? 'Deadline notice' : 'New task',
    amountDue,
    dueDate,
    billingPeriod,
    accountNumber,
    retainFullIdentifier: false,
    rawText: normalized || undefined,
  };
  return { sourceUri, sourceType, category, details, confidence: details.dueDate || details.amountDue !== undefined ? 'high' : 'low', retention: 'details_only' };
}

export function recommendedTaskTitles(category: DocumentCategory, amount?: number): string[] {
  if (category === 'bill') return [`Prepare ${amount ? `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : 'the payment amount'}`, 'Pay the bill', 'Confirm payment', 'Mark bill as done'];
  if (category === 'deadline') return ['Review the requirement', 'Prepare what is needed', 'Complete before the deadline', 'Mark task as done'];
  return ['Review the notice', 'Complete the next action', 'Mark task as done'];
}

export const maskIdentifier = (value?: string) => {
  if (!value) return 'Not detected';
  return `•••• ${value.slice(-4)}`;
};

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeTasks(ownerId: string, documentId: string, category: DocumentCategory, dueDate?: string, amount?: number): TaskRecord[] {
  const now = new Date().toISOString();
  const source = category === 'bill' ? 'bill_rule' : category === 'deadline' ? 'deadline_rule' : 'general_rule';
  return recommendedTaskTitles(category, amount).map((title, position) => ({
    id: createId('task'), ownerId, documentId, position, title, dueDate, completed: false,
    recommendationSource: source, reminderDays: [7, 3, 1], syncState: 'pending', createdAt: now, updatedAt: now,
  }));
}
