'use node';

import { v } from 'convex/values';

import { api } from './_generated/api';
import { action } from './_generated/server';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export const run = action({
  args: { documentId: v.id('documents') },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    try {
      const document = await ctx.runQuery(api.documents.get, { documentId: args.documentId });

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        await ctx.runMutation(api.documents.setFailed, {
          documentId: args.documentId,
          errorMessage: 'GEMINI_API_KEY is not set',
        });
        return { ok: false };
      }

      const blob = await ctx.storage.get(document.storageId);
      if (!blob) {
        throw new Error('Stored file not found');
      }
      const data = Buffer.from(await blob.arrayBuffer()).toString('base64');

      const prompt = `Return JSON only, no markdown. Shape:
{"title": string, "kind": "document"|"receipt"|"bill"|"form"|"notice", "pageCount": number, "fields": {"amount"?: number, "currency"?: string, "dueAt"?: "YYYY-MM-DD", "accountNo"?: string, "referenceNo"?: string}, "rawText": string, "tasks": [{"title": string, "amount"?: number, "dueAt"?: "YYYY-MM-DD", "sourceQuote"?: string, "sourcePage"?: number, "afterIndex": number|null}]}
afterIndex points at another task in this array or null. Use PHP and Philippine bill/form conventions when obvious. Kind hint: ${document.kind}.`;

      const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
      const response = await fetch(
        `${GEMINI_API_URL}/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType: document.mimeType, data } },
                ],
              },
            ],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Gemini API error ${response.status}`);
      }

      const parsed = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const rawJson = parsed.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .filter((text): text is string => Boolean(text))
        .join('');
      if (!rawJson) {
        throw new Error('Gemini response contained no text content');
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
