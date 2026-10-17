import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { planAcceptSuggestions } from './lib/accept';
import { parseExtractionJson, type ExtractionResult } from './lib/extraction';
import { computeReminderFireAt } from './lib/reminders';

const documentKind = v.union(
  v.literal('document'),
  v.literal('receipt'),
  v.literal('bill'),
  v.literal('form'),
  v.literal('notice'),
);

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    storageId: v.id('_storage'),
    fileName: v.string(),
    mimeType: v.string(),
    kindHint: v.optional(documentKind),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('documents', {
      storageId: args.storageId,
      createdAt: Date.now(),
      title: args.fileName,
      fileName: args.fileName,
      mimeType: args.mimeType,
      kind: args.kindHint ?? 'document',
      status: 'extracting',
    });
  },
});

export const get = query({
  args: { documentId: v.id('documents') },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error('Document not found');
    return { ...document, url: await ctx.storage.getUrl(document.storageId) };
  },
});

export const list = query({
  args: { kind: v.optional(documentKind), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const documents = await ctx.db.query('documents').collect();
    const search = args.search?.trim().toLowerCase();
    return documents
      .filter((document) => {
        if (args.kind && document.kind !== args.kind) return false;
        if (!search) return true;
        return `${document.title} ${document.fileName}`.toLowerCase().includes(search);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const setFailed = mutation({
  args: { documentId: v.id('documents'), errorMessage: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      status: 'failed',
      errorMessage: args.errorMessage,
    });
  },
});

export const saveExtraction = mutation({
  args: { documentId: v.id('documents'), rawJson: v.string() },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error('Document not found');
    let parsed: ExtractionResult;
    try {
      parsed = parseExtractionJson(args.rawJson);
    } catch (error) {
      // Convex mutations are transactional, so we must not rethrow here: the
      // failed status would be rolled back with the rest of the transaction.
      // The failure is therefore reported through the return value instead.
      await ctx.db.patch(args.documentId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Extraction failed',
      });
      return { ok: false };
    }
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
    return { ok: true };
  },
});

export const acceptSuggestions = mutation({
  args: { documentId: v.id('documents'), selectedIndexes: v.array(v.number()) },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error('Document not found');
    if (!document.suggestionJson) throw new Error('Document has no extraction suggestions');
    const extraction = parseExtractionJson(document.suggestionJson);
    const plan = planAcceptSuggestions(extraction, args.selectedIndexes);

    let workflowId: Id<'workflows'> | undefined;
    if (plan.createWorkflow) {
      workflowId = await ctx.db.insert('workflows', {
        title: plan.workflowTitle,
        documentId: args.documentId,
        dueAt: plan.workflowDueAt,
        status: 'open',
      });
    }

    const taskIds: Id<'tasks'>[] = [];
    for (const task of plan.tasks) {
      const taskId = await ctx.db.insert('tasks', {
        documentId: args.documentId,
        workflowId,
        title: task.title,
        status: 'open',
        dueAt: task.dueAt,
        amount: task.amount,
        currency: task.currency,
        sourceQuote: task.sourceQuote,
        sourcePage: task.sourcePage,
        sortOrder: task.sortOrder,
      });
      taskIds.push(taskId);
    }

    if (workflowId) {
      for (let index = 0; index < taskIds.length; index += 1) {
        await ctx.db.insert('workflowSteps', {
          workflowId,
          taskId: taskIds[index],
          index,
          blockedByStepIndex: index === 0 ? undefined : index - 1,
        });
      }
    }

    const now = new Date();
    // Locked workflow steps still get a reminder row; they are prevented from
    // firing downstream because reminders.list marks them locked and the
    // Reminders screen's syncLocalReminders skips locked rows.
    for (let index = 0; index < plan.tasks.length; index += 1) {
      const dueAt = plan.tasks[index].dueAt;
      if (dueAt === undefined) continue;
      await ctx.db.insert('reminders', {
        taskId: taskIds[index],
        fireAt: computeReminderFireAt(new Date(dueAt), now).getTime(),
        kind: 'default',
        status: 'scheduled',
      });
    }

    return { workflowId };
  },
});
