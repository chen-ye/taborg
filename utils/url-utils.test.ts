import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './url-utils';

describe('url-utils', () => {
  describe('normalizeUrl', () => {
    it('should remove search parameters', () => {
      expect(normalizeUrl('https://example.com/page?query=1&b=2')).toBe('https://example.com/page');
    });

    it('should remove hashes', () => {
      expect(normalizeUrl('https://example.com/page#section1')).toBe('https://example.com/page');
    });

    it('should handle both search and hash', () => {
      expect(normalizeUrl('https://example.com/page?q=1#hash')).toBe('https://example.com/page');
    });

    it('should add a trailing slash to the origin if missing', () => {
      // URL constructor adds trailing slash to origin
      expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
    });

    it('should return original string if URL is invalid', () => {
      expect(normalizeUrl('not-a-url')).toBe('not-a-url');
    });

    it('should handle complex URLs', () => {
      expect(normalizeUrl('https://user:pass@sub.example.co.uk:8080/path/to/file.html?q=1')).toBe('https://user:pass@sub.example.co.uk:8080/path/to/file.html');
    });
  });
});
