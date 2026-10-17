'use node';

import { v } from 'convex/values';

import { api } from './_generated/api';
import { action } from './_generated/server';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export const run = action({
  args: { documentId: v.id('documents') },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    try {
      const document = await ctx.runQuery(api.documents.get, { documentId: args.documentId });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        await ctx.runMutation(api.documents.setFailed, {
          documentId: args.documentId,
          errorMessage: 'ANTHROPIC_API_KEY is not set',
        });
        return { ok: false };
      }

      const blob = await ctx.storage.get(document.storageId);
      if (!blob) {
        throw new Error('Stored file not found');
      }
      const data = Buffer.from(await blob.arrayBuffer()).toString('base64');

      const fileBlock =
        document.mimeType === 'application/pdf'
          ? {
              type: 'document' as const,
              source: { type: 'base64' as const, media_type: 'application/pdf', data },
            }
          : {
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: document.mimeType, data },
            };

      const prompt = `Return JSON only, no markdown. Shape:
{"title": string, "kind": "document"|"receipt"|"bill"|"form"|"notice", "pageCount": number, "fields": {"amount"?: number, "currency"?: string, "dueAt"?: "YYYY-MM-DD", "accountNo"?: string, "referenceNo"?: string}, "rawText": string, "tasks": [{"title": string, "amount"?: number, "dueAt"?: "YYYY-MM-DD", "sourceQuote"?: string, "sourcePage"?: number, "afterIndex": number|null}]}
afterIndex points at another task in this array or null. Use PHP and Philippine bill/form conventions when obvious. Kind hint: ${document.kind}.`;

      const response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [fileBlock, { type: 'text', text: prompt }],
            },
          ],
        }),
      });

      const body = await response.text();
      if (!response.ok) {
        throw new Error(`Anthropic API error ${response.status}`);
      }

      const parsed = JSON.parse(body) as { content?: { text?: string }[] };
      const rawJson = parsed.content?.[0]?.text;
      if (!rawJson) {
        throw new Error('Anthropic response contained no text content');
      }

      const result = await ctx.runMutation(api.documents.saveExtraction, {
        documentId: args.documentId,
        rawJson,
      });
      return { ok: result.ok };
    } catch (error) {
      try {
        await ctx.runMutation(api.documents.setFailed, {
          documentId: args.documentId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // Recording the failure must not mask the original error.
      }
      return { ok: false };
    }
  },
});
