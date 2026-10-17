# PicTask Expo Go Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an Expo Go PicTask demo that scans or imports a document, extracts source-quoted tasks via a Convex vision-LLM action, and surfaces them on Today, Tasks, Vault, workflow detail, and Reminders.

**Architecture:** Pure scheduling/extraction/workflow logic lives in `convex/lib` so Jest and Convex mutations share one implementation. The Expo Router app uploads files to Convex storage, an action calls Anthropic, Review persists selected tasks, and local `expo-notifications` mirror reminder rows. No ML Kit, no conflict banner, no password auth.

**Tech Stack:** Expo SDK 58, Expo Router, TypeScript, Convex, Anthropic vision, expo-image-picker, expo-document-picker, expo-notifications, jest-expo.

## Global Constraints

- Stay in Expo Go for this demo; do not add native ML Kit or an EAS development build.
- Use Expo Router only; do not add a second navigation library.
- LLM API keys exist only in Convex environment variables, never in the Expo client.
- Convex is source of truth; do not add SQLite or Firebase/Supabase.
- Do not implement auto conflict detection or a fake “Dates don’t match” banner.
- `boundingBox` may exist on tasks as optional unused data; do not highlight photo regions.
- Default reminder: 3 days before due at 09:00 **in the Convex runtime timezone** (UTC on a hosted deployment — not the phone's timezone). Accepted demo limitation; `computeReminderFireAt` deliberately stays a pure local-time function. Locked workflow steps must not fire.
- Scan is a FAB on Today and Vault, not a bottom tab. Tabs in order: Today, Tasks, Vault, Reminders.
- Windows installs for Jest use `npx expo install jest-expo jest @types/jest "--" --dev`.
- Run tests with `npx jest --watchAll=false` (add `test:ci` script). Do not use `npm run test` if it is `--watchAll`.
- Before any Expo/EAS API, read `package.json` expo major (58) and the matching docs at `https://docs.expo.dev/versions/v58.0.0/`.
- Frequent commits after each task. Do not commit `.env.local` or API keys.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `convex/schema.ts` | documents, tasks, workflows, workflowSteps, reminders |
| `convex/lib/extraction.ts` | Parse/validate vision JSON |
| `convex/lib/reminders.ts` | `computeReminderFireAt` |
| `convex/lib/workflows.ts` | Step ready / reminder-eligible |
| `convex/lib/agenda.ts` | Collapse workflow tasks into Today/Tasks rows |
| `convex/lib/accept.ts` | Build inserts from selected suggestions |
| `convex/documents.ts` | Upload URL, create, get, list, retry extract |
| `convex/extract.ts` | Node action: file → Anthropic → parse → patch document |
| `convex/tasks.ts` | Queries, complete, snooze |
| `convex/workflows.ts` | Workflow + steps query, complete step |
| `convex/reminders.ts` | List, snooze, cancel |
| `src/lib/api.ts` | Re-export `api` from `convex/_generated/api` |
| `src/lib/format.ts` | PHP currency and date copy |
| `src/lib/notifications.ts` | Permission + schedule/cancel locals |
| `src/app/_layout.tsx` | ConvexProvider + root Stack |
| `src/app/(tabs)/_layout.tsx` | Four NativeTabs |
| `src/app/(tabs)/index.tsx` | Today |
| `src/app/(tabs)/tasks.tsx` | All open agenda items |
| `src/app/(tabs)/vault.tsx` | Vault list + FAB |
| `src/app/(tabs)/reminders.tsx` | Next up / this week / later |
| `src/app/scan.tsx` | Picker chrome + kind chips |
| `src/app/review/[documentId].tsx` | Suggestions + accept |
| `src/app/task/[taskId].tsx` | Source quote + image |
| `src/app/workflow/[workflowId].tsx` | Step list |
| `src/app/document/[documentId].tsx` | Vault document + its tasks |
| `src/components/pictask/scan-fab.tsx` | FAB |
| `src/components/pictask/agenda-card.tsx` | Shared card |
| `src/components/pictask/kind-chips.tsx` | Document/Receipt/Bill/Form |
| `src/components/app-tabs.tsx` | Four triggers (web twin too) |
| `tests/extraction-test.ts` | Parser tests |
| `tests/reminders-test.ts` | fireAt tests |
| `tests/workflows-test.ts` | Unlock tests |
| `tests/agenda-test.ts` | Grouping tests |
| `tests/accept-test.ts` | Save planning tests |

Delete after tabs exist: `src/app/explore.tsx` (replace with new tab files). Keep themed primitives.

---

### Task 1: Jest and extraction parser

**Files:**
- Create: `convex/lib/extraction.ts`
- Create: `tests/extraction-test.ts`
- Modify: `package.json` (jest preset, `test` / `test:ci` scripts)
- Modify: `tsconfig.json` (`compilerOptions.types` include `"jest"`)

**Interfaces:**
- Consumes: none
- Produces: `DocumentKind`, `ExtractionTask`, `ExtractionResult`, `parseExtractionJson(raw: string): ExtractionResult`, `KINDS: DocumentKind[]`

- [ ] **Step 1: Install Jest (Windows)**

Run from repo root:

```powershell
npx expo install jest-expo jest @types/jest "--" --dev
```

Add to `package.json`:

```json
"scripts": {
  "test": "jest --watchAll",
  "test:ci": "jest --watchAll=false"
},
"jest": {
  "preset": "jest-expo"
}
```

Add to `tsconfig.json` `compilerOptions`:

```json
"types": ["jest"]
```

- [ ] **Step 2: Write the failing test**

Create `tests/extraction-test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest --watchAll=false tests/extraction-test.ts`

Expected: FAIL with `Cannot find module '../convex/lib/extraction'` or `parseExtractionJson is not a function`.

- [ ] **Step 4: Write minimal implementation**

Create `convex/lib/extraction.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest --watchAll=false tests/extraction-test.ts`

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json tsconfig.json convex/lib/extraction.ts tests/extraction-test.ts
git commit -m "test: parse vision extraction JSON"
```

---

### Task 2: Reminder fireAt

**Files:**
- Create: `convex/lib/reminders.ts`
- Create: `tests/reminders-test.ts`

**Interfaces:**
- Consumes: none
- Produces: `computeReminderFireAt(dueAt: Date, now: Date): Date`

Treat `dueAt` as a local calendar day (use the Date’s local Y/M/D). Reminder time is always 09:00 local.

Rules copied from the spec:

1. Preferred fire = three calendar days before due at 09:00.
2. If preferred is still in the future, use it.
3. If due’s calendar day is today or earlier, return `now`.
4. Otherwise return the next 09:00 that is still before the end of the due calendar day (due day 09:00 is allowed). If that 09:00 is already past, return `now`.

- [ ] **Step 1: Write the failing test**

Create `tests/reminders-test.ts`:

```ts
import { computeReminderFireAt } from '../convex/lib/reminders';

function at(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

describe('computeReminderFireAt', () => {
  test('uses 3 days before at 09:00 when that is still future', () => {
    const due = at(2026, 10, 17, 0);
    const now = at(2026, 10, 1, 12);
    const fire = computeReminderFireAt(due, now);
    expect(fire).toEqual(at(2026, 10, 14, 9));
  });

  test('returns now when due is today', () => {
    const due = at(2026, 10, 17, 0);
    const now = at(2026, 10, 17, 10, 30);
    const fire = computeReminderFireAt(due, now);
    expect(fire.getTime()).toBe(now.getTime());
  });

  test('returns now when overdue', () => {
    const due = at(2026, 10, 17, 0);
    const now = at(2026, 10, 18, 8);
    expect(computeReminderFireAt(due, now).getTime()).toBe(now.getTime());
  });

  test('falls back to due-day 09:00 when 3-day mark is past and due is tomorrow', () => {
    const due = at(2026, 10, 17, 0);
    const now = at(2026, 10, 16, 10);
    expect(computeReminderFireAt(due, now)).toEqual(at(2026, 10, 17, 9));
  });

  test('returns now when due is tomorrow and today 09:00 and due-day 09:00 are both unusable because now is after due-day 09:00 — not applicable; if now is due morning before 09:00 use 09:00', () => {
    const due = at(2026, 10, 17, 0);
    const now = at(2026, 10, 17, 8);
    expect(computeReminderFireAt(due, now)).toEqual(at(2026, 10, 17, 9));
  });
});
```

The last case: due is today but it is 08:00, so 09:00 today is still before end of due day and still future — fire at 09:00, not `now`. Update `isDueToday` so “immediately if due is today” applies only when today’s 09:00 is already past. That matches “next 09:00 before due, or immediately if due is today” once 09:00 passed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchAll=false tests/reminders-test.ts`

Expected: FAIL module not found.

- [ ] **Step 3: Write minimal implementation**

Create `convex/lib/reminders.ts`:

```ts
function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function atNine(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 9, 0, 0, 0);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days, 0, 0, 0, 0);
}

export function computeReminderFireAt(dueAt: Date, now: Date): Date {
  const dueDay = startOfDay(dueAt);
  const today = startOfDay(now);
  const preferred = atNine(addDays(dueDay, -3));
  if (preferred.getTime() > now.getTime()) {
    return preferred;
  }
  const dueNine = atNine(dueDay);
  if (today.getTime() > dueDay.getTime()) {
    return now;
  }
  if (today.getTime() === dueDay.getTime()) {
    return dueNine.getTime() > now.getTime() ? dueNine : now;
  }
  if (dueNine.getTime() > now.getTime()) {
    return dueNine;
  }
  return now;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --watchAll=false tests/reminders-test.ts`

Expected: PASS.

If the “due today at 08:00” case fails, do not weaken the test; adjust the function until it matches the comments above.

- [ ] **Step 5: Commit**

```powershell
git add convex/lib/reminders.ts tests/reminders-test.ts
git commit -m "test: default reminder is 3 days before 09:00"
```

---

### Task 3: Workflow unlock helpers

**Files:**
- Create: `convex/lib/workflows.ts`
- Create: `tests/workflows-test.ts`

**Interfaces:**
- Consumes: none
- Produces:

```ts
export type StepStatus = 'open' | 'done' | 'snoozed';
export type StepState = { index: number; status: StepStatus };
export function isWorkflowStepReady(steps: StepState[], index: number): boolean;
export function shouldFireReminderForStep(steps: StepState[], index: number): boolean;
```

Ready means previous index is `done` (index 0 has no previous) and this step is not `done`. `snoozed` does not unlock the next step. Reminders fire only for ready open/snoozed steps (unlocked, not done). Locked steps never fire.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --watchAll=false tests/workflows-test.ts`

Expected: FAIL module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --watchAll=false tests/workflows-test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add convex/lib/workflows.ts tests/workflows-test.ts
git commit -m "test: lock workflow steps until the previous is done"
```

---

### Task 4: Agenda grouping and accept planner

**Files:**
- Create: `convex/lib/agenda.ts`
- Create: `convex/lib/accept.ts`
- Create: `tests/agenda-test.ts`
- Create: `tests/accept-test.ts`

**Interfaces:**
- Consumes: `ExtractionResult` from `convex/lib/extraction.ts`; `computeReminderFireAt` from `convex/lib/reminders.ts`
- Produces:

```ts
export type AgendaItem =
  | {
      kind: 'task';
      taskId: string;
      documentId: string;
      title: string;
      dueAt?: number;
      amount?: number;
      currency?: string;
      sourceName: string;
      urgency: 'dueSoon' | 'open';
    }
  | {
      kind: 'workflow';
      workflowId: string;
      documentId: string;
      title: string;
      dueAt?: number;
      sourceName: string;
      doneCount: number;
      totalCount: number;
      currentIndex: number;
      urgency: 'dueSoon' | 'open';
    };

export function buildAgendaItems(input: {
  now: number;
  documents: { _id: string; title: string }[];
  tasks: {
    _id: string;
    documentId: string;
    workflowId?: string;
    title: string;
    status: 'open' | 'done' | 'snoozed';
    dueAt?: number;
    amount?: number;
    currency?: string;
  }[];
  workflows: { _id: string; documentId: string; title: string; dueAt?: number; status: 'open' | 'done' }[];
  steps: { workflowId: string; taskId: string; index: number }[];
}): AgendaItem[];

export type PlannedAccept = {
  createWorkflow: boolean;
  workflowTitle: string;
  workflowDueAt?: number;
  tasks: {
    title: string;
    dueAt?: number;
    amount?: number;
    currency?: string;
    sourceQuote?: string;
    sourcePage?: number;
    sortOrder: number;
    afterIndex: number | null;
  }[];
};

export function planAcceptSuggestions(
  extraction: ExtractionResult,
  selectedIndexes: number[],
): PlannedAccept;
```

`buildAgendaItems` omits `done` tasks and `done` workflows. Tasks with `workflowId` do not appear as their own rows; the workflow row uses `currentIndex` = lowest index whose task is not done (or last if all done — those workflows are omitted). `urgency` is `dueSoon` when `dueAt` is within 3 days of `now`.

`planAcceptSuggestions` keeps selected tasks in original order. `createWorkflow` is true when two or more selected tasks remain AND at least one selected task has `afterIndex` pointing at another **selected** task. A single selected task never creates a workflow, even if `afterIndex` was set.

- [ ] **Step 1: Write failing tests**

`tests/agenda-test.ts`:

```ts
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
```

`tests/accept-test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --watchAll=false tests/agenda-test.ts tests/accept-test.ts`

Expected: FAIL module not found.

- [ ] **Step 3: Implement `convex/lib/agenda.ts` and `convex/lib/accept.ts`**

`convex/lib/agenda.ts`:

```ts
export type AgendaItem =
  | {
      kind: 'task';
      taskId: string;
      documentId: string;
      title: string;
      dueAt?: number;
      amount?: number;
      currency?: string;
      sourceName: string;
      urgency: 'dueSoon' | 'open';
    }
  | {
      kind: 'workflow';
      workflowId: string;
      documentId: string;
      title: string;
      dueAt?: number;
      sourceName: string;
      doneCount: number;
      totalCount: number;
      currentIndex: number;
      urgency: 'dueSoon' | 'open';
    };

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function urgency(dueAt: number | undefined, now: number): 'dueSoon' | 'open' {
  if (dueAt === undefined) return 'open';
  return dueAt - now <= THREE_DAYS_MS ? 'dueSoon' : 'open';
}

export function buildAgendaItems(input: {
  now: number;
  documents: { _id: string; title: string }[];
  tasks: {
    _id: string;
    documentId: string;
    workflowId?: string;
    title: string;
    status: 'open' | 'done' | 'snoozed';
    dueAt?: number;
    amount?: number;
    currency?: string;
  }[];
  workflows: {
    _id: string;
    documentId: string;
    title: string;
    dueAt?: number;
    status: 'open' | 'done';
  }[];
  steps: { workflowId: string; taskId: string; index: number }[];
}): AgendaItem[] {
  const docs = new Map(input.documents.map((doc) => [doc._id, doc.title]));
  const items: AgendaItem[] = [];
  for (const workflow of input.workflows) {
    if (workflow.status === 'done') continue;
    const workflowSteps = input.steps
      .filter((step) => step.workflowId === workflow._id)
      .sort((a, b) => a.index - b.index);
    const stepTasks = workflowSteps.map((step) => input.tasks.find((task) => task._id === step.taskId));
    const doneCount = stepTasks.filter((task) => task?.status === 'done').length;
    if (doneCount === workflowSteps.length && workflowSteps.length > 0) continue;
    const current = workflowSteps.find((step, i) => stepTasks[i]?.status !== 'done');
    const dueAt = workflow.dueAt;
    items.push({
      kind: 'workflow',
      workflowId: workflow._id,
      documentId: workflow.documentId,
      title: workflow.title,
      dueAt,
      sourceName: docs.get(workflow.documentId) ?? '',
      doneCount,
      totalCount: workflowSteps.length,
      currentIndex: current?.index ?? 0,
      urgency: urgency(dueAt, input.now),
    });
  }
  for (const task of input.tasks) {
    if (task.workflowId) continue;
    if (task.status === 'done') continue;
    items.push({
      kind: 'task',
      taskId: task._id,
      documentId: task.documentId,
      title: task.title,
      dueAt: task.dueAt,
      amount: task.amount,
      currency: task.currency,
      sourceName: docs.get(task.documentId) ?? '',
      urgency: urgency(task.dueAt, input.now),
    });
  }
  return items.sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER));
}
```

`convex/lib/accept.ts`:

```ts
import { ExtractionResult } from './extraction';

export type PlannedAcceptTask = {
  title: string;
  dueAt?: number;
  amount?: number;
  currency?: string;
  sourceQuote?: string;
  sourcePage?: number;
  sortOrder: number;
  afterIndex: number | null;
};

export type PlannedAccept = {
  createWorkflow: boolean;
  workflowTitle: string;
  workflowDueAt?: number;
  tasks: PlannedAcceptTask[];
};

function dateOnlyToUtcNoon(value?: string): number | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0).getTime();
}

export function planAcceptSuggestions(
  extraction: ExtractionResult,
  selectedIndexes: number[],
): PlannedAccept {
  const unique = [...new Set(selectedIndexes)].filter(
    (index) => index >= 0 && index < extraction.tasks.length,
  );
  unique.sort((a, b) => a - b);
  const selected = new Set(unique);
  const tasks: PlannedAcceptTask[] = unique.map((index, sortOrder) => {
    const task = extraction.tasks[index];
    const afterIndex =
      task.afterIndex !== null && selected.has(task.afterIndex)
        ? unique.indexOf(task.afterIndex)
        : null;
    return {
      title: task.title,
      dueAt: dateOnlyToUtcNoon(task.dueAt) ?? dateOnlyToUtcNoon(extraction.fields.dueAt),
      amount: task.amount ?? extraction.fields.amount,
      currency: extraction.fields.currency,
      sourceQuote: task.sourceQuote,
      sourcePage: task.sourcePage,
      sortOrder,
      afterIndex,
    };
  });
  const createWorkflow = tasks.length >= 2 && tasks.some((task) => task.afterIndex !== null);
  const workflowDueAt = tasks
    .map((task) => task.dueAt)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => b - a)[0];
  return {
    createWorkflow,
    workflowTitle: extraction.title,
    workflowDueAt,
    tasks,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --watchAll=false tests/agenda-test.ts tests/accept-test.ts tests/extraction-test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add convex/lib/agenda.ts convex/lib/accept.ts tests/agenda-test.ts tests/accept-test.ts
git commit -m "test: group workflows and plan accepted suggestions"
```

---

### Task 5: Convex schema and document/task mutations

**Files:**
- Create: `convex/schema.ts`
- Create: `convex/documents.ts`
- Create: `convex/tasks.ts`
- Create: `convex/workflows.ts`
- Create: `convex/reminders.ts`
- Create: `src/lib/api.ts`

**Interfaces:**
- Consumes: `parseExtractionJson` is not used here; `planAcceptSuggestions`, `computeReminderFireAt`, `isWorkflowStepReady`, `shouldFireReminderForStep`, `buildAgendaItems`
- Produces Convex functions (names must match later UI):

```
api.documents.generateUploadUrl() -> string
api.documents.create({ storageId, fileName, mimeType, kindHint }) -> Id<"documents">
api.documents.get({ documentId })
api.documents.list({ kind?, search? })
api.documents.setFailed({ documentId, errorMessage })
api.documents.saveExtraction({ documentId, rawJson }) -> { ok: boolean }
api.documents.acceptSuggestions({ documentId, selectedIndexes }) -> { workflowId?: Id<"workflows"> }
api.tasks.get({ taskId })
api.tasks.listByDocument({ documentId })
api.tasks.complete({ taskId })
api.tasks.agenda({})
api.workflows.get({ workflowId })
api.workflows.completeStep({ workflowId, stepIndex })
api.reminders.list({})
api.reminders.snooze({ reminderId })
```

`saveExtraction` parses with `parseExtractionJson`, writes fields onto the document, stores `suggestionJson` as the parsed object, sets `status` to `"ready"`, and returns `{ ok: true }`. On a parse error it must **not** rethrow — Convex mutations are transactional, so throwing would roll back the `"failed"` patch. Instead patch `"failed"` + `errorMessage` and return `{ ok: false }`, so Task 6 can never report success for a failed parse.

`acceptSuggestions` loads `suggestionJson`, runs `planAcceptSuggestions`, inserts tasks, optional workflow + steps, and a `reminders` row for **every** dated task using `computeReminderFireAt(new Date(dueAt), new Date())`, including steps that are still locked at accept time. Locked steps still never fire: `reminders.list` marks them `locked`, Task 12 lists them under `Later` as `Starts after step N`, and `syncLocalReminders` skips locked rows. Skipping the insert instead would make `reminders.list`'s `locked` flag and Task 12's locked copy unreachable.

`completeTask` is a shared helper exported from `convex/lib/completeTask.ts` and called by both `convex/tasks.ts` and `convex/workflows.ts` — do not copy it into each module.

Do not add a conflicts table.

- [ ] **Step 1: Install Convex**

```powershell
npm install convex
```

Run `npx convex dev` once to log in, create a project, and generate `convex/_generated`. Leave it running in another terminal for later tasks. Never commit API keys. `EXPO_PUBLIC_CONVEX_URL` will be written to `.env.local` by Convex; keep `.env.local` gitignored (Expo already ignores `.env*.local`).

- [ ] **Step 2: Write schema**

`convex/schema.ts`:

```ts
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const kind = v.union(
  v.literal('document'),
  v.literal('receipt'),
  v.literal('bill'),
  v.literal('form'),
  v.literal('notice'),
);

const docStatus = v.union(
  v.literal('uploading'),
  v.literal('extracting'),
  v.literal('ready'),
  v.literal('failed'),
);

const taskStatus = v.union(v.literal('open'), v.literal('done'), v.literal('snoozed'));

export default defineSchema({
  documents: defineTable({
    storageId: v.id('_storage'),
    createdAt: v.number(),
    title: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    kind: kind,
    status: docStatus,
    rawText: v.optional(v.string()),
    pageCount: v.optional(v.number()),
    fields: v.optional(
      v.object({
        amount: v.optional(v.number()),
        currency: v.optional(v.string()),
        dueAt: v.optional(v.string()),
        accountNo: v.optional(v.string()),
        referenceNo: v.optional(v.string()),
      }),
    ),
    suggestionJson: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  }).searchIndex('search_title', { searchField: 'title' }),
  tasks: defineTable({
    documentId: v.id('documents'),
    workflowId: v.optional(v.id('workflows')),
    title: v.string(),
    status: taskStatus,
    dueAt: v.optional(v.number()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    referenceNo: v.optional(v.string()),
    sourceQuote: v.optional(v.string()),
    sourcePage: v.optional(v.number()),
    boundingBox: v.optional(
      v.object({
        x: v.number(),
        y: v.number(),
        width: v.number(),
        height: v.number(),
      }),
    ),
    sortOrder: v.number(),
  }).index('by_document', ['documentId']).index('by_workflow', ['workflowId']),
  workflows: defineTable({
    title: v.string(),
    documentId: v.id('documents'),
    dueAt: v.optional(v.number()),
    status: v.union(v.literal('open'), v.literal('done')),
  }).index('by_document', ['documentId']),
  workflowSteps: defineTable({
    workflowId: v.id('workflows'),
    taskId: v.id('tasks'),
    index: v.number(),
    blockedByStepIndex: v.optional(v.number()),
  }).index('by_workflow', ['workflowId']).index('by_task', ['taskId']),
  reminders: defineTable({
    taskId: v.id('tasks'),
    fireAt: v.number(),
    kind: v.union(v.literal('default'), v.literal('snooze')),
    status: v.union(v.literal('scheduled'), v.literal('fired'), v.literal('cancelled')),
  }).index('by_task', ['taskId']).index('by_status_fireAt', ['status', 'fireAt']),
});
```

- [ ] **Step 3: Implement mutations/queries**

`src/lib/api.ts`:

```ts
export { api } from '../../convex/_generated/api';
```

Implement `convex/documents.ts` with `generateUploadUrl`, `create` (status `extracting`, title = fileName, kind = kindHint ?? `'document'`), `get` (include `url: await ctx.storage.getUrl(doc.storageId)`), `list` (newest `createdAt` desc; if `kind` filter equality; if `search` use search index or case-insensitive `title`/`fileName` includes), `setFailed`, `saveExtraction`, `acceptSuggestions`.

`saveExtraction` handler:

```ts
const parsed = parseExtractionJson(args.rawJson);
await ctx.db.patch(args.documentId, {
  title: parsed.title,
  kind: parsed.kind,
  rawText: parsed.rawText,
  pageCount: parsed.pageCount,
  fields: parsed.fields,
  suggestionJson: JSON.stringify(parsed),
  status: 'ready',
  errorMessage: undefined,
});
```

`acceptSuggestions`: if `suggestionJson` missing throw. `planAcceptSuggestions(JSON.parse(suggestionJson) as ExtractionResult, args.selectedIndexes)` — parse with `parseExtractionJson(doc.suggestionJson)` instead of raw JSON.parse so validation stays in one place.

Insert workflow first if `plan.createWorkflow`. Then insert each task with `workflowId` set when workflow exists. Then insert `workflowSteps` with `blockedByStepIndex: index === 0 ? undefined : index - 1`. Then for each task with `dueAt`, compute steps state from planned statuses (all `open`) and skip reminder if workflow exists and `shouldFireReminderForStep` is false. Reminder `fireAt: computeReminderFireAt(new Date(task.dueAt), new Date()).getTime()`.

`convex/tasks.ts` `agenda` query loads all tables and returns `buildAgendaItems`. `complete` sets task `done`, cancels scheduled reminders for that task, and if the task belongs to a workflow whose steps are all done, patch workflow `done`.

`convex/workflows.ts` `get` returns workflow, steps (with task docs), and originating document url. `completeStep` uses `isWorkflowStepReady`; if false throw `"Step is locked"`. Otherwise call the same complete-task path.

`convex/reminders.ts` `list` joins task + document + step lock flag (`!shouldFireReminderForStep`). `snooze` sets task `snoozed`, cancels current scheduled reminder, inserts a new reminder `kind: 'snooze'` with `fireAt` = next calendar day 09:00 after `now` via `atNine(addDays(startOfDay(now), 1))` — export a `snoozeFireAt(now: Date): Date` from `convex/lib/reminders.ts` and add one Jest test in this task before using it.

- [ ] **Step 4: Add snooze helper test then implement**

Append to `tests/reminders-test.ts`:

```ts
import { snoozeFireAt } from '../convex/lib/reminders';

test('snooze is next local 09:00', () => {
  expect(snoozeFireAt(at(2026, 10, 16, 10))).toEqual(at(2026, 10, 17, 9));
  expect(snoozeFireAt(at(2026, 10, 16, 8))).toEqual(at(2026, 10, 16, 9));
});
```

Run: `npx jest --watchAll=false tests/reminders-test.ts` — FAIL then add:

```ts
export function snoozeFireAt(now: Date): Date {
  const todayNine = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
  if (todayNine.getTime() > now.getTime()) return todayNine;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);
}
```

Re-run: PASS.

- [ ] **Step 5: Typecheck Convex**

With `npx convex dev` running, save files and confirm the CLI reports success with no schema errors.

- [ ] **Step 6: Commit**

```powershell
git add convex src/lib/api.ts tests/reminders-test.ts
git commit -m "feat: add Convex schema and document task mutations"
```

Do not add `.env.local`.

---

### Task 6: Vision extract action

**Files:**
- Create: `convex/extract.ts`
- Modify: `convex/documents.ts` (optional `retry` mutation that sets status `extracting`)

**Interfaces:**
- Consumes: `parseExtractionJson`, `api.documents.saveExtraction`, `api.documents.setFailed`
- Produces: `api.extract.run({ documentId }: { documentId: Id<"documents"> }): Promise<{ ok: boolean }>`

The client never calls Anthropic. Action runs on Convex `"use node"` if required for `Buffer`; Convex default runtime can `fetch` + `arrayBuffer`. Use the default Convex runtime unless the CLI requires node.

Steps in the action:

1. `ctx.runQuery` document by id (add `documents.getInternal` query without URL if needed, or reuse `get`).
2. `const blob = await ctx.storage.get(document.storageId)` — if the generated API is `ctx.storage.get(storageId)` returning Blob, use it; otherwise `getUrl` + `fetch`.
3. Convert to base64.
4. `fetch('https://api.anthropic.com/v1/messages', { ... })` with `process.env.ANTHROPIC_API_KEY`, header `anthropic-version: 2023-06-01`, model `claude-sonnet-4-5` if the key’s account supports it, otherwise `claude-sonnet-4-0`. Media type from `document.mimeType`. If mime is `application/pdf`, send a document block `{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }`. If image, `{ type: "image", source: { type: "base64", media_type, data } }`.
5. User text: ask for JSON only matching the spec contract. Include `kind` chip: `document.kind`.
6. Read `content[0].text`, `saveExtraction`. On any throw `setFailed`.

Prompt (embed verbatim in the action):

```
Return JSON only, no markdown. Shape:
{"title": string, "kind": "document"|"receipt"|"bill"|"form"|"notice", "pageCount": number, "fields": {"amount"?: number, "currency"?: string, "dueAt"?: "YYYY-MM-DD", "accountNo"?: string, "referenceNo"?: string}, "rawText": string, "tasks": [{"title": string, "amount"?: number, "dueAt"?: "YYYY-MM-DD", "sourceQuote"?: string, "sourcePage"?: number, "afterIndex": number|null}]}
afterIndex points at another task in this array or null. Use PHP and Philippine bill/form conventions when obvious. Kind hint: ${kind}.
```

- [ ] **Step 1: Set Convex env**

```powershell
npx convex env set ANTHROPIC_API_KEY <the-key>
```

Do not write the key into any repo file.

- [ ] **Step 2: Implement `convex/extract.ts`** using the contract above. `handler` must try/catch and always `setFailed` with `error.message` on failure, then return `{ ok: false }`. On success return the mutation's own verdict — `{ ok: (await ctx.runMutation(api.documents.saveExtraction, { documentId, rawJson })).ok }` — so a parse failure inside `saveExtraction` is never reported as success.

- [ ] **Step 3: Manual action smoke (optional if no key yet)**

If no Anthropic key is available, keep the action throwing a clear `"ANTHROPIC_API_KEY is not set"` after `setFailed`, and continue. Do not stub fake tasks in production code.

- [ ] **Step 4: Commit**

```powershell
git add convex/extract.ts convex/documents.ts
git commit -m "feat: extract tasks from stored documents with Claude"
```

---

### Task 7: Expo shell, tabs, and Convex provider

**Files:**
- Modify: `src/app/_layout.tsx`
- Create: `src/app/(tabs)/_layout.tsx`
- Create: `src/app/(tabs)/index.tsx`
- Create: `src/app/(tabs)/tasks.tsx`
- Create: `src/app/(tabs)/vault.tsx`
- Create: `src/app/(tabs)/reminders.tsx`
- Create: `src/app/scan.tsx`
- Create: `src/app/review/[documentId].tsx`
- Create: `src/app/task/[taskId].tsx`
- Create: `src/app/workflow/[workflowId].tsx`
- Create: `src/app/document/[documentId].tsx`
- Modify: `src/components/app-tabs.tsx`
- Modify: `src/components/app-tabs.web.tsx`
- Delete: `src/app/explore.tsx`, `src/app/index.tsx` (moved under `(tabs)`)

**Interfaces:**
- Consumes: `ConvexProvider`, `ConvexReactClient` from `convex/react` with `unsavedChangesWarning: false` and `process.env.EXPO_PUBLIC_CONVEX_URL`
- Produces: routes `/`, `/tasks`, `/vault`, `/reminders`, `/scan`, `/review/[documentId]`, `/task/[taskId]`, `/workflow/[workflowId]`, `/document/[documentId]`

Root layout is a Stack: `(tabs)` plus modal `scan` (`presentation: 'modal'`) and stack screens for review/task/workflow/document.

Native tab triggers (labels exactly): Today, Tasks, Vault, Reminders. File names: `index`, `tasks`, `vault`, `reminders`.

Placeholder screens render `ThemedText` with those titles so navigation can be verified before data.

- [ ] **Step 1: Install convex react (already in `convex` package)**

Confirm `convex/react` import works. No extra package if `convex` is already installed.

- [ ] **Step 2: Replace `_layout.tsx`**

```tsx
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ConvexProvider client={convex}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="scan" options={{ title: 'Scan document', presentation: 'modal' }} />
          <Stack.Screen name="review/[documentId]" options={{ title: 'Review extracted tasks' }} />
          <Stack.Screen name="task/[taskId]" options={{ title: 'Task' }} />
          <Stack.Screen name="workflow/[workflowId]" options={{ title: 'Workflow' }} />
          <Stack.Screen name="document/[documentId]" options={{ title: 'Document' }} />
        </Stack>
      </ThemeProvider>
    </ConvexProvider>
  );
}
```

If `EXPO_PUBLIC_CONVEX_URL` is missing, still construct the client with `''` and show a `ThemedText` “Set EXPO_PUBLIC_CONVEX_URL” instead of crashing — check `if (!process.env.EXPO_PUBLIC_CONVEX_URL)` before `ConvexReactClient`.

- [ ] **Step 3: Tabs layout + placeholders + rewrite `app-tabs.tsx`**

`(tabs)/_layout.tsx` returns `<AppTabs />` like the old root.

`app-tabs.tsx` triggers:

- `name="index"` label `Today`
- `name="tasks"` label `Tasks`
- `name="vault"` label `Vault`
- `name="reminders"` label `Reminders`

Reuse existing tab icons (`home.png` for Today, `explore.png` for Vault) or `expo-symbols` if adding new PNGs is slow. Web `app-tabs.web.tsx` must use the same four `TabTrigger` hrefs: `/`, `/tasks`, `/vault`, `/reminders`.

Placeholder each tab screen: SafeAreaView + title.

- [ ] **Step 4: Manual nav check**

Run: `npx expo start`

Expected: four tabs; Scan route exists even if unlinked (`/scan` can be opened). `explore` route 404s.

- [ ] **Step 5: Commit**

```powershell
git add src/app src/components/app-tabs.tsx src/components/app-tabs.web.tsx
git commit -m "feat: replace starter tabs with Today Tasks Vault Reminders"
```

---

### Task 8: Scan, upload, extract, Review

**Files:**
- Create: `src/components/pictask/kind-chips.tsx`
- Create: `src/components/pictask/scan-fab.tsx`
- Modify: `src/app/scan.tsx`
- Modify: `src/app/review/[documentId].tsx`
- Modify: `src/app/(tabs)/index.tsx`, `src/app/(tabs)/vault.tsx` (FAB)
- Modify: `app.json` plugins for image picker and document picker

**Interfaces:**
- Consumes: `api.documents.generateUploadUrl`, `api.documents.create`, `api.extract.run`, `api.documents.get`, `api.documents.acceptSuggestions`
- Produces: working scan → review → accept path

Install:

```powershell
npx expo install expo-image-picker expo-document-picker expo-file-system
```

Add plugins to `app.json` `plugins` array:

```json
[
  "expo-image-picker",
  {
    "cameraPermission": "PicTask uses the camera to scan bills, receipts, and forms.",
    "photosPermission": "PicTask uses your photos to import documents."
  }
]
```

`expo-document-picker` has no required plugin. Camera + library + PDF (`application/pdf`) + images.

Scan screen UI:

- Kind chips: Document, Receipt, Bill, Form (notices can be stored later from the model; chip set matches mockup).
- Buttons: Take photo (`launchCameraAsync`), Photo library (`launchImageLibraryAsync`), Import PDF (`DocumentPicker.getDocumentAsync`).
- After a photo, show full-bleed preview and overlay `${kind} selected` (not fake OCR). Done uploads.

Upload helper in `src/lib/upload.ts`:

```ts
export async function uploadPickedFile(args: {
  uri: string;
  mimeType: string;
  generateUploadUrl: () => Promise<string>;
}): Promise<{ storageId: string }> {
  const postUrl = await args.generateUploadUrl();
  const response = await fetch(args.uri);
  const blob = await response.blob();
  const result = await fetch(postUrl, {
    method: 'POST',
    headers: { 'Content-Type': args.mimeType },
    body: blob,
  });
  if (!result.ok) {
    throw new Error('Upload failed');
  }
  return result.json();
}
```

On upload failure: Alert `Could not upload. Check your connection.` Do not call `create`.

On success: `create` then `router.replace(`/review/${id}`)` then `extract.run({ documentId })` (void; Review watches query).

Review screen:

- `useQuery(api.documents.get, { documentId })`.
- status `extracting`: show fileName + “Extracting…”.
- `failed`: errorMessage + Retry button calling `extract.run` again after `documents.retry` sets extracting.
- `ready`: show details (amount, due, account), suggested tasks with source quote, toggle to drop a suggestion (default all selected), primary button `Add N tasks to PicTask` calling `acceptSuggestions` then `router.replace('/')`.

`kind-chips.tsx` is a horizontal row of four pressable labels; selected chip uses `backgroundSelected`.

`scan-fab.tsx`: absolute bottom-right `Pressable` label `Scan` routing `router.push('/scan')`. Place on Today and Vault.

- [ ] **Step 1: Install pickers and add plugins**

- [ ] **Step 2: Implement upload helper, chips, FAB, scan, review as specified**

- [ ] **Step 3: Manual demo**

On a phone in Expo Go: take a photo of a bill → Review shows quote and amount → Add tasks → lands on Today (list still empty until Task 9 if agenda query unused — Today should already `useQuery(api.tasks.agenda)` if Task 9 is not done; **wire agenda on Today in this task** so the happy path is visible).

Minimum Today in this task: map agenda items to `ThemedText` titles (pretty cards in Task 9).

- [ ] **Step 4: Commit**

```powershell
git add app.json src/app src/components/pictask src/lib/upload.ts package.json package-lock.json
git commit -m "feat: scan documents and review extracted tasks"
```

---

### Task 9: Today, Tasks, task detail, source quote

**Files:**
- Create: `src/components/pictask/agenda-card.tsx`
- Create: `src/lib/format.ts`
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/app/(tabs)/tasks.tsx`
- Modify: `src/app/task/[taskId].tsx`
- Modify: `src/app/workflow/[workflowId].tsx` (read-only list if complete-step waits for Task 10)

**Interfaces:**
- Consumes: `api.tasks.agenda`, `api.tasks.get`, `api.documents.get`
- Produces: mockup-like cards and source-linked task detail

`formatPeso(amount?: number, currency?: string)`: if currency is `PHP` or missing with a number, `₱` + two decimals with thousands separators (`₱3,482.50`). `formatDue(ms?: number)`: `Due Oct 17` using `en-PH` month short + day.

Today:

- Header `PicTask`
- Subheader formatted `Wednesday, October 14` style via `toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })`
- `N tasks need attention` where N = agenda length
- Section `Due soon` + `See all` linking `/tasks`
- Cards: title, `In 3 days` or `Workflow`, due line, sourceName
- No conflict banner
- Scan FAB

Tasks tab: same cards, all agenda items, tap task → `/task/id`, tap workflow → `/workflow/id`.

Task detail: image via document URL (`expo-image`), title, amount, due, `Source · fileName, p.N`, quote in quotes. Mark done button calling `tasks.complete`.

- [ ] **Step 1: Implement format helpers with a small test**

`tests/format-test.ts`:

```ts
import { formatPeso } from '../src/lib/format';

