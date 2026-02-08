import { z } from 'zod';

export const CategorizationSchema = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tabId: { type: 'integer' },
          groupNames: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['tabId', 'groupNames'],
      },
    },
  },
  required: ['suggestions'],
};

export const CategorizationSchemaType = z.object({
  suggestions: z.array(
    z.object({
      tabId: z.number(),
      groupNames: z.array(z.string()),
    }),
  ),
});

export const SimilaritySchema = {
  type: 'object',
  properties: {
    similarTabIds: {
      type: 'array',
      items: { type: 'integer' },
    },
  },
  required: ['similarTabIds'],
};

export const SimilaritySchemaType = z.object({
  similarTabIds: z.array(z.number()),
});

export const WindowNameSchema = {
  type: 'object',
  properties: {
    windowName: { type: 'string' },
  },
  required: ['windowName'],
};

export const WindowNameSchemaType = z.object({
  windowName: z.string(),
});
