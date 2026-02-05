import { describe, expect, it } from 'vitest';
import { CategorizationSchema, SimilaritySchema, WindowNameSchema } from './ai-schemas';

describe('ai-schemas', () => {
  it('should have a valid CategorizationSchema', () => {
    expect(CategorizationSchema.type).toBe('object');
    expect(CategorizationSchema.required).toContain('suggestions');
    expect(CategorizationSchema.properties.suggestions.type).toBe('array');
  });

  it('should have a valid SimilaritySchema', () => {
    expect(SimilaritySchema.type).toBe('object');
    expect(SimilaritySchema.required).toContain('similarTabIds');
  });

  it('should have a valid WindowNameSchema', () => {
    expect(WindowNameSchema.type).toBe('object');
    expect(WindowNameSchema.required).toContain('windowName');
  });
});