test('formats PHP', () => {
  expect(formatPeso(3482.5, 'PHP')).toBe('₱3,482.50');
});
```

Run fail, implement, pass, then UI.

- [ ] **Step 2: Implement cards and screens**

- [ ] **Step 3: Manual**

Open a saved task and confirm the quote from the Meralco-style scan is visible with the image.

- [ ] **Step 4: Commit**

```powershell
git add src/components/pictask/agenda-card.tsx src/lib/format.ts src/app tests/format-test.ts
git commit -m "feat: show source-quoted tasks on Today and Tasks"
```

---

### Task 10: Workflow detail complete/unlock

**Files:**
- Modify: `src/app/workflow/[workflowId].tsx`
- Modify: `convex/workflows.ts` if completeStep is incomplete

**Interfaces:**
- Consumes: `api.workflows.get`, `api.workflows.completeStep`
- Produces: 1 of N header, done / ready / waiting copy, Open form → `/document/[id]` of the step’s `documentId` (originating doc is fine for demo)

Locked steps: show `Waiting on step N`, no complete button.

Ready: `Complete step` calls `completeStep`. Catch `"Step is locked"` and ignore.

When all done, header `N of N steps done` and workflow status done (mutation already patches).

- [ ] **Step 1: Implement workflow screen matching the insurance mockup structure (vertical step list)**

- [ ] **Step 2: Manual**

Accept a two-task linked extraction (Pay + Save receipt). Confirm step 2 is locked, complete step 1, step 2 unlocks, Reminders later will skip locked — verify lock copy now.

- [ ] **Step 3: Commit**

```powershell
git add src/app/workflow
git commit -m "feat: complete workflow steps in order"
```

---

### Task 11: Vault search and filters

**Files:**
- Modify: `src/app/(tabs)/vault.tsx`
- Modify: `src/app/document/[documentId].tsx`
- Modify: `convex/documents.ts` `list` if filters missing

**Interfaces:**
- Consumes: `api.documents.list({ kind?: DocumentKind, search?: string })`
- Produces: chips All / Bills / Receipts / Forms / Notices, search box, newest sort, cards with type · date · amount or linked-task count · status

Status copy:

- `failed` → `Failed`
- `extracting` → `Extracting`
- has open tasks with dueAt → `Due {date}`
- all related tasks done → `Paid` if kind `bill`, else `Saved`
- workflow in progress → `{n} linked tasks` `In progress`

Document detail: image/PDF note (`PDF saved` if mime is pdf; Expo Go may not render PDF pages — show filename and `Open` via `expo-web-browser` / sharing the storage URL), list of tasks.

Scan FAB on Vault.

- [ ] **Step 1: Implement list UI and document detail**

- [ ] **Step 2: Manual**

Search `Meralco`, filter Bills, open document, see tasks.

- [ ] **Step 3: Commit**

```powershell
git add src/app/(tabs)/vault.tsx src/app/document convex/documents.ts
git commit -m "feat: search and filter the document vault"
```

---

### Task 12: Reminders UI and local notifications

**Files:**
- Create: `src/lib/notifications.ts`
- Modify: `src/app/(tabs)/reminders.tsx`
- Modify: `src/app/_layout.tsx` (notification handler)
- Modify: `app.json` plugins

**Interfaces:**
- Consumes: `api.reminders.list`, `api.reminders.snooze`, `api.tasks.complete`
- Produces: Next up, This week, Later; snooze; mark done; permission line; local schedules

Install:

```powershell
npx expo install expo-notifications expo-device
```

`expo-device` is already in `package.json`. Add plugin `"expo-notifications"` to `app.json` plugins.

In `_layout.tsx` (module scope):

```ts
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
```

`src/lib/notifications.ts`:

```ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function syncLocalReminders(
  items: { taskId: string; title: string; fireAt: number; locked: boolean }[],
): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  for (const item of items) {
    if (item.locked) continue;
    if (item.fireAt <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'PicTask', body: item.title },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(item.fireAt) },
    });
  }
}
```

If the SDK 58 trigger type name differs, read `https://docs.expo.dev/versions/v58.0.0/sdk/notifications/` and use the documented `NotificationTriggerInput` for a one-shot date. Do not use push tokens (unavailable in Expo Go on Android SDK 53+).

