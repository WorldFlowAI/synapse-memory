import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import {
  upsertFileAccess,
  getImportantFiles,
  computeImportanceScore,
  refreshImportanceScores,
} from '../../src/storage/file-importance.js';

describe('file-importance storage', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
  });

  describe('computeImportanceScore', () => {
    it('weights edits 3x reads', () => {
      const readOnly = computeImportanceScore(10, 0, new Date().toISOString());
      const editOnly = computeImportanceScore(0, 10, new Date().toISOString());

      // editOnly should be ~3x readOnly (before recency decay)
      expect(editOnly).toBeGreaterThan(readOnly * 2.5);
    });

    it('applies recency decay', () => {
      const recent = computeImportanceScore(10, 5, new Date().toISOString());
      const weekOld = computeImportanceScore(10, 5, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      expect(recent).toBeGreaterThan(weekOld);
      // After 7 days, should be ~50% of original
      expect(weekOld / recent).toBeCloseTo(0.5, 1);
    });
  });

  describe('upsertFileAccess', () => {
    it('creates new entry on first access', () => {
      const result = upsertFileAccess(db, '/test/project', 'src/index.ts', 'read');

      expect(result.filePath).toBe('src/index.ts');
      expect(result.readCount).toBe(1);
      expect(result.editCount).toBe(0);
    });

    it('increments read count', () => {
      upsertFileAccess(db, '/test/project', 'src/index.ts', 'read');
      upsertFileAccess(db, '/test/project', 'src/index.ts', 'read');
      const result = upsertFileAccess(db, '/test/project', 'src/index.ts', 'read');

      expect(result.readCount).toBe(3);
      expect(result.editCount).toBe(0);
    });

    it('increments edit count', () => {
      upsertFileAccess(db, '/test/project', 'src/index.ts', 'edit');
      const result = upsertFileAccess(db, '/test/project', 'src/index.ts', 'edit');

      expect(result.readCount).toBe(0);
      expect(result.editCount).toBe(2);
    });

    it('computes importance score', () => {
      const result = upsertFileAccess(db, '/test/project', 'src/index.ts', 'edit');

      expect(result.importanceScore).toBeGreaterThan(0);
    });
  });

  describe('getImportantFiles', () => {
    it('returns empty array for project with no files', () => {
      const files = getImportantFiles(db, '/test/project');
      expect(files).toHaveLength(0);
    });

    it('returns files sorted by importance score', () => {
      // File with edits should rank higher
      upsertFileAccess(db, '/test/project', 'src/utils.ts', 'read');
      upsertFileAccess(db, '/test/project', 'src/utils.ts', 'read');
      upsertFileAccess(db, '/test/project', 'src/index.ts', 'edit');
      upsertFileAccess(db, '/test/project', 'src/index.ts', 'edit');
      upsertFileAccess(db, '/test/project', 'src/index.ts', 'edit');

      const files = getImportantFiles(db, '/test/project');

      expect(files).toHaveLength(2);
      expect(files[0]?.filePath).toBe('src/index.ts');
      expect(files[1]?.filePath).toBe('src/utils.ts');
    });

    it('respects limit parameter', () => {
      upsertFileAccess(db, '/test/project', 'file1.ts', 'read');
      upsertFileAccess(db, '/test/project', 'file2.ts', 'read');
      upsertFileAccess(db, '/test/project', 'file3.ts', 'read');

      const files = getImportantFiles(db, '/test/project', 2);

      expect(files).toHaveLength(2);
    });
  });

  describe('refreshImportanceScores', () => {
    it('updates scores based on current recency', () => {
      upsertFileAccess(db, '/test/project', 'src/index.ts', 'edit');

      // Manually set an old timestamp
      db.prepare(`
        UPDATE file_importance
        SET last_accessed_at = datetime('now', '-14 days')
        WHERE project_path = ? AND file_path = ?
      `).run('/test/project', 'src/index.ts');

      const updated = refreshImportanceScores(db, '/test/project');

      expect(updated).toBe(1);
    });
  });
});
