import { z } from 'zod';
import { insertSubmissionSchema, insertOverrideSchema, submissions, overrides, documents } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  triage: {
    submit: {
      method: 'POST' as const,
      path: '/api/triage',
      input: insertSubmissionSchema.omit({ 
        riskBand: true, 
        redFlags: true, 
        summary: true, 
        rulesVersion: true, 
        modelVersion: true 
      }), // Client sends answers, server calculates result
      responses: {
        201: z.custom<typeof submissions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  submissions: {
    list: {
      method: 'GET' as const,
      path: '/api/submissions',
      responses: {
        200: z.array(z.custom<typeof submissions.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/submissions/:id',
      responses: {
        200: z.custom<typeof submissions.$inferSelect & { overrides: typeof overrides.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
    override: {
      method: 'POST' as const,
      path: '/api/submissions/:id/override',
      input: insertOverrideSchema.omit({ submissionId: true }),
      responses: {
        201: z.custom<typeof overrides.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  rag: {
    query: {
      method: 'POST' as const,
      path: '/api/rag/query',
      input: z.object({
        question: z.string(),
        submissionId: z.number().optional(), // Context from specific case
      }),
      responses: {
        200: z.object({
          answer: z.string(),
          citations: z.array(z.object({
            docId: z.number(),
            docName: z.string(),
            chunkId: z.number(),
            text: z.string(),
          })),
        }),
      },
    },
  },
  documents: {
    list: {
      method: 'GET' as const,
      path: '/api/docs',
      responses: {
        200: z.array(z.custom<typeof documents.$inferSelect>()),
      },
    },
    upload: {
      method: 'POST' as const,
      path: '/api/docs/upload',
      // Multipart form data, not JSON input schema
      responses: {
        201: z.object({ success: z.boolean(), count: z.number() }),
      },
    },
    process: { // Trigger processing/embedding manually if needed
      method: 'POST' as const,
      path: '/api/docs/:id/process',
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    }
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type TriageInput = z.infer<typeof api.triage.submit.input>;
export type SubmissionResponse = z.infer<typeof api.triage.submit.responses[201]>;
