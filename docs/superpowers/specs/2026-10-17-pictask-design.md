# PicTask design spec

Date: 2026-10-17  
Status: awaiting user review  
UI source: `C:\Users\admin\Downloads\PicTask-Android-Mockup.pdf`  
Product brief: `C:\Users\admin\Downloads\PicTask_ Document to Action Application.pdf`

## Problem

People receive bills, receipts, forms, and notices, then miss deadlines or lose track of what to do. PicTask turns a scan into source-linked tasks and organized records.

The product is not a scanner with AI pasted on. The demo must show: a document in, tasks out, tap a task, see the quote (and later the page) that produced it.

## Users and demo constraint

Mobile-first Android mockup; the app is Expo (iOS and Android). First working demo is about 1–2 weeks. Stay in **Expo Go** for that window. On-device ML Kit and a development build come after the demo.

## Architecture

```
Expo Go (Expo Router)
  -> expo-image-picker / document picker
  -> Convex file storage
  -> Convex action (vision LLM)
  -> documents, tasks, workflows, reminders
  -> Today / Tasks / Vault / Reminders UI
```

| Layer | Choice | Rule |
| --- | --- | --- |
| App | Existing Expo SDK 58, Expo Router, TypeScript | Replace starter tabs; do not add a second navigation system |
| Capture | Image picker first; camera chrome matching the Scan screen | Live camera overlay is visual, not a custom native scanner |
| Backend | Convex (files, queries, mutations, actions) | LLM API keys live only in Convex env, never in the client |
| Extraction | One vision-LLM call returning strict JSON | Same action fills fields, tasks, source quotes, and step links |
| Reminders | `expo-notifications` local notifications, driven by Convex reminder records | Default: 3 days before due, 9:00 AM |
| Auth | Optional. Anonymous Convex identity is enough for the demo | Real login is a plus later; do not block features on accounts |
| Later OCR | ML Kit bounding boxes on tasks | Store `sourceQuote` now; optional `boundingBox` later |

Do not use Firebase or Supabase for this version. Do not require SQLite for the demo; Convex is source of truth.

## Information architecture (mockup)

Bottom tabs, in order: **Today**, **Tasks**, **Vault**, **Reminders**.  
**Scan** is a floating action on Today and Vault, not a tab.

The mockup PDF has six frames. The Tasks tab appears in the nav but has no frame; Tasks is a full list of open items using the same card language as Today.

### 1. Today

- Header: PicTask, current date.
- Summary: “N tasks need attention”.
- Due soon list with “See all”: title, urgency chip, due date, amount or workflow step, source file name.
- Scan FAB.
- Conflict banner (“Dates don’t match” / Review conflict) is **last priority**. Do not implement auto conflict detection until Scan, Review, workflows, Vault, and Reminders work. Omit the banner in the first build rather than shipping a fake one.

### 2. Scan document

- Full-bleed capture/preview.
- Type chips: Document, Receipt, Bill, Form. Chip is a hint to the model, user-overridable.
- Overlay of detected title when the model (or a cheap local guess) has a type, e.g. “Meralco bill detected”.
- Done confirms crop/photo and starts extraction.

PDFs: user can import a file (mockup uses `.pdf` names). Import uses a document picker and the same Review screen.

### 3. Review extracted tasks

Shown immediately after a successful extract.

- File name, “Scanned just now”, page count.
- Detected details: amount due, due date, account/ref, and other fields the model found.
- Suggested tasks, each with title, amount/due, source file + page, and a verbatim `sourceQuote`.
- Linked tasks: e.g. “Save receipt to vault” with `After: Pay Meralco bill`.
- Primary action: add the suggested tasks (mockup: “Add 2 tasks to PicTask”).
- User can drop a suggestion before save. Saving writes tasks (and a workflow if steps are linked) and the document into Vault.

### 4. Workflow detail (example: Insurance reimbursement)

- Title, “K of N steps done”, overall due.
- Ordered steps: done / ready / waiting on previous.
- Each step shows due, source document, and an action when relevant (“Open form”).
- Completing a step unlocks the next and can attach/link a vault document (receipt already saved).
- Locked steps do not get reminder notifications.

### 5. Vault

- Search over documents, tasks, and records.
- Filters: All, Bills, Receipts, Forms, Notices.
- Sort: newest (default).
- Cards: type, date, amount or linked-task count, status (due, in progress, saved, paid).
- Opening a document shows the file plus its tasks.

