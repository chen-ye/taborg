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

export const WindowNameSchema = {
  type: 'object',
  properties: {
    windowName: { type: 'string' },
  },
  required: ['windowName'],
};
