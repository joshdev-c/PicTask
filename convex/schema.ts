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
  })
    .index('by_document', ['documentId'])
    .index('by_workflow', ['workflowId']),
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
  })
    .index('by_workflow', ['workflowId'])
    .index('by_task', ['taskId']),
  reminders: defineTable({
    taskId: v.id('tasks'),
    fireAt: v.number(),
    kind: v.union(v.literal('default'), v.literal('snooze')),
    status: v.union(v.literal('scheduled'), v.literal('fired'), v.literal('cancelled')),
  })
    .index('by_task', ['taskId'])
    .index('by_status_fireAt', ['status', 'fireAt']),
});