### 6. Reminders

- Next up: one prominent item with Snooze and Mark as done.
- This week / Later groups.
- Locked workflow steps appear as “Starts after step N”, not as firing alarms.
- Default reminder setting: 3 days before · 9:00 AM, shown on this screen and applied to new dated tasks.

### 7. Tasks tab (not in PDF)

- All open tasks, same cards as Today.
- Workflows appear as one row with step progress (as on Today: “Step 2 of 4”), not as four unrelated rows, unless the user is inside the workflow.

## Data model (Convex)

Keep tables small and independently readable.

**documents**

- `storageId`, `createdAt`, `title`, `kind` (`document` \| `receipt` \| `bill` \| `form` \| `notice`)
- `status` (`uploading` \| `extracting` \| `ready` \| `failed`)
- `rawText`, `pageCount`
- `fields`: `{ amount?, currency?, dueAt?, accountNo?, referenceNo? }`
- `errorMessage?`

**tasks**

- `documentId`, `workflowId?`, `title`, `status` (`open` \| `done` \| `snoozed`)
- `dueAt?`, `amount?`, `currency?`, `referenceNo?`
- `sourceQuote`, `sourcePage?`, `boundingBox?` (unused until ML Kit)
- `sortOrder`

**workflows**

- `title`, `documentId` (originating scan), `dueAt?`, `status` (`open` \| `done`)

**workflowSteps**

- `workflowId`, `taskId`, `index` (0-based), `blockedByStepIndex?`
- A step is ready when the previous index is `done`. The UI never lets the user complete a blocked step.

**reminders**

- `taskId`, `fireAt`, `kind` (`default` \| `snooze`)
- `status` (`scheduled` \| `fired` \| `cancelled`)
- Creating or changing a dated task upserts a default reminder: `dueAt` minus 3 days at 09:00 local, unless that instant is already past, in which case fire at next 09:00 before due, or immediately if due is today.

No `conflicts` table in the first build. When conflict detection is scheduled later: compare new `fields` to other documents with the same `accountNo` or normalized biller title; store mismatched date/amount pairs for the Today banner.

## Extraction contract

Convex action input: file in storage + optional `kind` chip.

Output JSON only:

```json
{
  "title": "Meralco bill",
  "kind": "bill",
  "pageCount": 1,
  "fields": {
    "amount": 3482.5,
    "currency": "PHP",
    "dueAt": "2026-10-17",
    "accountNo": "2208-4471-93"
  },
  "rawText": "...",
  "tasks": [
    {
      "title": "Pay Meralco bill",
      "amount": 3482.5,
      "dueAt": "2026-10-17",
      "sourceQuote": "Please pay on or before October 17, 2026.",
      "sourcePage": 1,
      "afterIndex": null
    },
    {
      "title": "Save receipt to vault",
      "afterIndex": 0
    }
  ]
}
```

`afterIndex` points at another task in the same array and creates a workflow. A single unlinked task does not create a workflow.

If the model returns unusable JSON or no tasks, `documents.status` is `failed`, the file stays in Vault, and Review offers Retry. The client never calls the LLM directly.

## Error handling

- Upload fail: stay on Scan, show retry, do not create a document.
- Extract fail: document `failed` in Vault, Review shows retry.
- Notification permission denied: still create reminder records; show a one-line prompt on Reminders. Do not block saving tasks.
- Offline: queue is out of scope for the demo; show a clear failure on upload/extract.

## Testing

- Unit-test JSON parsing and reminder `fireAt` (3 days before 09:00, past-window fallback, no fire for blocked steps).
- Unit-test workflow unlocking (step 2 stays blocked until step 1 done).
- Manual demo script: scan or import a Meralco-style bill → Review quotes and amount → add tasks → see Today and Vault → open Reminders next-up → complete a two-step “pay then save receipt” workflow.

## Priority (2-week build order)

1. Scan / import → extract → Review → save tasks and document.
2. Today + Tasks lists, task/workflow detail, source quote on the original file.
3. Vault search, kind filters, document cards.
4. Reminders (default schedule, snooze, done, skip locked steps).
5. Last: auto conflict detection and the Today conflict banner.

## Out of scope until after the demo

- Expo development build and ML Kit bounding-box highlight on the photo.
- Account password login, sharing, multi-device conflict resolution.
- Background server-side push (local notifications only).
- Fake conflict UI before the real detector exists.
