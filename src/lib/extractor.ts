import type { DocumentCategory, DocumentDetails, ScanReviewInput, TaskRecord } from '../types';

const PROVIDERS = ['Meralco', 'Maynilad', 'Manila Water', 'Globe', 'PLDT', 'Converge'];

const toIsoDate = (value?: string): string | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/, '$2/$1/$3'));
  if (Number.isNaN(parsed.getTime())) return undefined;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const matchGroup = (text: string, expression: RegExp): string | undefined => text.match(expression)?.[1]?.trim();

export function extractReview(text: string, sourceUri?: string, sourceType: ScanReviewInput['sourceType'] = 'scan'): ScanReviewInput {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const provider = PROVIDERS.find((item) => new RegExp(item, 'i').test(normalized)) ?? '';
  const dueDateText = matchGroup(normalized, /(?:due\s*date|payment\s*due|due)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const amountText = matchGroup(normalized, /(?:total\s*)?(?:amount\s*due|balance\s*due|amount\s*payable)\s*[:\-]?\s*(?:PHP|₱|P)?\s*([\d,]+(?:\.\d{2})?)/i);
  const accountNumber = matchGroup(normalized, /(?:account(?:\s*(?:no\.?|number))?|reference(?:\s*(?:no\.?|number))?|ref\.)\s*[:#\-]?\s*([A-Za-z0-9-]{5,})/i);
  const billingPeriod = matchGroup(normalized, /(?:billing\s*period|period\s*covered)\s*[:\-]?\s*([A-Za-z0-9\s,\-/]{4,40})/i);
  const category: DocumentCategory = amountText || /bill|statement|utility/i.test(normalized) ? 'bill' : dueDateText || /deadline|submit|requirement/i.test(normalized) ? 'deadline' : 'general';
  const details: DocumentDetails = {
    provider,
    title: provider ? `${provider} notice` : category === 'bill' ? 'Bill payment' : category === 'deadline' ? 'Deadline notice' : 'New task',
    amountDue: amountText ? Number(amountText.replace(/,/g, '')) : undefined,
    dueDate: toIsoDate(dueDateText),
    billingPeriod,
    accountNumber,
    retainFullIdentifier: false,
    rawText: normalized || undefined,
  };
  return { sourceUri, sourceType, category, details, confidence: details.dueDate || details.amountDue ? 'high' : 'low', retention: 'details_only' };
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
