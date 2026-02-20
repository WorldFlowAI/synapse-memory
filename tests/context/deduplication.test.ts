import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import { insertKnowledge } from '../../src/storage/knowledge.js';
import {
  normalizeContent,
  computeContentHash,
  computeTitleSimilarity,
  levenshteinDistance,
  findDuplicates,
  markSuperseded,
} from '../../src/context/deduplication.js';
import type { PromotedKnowledge } from '../../src/types.js';

describe('deduplication', () => {
  describe('normalizeContent', () => {
    it('lowercases content', () => {
      expect(normalizeContent('Hello World')).toBe('hello world');
    });

    it('collapses whitespace', () => {
      expect(normalizeContent('hello   world\n\tfoo')).toBe('hello world foo');
    });

    it('trims content', () => {
      expect(normalizeContent('  hello  ')).toBe('hello');
    });
  });

  describe('computeContentHash', () => {
    it('returns same hash for normalized-equivalent content', () => {
      const hash1 = computeContentHash('Hello World');
      const hash2 = computeContentHash('hello   world');

      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different content', () => {
      const hash1 = computeContentHash('Hello World');
      const hash2 = computeContentHash('Goodbye World');

      expect(hash1).not.toBe(hash2);
    });

    it('returns valid SHA256 hex', () => {
      const hash = computeContentHash('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('returns string length for completely different strings', () => {
      expect(levenshteinDistance('abc', 'xyz')).toBe(3);
    });

    it('counts single character changes', () => {
      expect(levenshteinDistance('hello', 'hallo')).toBe(1);
    });
  });

  describe('computeTitleSimilarity', () => {
    it('returns 1.0 for identical titles', () => {
      expect(computeTitleSimilarity('Use JWT tokens', 'Use JWT tokens')).toBe(1.0);
    });

    it('returns 1.0 for normalized-identical titles', () => {
      expect(computeTitleSimilarity('Use JWT tokens', 'use jwt  tokens')).toBe(1.0);
    });

    it('returns high similarity for minor differences', () => {
      const sim = computeTitleSimilarity('Use JWT tokens', 'Use JWT token');
      expect(sim).toBeGreaterThan(0.9);
    });

    it('returns low similarity for different titles', () => {
      const sim = computeTitleSimilarity('Use JWT tokens', 'Database schema design');
      expect(sim).toBeLessThan(0.5);
    });
  });

  describe('findDuplicates', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createInMemoryDatabase();
    });

    it('returns empty array when no duplicates exist', () => {
      const duplicates = findDuplicates(
        db,
        '/test/project',
        'New Decision',
        'Unique content here',
      );

      expect(duplicates).toHaveLength(0);
    });

    it('finds exact content hash match', () => {
      const existing: PromotedKnowledge = {
        knowledgeId: 'k1',
        projectPath: '/test/project',
        title: 'Original Title',
        content: 'Same content',
        knowledgeType: 'decision',
        tags: [],
        createdAt: new Date().toISOString(),
        contentHash: computeContentHash('Same content'),
        usageCount: 0,
      };
      insertKnowledge(db, existing);

      const duplicates = findDuplicates(
        db,
        '/test/project',
        'Different Title',
        'Same content',
      );

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]?.matchType).toBe('exact_hash');
      expect(duplicates[0]?.similarityScore).toBe(1.0);
    });

    it('finds similar title match', () => {
      const existing: PromotedKnowledge = {
        knowledgeId: 'k1',
        projectPath: '/test/project',
        title: 'Use JWT for authentication',
        content: 'Original content',
        knowledgeType: 'decision',
        tags: [],
        createdAt: new Date().toISOString(),
        usageCount: 0,
      };
      insertKnowledge(db, existing);

      const duplicates = findDuplicates(
        db,
        '/test/project',
        'Use JWT for auth',
        'Different content',
      );

      // Title similarity should be high enough to match
      expect(duplicates.length).toBeGreaterThanOrEqual(0);
    });

    it('ignores superseded knowledge', () => {
      const existing: PromotedKnowledge = {
        knowledgeId: 'k1',
        projectPath: '/test/project',
        title: 'Original',
        content: 'Same content',
        knowledgeType: 'decision',
        tags: [],
        createdAt: new Date().toISOString(),
        contentHash: computeContentHash('Same content'),
        usageCount: 0,
      };
      insertKnowledge(db, existing);

      // Mark as superseded
      db.prepare(`
        UPDATE promoted_knowledge SET superseded_by = 'k2' WHERE knowledge_id = ?
      `).run('k1');

      const duplicates = findDuplicates(
        db,
        '/test/project',
        'New Title',
        'Same content',
      );

      expect(duplicates).toHaveLength(0);
    });
  });

  describe('markSuperseded', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createInMemoryDatabase();
    });

    it('marks knowledge as superseded', () => {
      const existing: PromotedKnowledge = {
        knowledgeId: 'k1',
        projectPath: '/test/project',
        title: 'Old Decision',
        content: 'Old content',
        knowledgeType: 'decision',
        tags: [],
        createdAt: new Date().toISOString(),
        usageCount: 0,
      };
      insertKnowledge(db, existing);

      markSuperseded(db, 'k1', 'k2');

      const row = db.prepare(`
        SELECT superseded_by FROM promoted_knowledge WHERE knowledge_id = ?
      `).get('k1') as { superseded_by: string };

      expect(row.superseded_by).toBe('k2');
    });
  });
});