Reminders screen groups:

- `locked` → Later with copy `Starts after step {n}` (n = blockedByStepIndex + 1)
- `fireAt` within next 7 days and not locked → This week
- earliest not locked scheduled → Next up with Snooze + Mark as done
- rest → Later

Footer always shows `Default reminder` `3 days before · 9:00 AM`.

If permission is false, one line: `Enable notifications to get due-date alerts.` Do not block snooze/done.

Call `syncLocalReminders` from Reminders screen `useEffect` when the query result changes.

- [ ] **Step 1: Write a unit test that locked items are excluded from sync input construction**

Add `convex/lib/reminderGroups.ts`:

```ts
export type ReminderRow = {
  reminderId: string;
  taskId: string;
  title: string;
  fireAt: number;
  locked: boolean;
  blockedByStepIndex?: number;
  amount?: number;
  currency?: string;
};

export function groupReminders(rows: ReminderRow[], now: number) {
  const unlocked = rows.filter((row) => !row.locked && row.fireAt >= now);
  const nextUp = [...unlocked].sort((a, b) => a.fireAt - b.fireAt)[0];
  const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
  const thisWeek = unlocked.filter(
    (row) => row.reminderId !== nextUp?.reminderId && row.fireAt <= weekEnd,
  );
  const later = rows.filter((row) => row !== nextUp && !thisWeek.includes(row));
  return { nextUp, thisWeek, later };
}
```

