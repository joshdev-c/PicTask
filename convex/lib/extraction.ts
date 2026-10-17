export const KINDS = ['document', 'receipt', 'bill', 'form', 'notice'] as const;
export type DocumentKind = (typeof KINDS)[number];

export type ExtractionTask = {
  title: string;
  amount?: number;
  dueAt?: string;
  sourceQuote?: string;
  sourcePage?: number;
  afterIndex: number | null;
};

export type ExtractionFields = {
  amount?: number;
  currency?: string;
  dueAt?: string;
  accountNo?: string;
  referenceNo?: string;
};

export type ExtractionResult = {
  title: string;
  kind: DocumentKind;
  pageCount: number;
  fields: ExtractionFields;
  rawText: string;
  tasks: ExtractionTask[];
};

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function isKind(value: unknown): value is DocumentKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

export function parseExtractionJson(raw: string): ExtractionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    throw new Error('Extraction JSON was not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Extraction JSON must be an object');
  }
  const data = parsed as Record<string, unknown>;
  if (typeof data.title !== 'string' || data.title.trim() === '') {
    throw new Error('Extraction JSON missing title');
  }
  if (!isKind(data.kind)) {
    throw new Error('Extraction JSON has unknown kind');
  }
  const pageCount = typeof data.pageCount === 'number' && data.pageCount > 0 ? data.pageCount : 1;
  const fieldsIn = (data.fields && typeof data.fields === 'object' ? data.fields : {}) as Record<
    string,
    unknown
  >;
  const fields: ExtractionFields = {};
  if (typeof fieldsIn.amount === 'number') fields.amount = fieldsIn.amount;
  if (typeof fieldsIn.currency === 'string') fields.currency = fieldsIn.currency;
  if (typeof fieldsIn.dueAt === 'string') fields.dueAt = fieldsIn.dueAt;
  if (typeof fieldsIn.accountNo === 'string') fields.accountNo = fieldsIn.accountNo;
  if (typeof fieldsIn.referenceNo === 'string') fields.referenceNo = fieldsIn.referenceNo;

  if (!Array.isArray(data.tasks) || data.tasks.length === 0) {
    throw new Error('Extraction JSON has no tasks');
  }
  const tasks: ExtractionTask[] = data.tasks.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Task ${index} is not an object`);
    }
    const row = item as Record<string, unknown>;
    if (typeof row.title !== 'string' || row.title.trim() === '') {
      throw new Error(`Task ${index} missing title`);
    }
    let afterIndex: number | null = null;
    if (row.afterIndex !== undefined && row.afterIndex !== null) {
      if (typeof row.afterIndex !== 'number' || !Number.isInteger(row.afterIndex)) {
        throw new Error(`Task ${index} has invalid afterIndex`);
      }
      afterIndex = row.afterIndex;
    }
    const task: ExtractionTask = { title: row.title.trim(), afterIndex };
    if (typeof row.amount === 'number') task.amount = row.amount;
    if (typeof row.dueAt === 'string') task.dueAt = row.dueAt;
    if (typeof row.sourceQuote === 'string') task.sourceQuote = row.sourceQuote;
    if (typeof row.sourcePage === 'number') task.sourcePage = row.sourcePage;
    return task;
  });
  for (const task of tasks) {
    if (task.afterIndex !== null && (task.afterIndex < 0 || task.afterIndex >= tasks.length)) {
      throw new Error('afterIndex is out of range');
    }
  }
  return {
    title: data.title.trim(),
    kind: data.kind,
    pageCount,
    fields,
    rawText: typeof data.rawText === 'string' ? data.rawText : '',
    tasks,
  };
}