Test: locked insurance step appears only in `later`, not `nextUp`.

- [ ] **Step 2: Implement grouping, screen, permission, sync**

- [ ] **Step 3: Manual on a physical device**

Create a task due in 4+ days, confirm a scheduled local notification exists (or due-today fires permission + next-up). Deny permission once and confirm tasks still save.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/notifications.ts src/app/(tabs)/reminders.tsx src/app/_layout.tsx app.json convex/lib/reminderGroups.ts tests package.json package-lock.json
git commit -m "feat: schedule local reminders and skip locked steps"
```

---

### Task 13: Lint, typecheck, demo script

**Files:**
- Modify: none required unless lint fails
- Create: `docs/superpowers/plans/pictask-demo-script.md` only if you want a short checklist; prefer putting the script in this plan’s footer and skip extra docs (YAGNI). **Do not create extra markdown.** Use this task only to run verification.

- [ ] **Step 1: Run `npx jest --watchAll=false`**

Expected: all unit tests PASS.

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: no errors.

- [ ] **Step 3: Run `npx expo lint`**

Expected: no errors. Fix any issues in the files you touched.

- [ ] **Step 4: Manual demo script**

1. Expo Go, Today → Scan → photo of a bill.
2. Review shows amount, due date, source quote.
3. Add tasks (include a linked “after” task if the model provided one; otherwise add two suggestions).
4. Today shows the card; Tasks shows it; Vault lists the document; open task to see quote + image.
5. If a workflow exists, step 2 is locked until step 1 is completed.
6. Reminders shows Next up and default `3 days before · 9:00 AM`.
7. Confirm there is **no** conflict banner.

- [ ] **Step 5: Commit only if lint/typecheck required code fixes**

```powershell
git add -u
git commit -m "chore: fix lint and types for PicTask demo"
```

Skip the commit if the working tree is clean.

---

## Spec coverage (self-review)

| Spec item | Task |
| --- | --- |
| Expo Go + Router + Convex + vision LLM | 5–8 |
| Keys only on Convex | 6 |
| Scan FAB, four tabs, no Scan tab | 7–8 |
| Kind chips, photo + PDF import | 8 |
| Review details, quotes, drop suggestion, add N tasks | 8 |
| Today summary, due soon, no conflict banner | 9, 13 |
| Tasks tab as full agenda | 9 |
| Workflow lock/complete | 3, 10 |
| Vault search/filters/cards | 11 |
| Reminders groups, snooze, default copy, skip locked | 2, 12 |
| Upload fail stays on Scan | 8 |
| Extract fail + retry | 6, 8 |
| Notification deny does not block save | 12 |
| Unit tests parser, fireAt, workflow | 1–3 |
| No ML Kit / bounding box UI | global |
| No fake conflicts | global, 9, 13 |
| Auth optional | skipped (no login) |

## Placeholder scan

No TBD steps. Conflict detection is intentionally absent (spec last priority / out of first build).

## Type consistency

- `DocumentKind` and schema `kind` literals match.
- Task status `'open' | 'done' | 'snoozed'` is shared.
- `parseExtractionJson` → `saveExtraction` → `planAcceptSuggestions` → inserts.
- `computeReminderFireAt` / `snoozeFireAt` / `shouldFireReminderForStep` are the only fire-time rules.
- `buildAgendaItems` powers Today and Tasks.
- Route params: `documentId`, `taskId`, `workflowId`.
