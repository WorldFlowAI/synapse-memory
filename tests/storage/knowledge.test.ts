import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import {
  insertKnowledge,
  getProjectKnowledge,
  getUnsyncedKnowledge,
  markKnowledgeSynced,
} from '../../src/storage/knowledge.js';
import { createSession } from '../../src/storage/sessions.js';
import { insertEvent } from '../../src/storage/events.js';
import type { PromotedKnowledge, Session, SessionEvent } from '../../src/types.js';

function makeKnowledge(overrides: Partial<PromotedKnowledge> = {}): PromotedKnowledge {
  return {
    knowledgeId: `k-${Math.random().toString(36).slice(2, 8)}`,
    projectPath: '/test/project',
    title: 'Default Title',
    content: 'Default content',
    knowledgeType: 'decision',
    tags: [],
    createdAt: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('knowledge storage', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
  });

  describe('insertKnowledge', () => {
    it('inserts and returns knowledge', () => {
      const knowledge = makeKnowledge({ title: 'Use Zod' });
      const result = insertKnowledge(db, knowledge);
      expect(result.title).toBe('Use Zod');
    });

    it('persists to database', () => {
      const knowledge = makeKnowledge();
      insertKnowledge(db, knowledge);

      const items = getProjectKnowledge(db, '/test/project');
      expect(items).toHaveLength(1);
      expect(items[0]?.knowledgeId).toBe(knowledge.knowledgeId);
    });

    it('stores tags as JSON', () => {
      const knowledge = makeKnowledge({ tags: ['arch', 'db'] });
      insertKnowledge(db, knowledge);

      const items = getProjectKnowledge(db, '/test/project');
      expect(items[0]?.tags).toEqual(['arch', 'db']);
    });

    it('handles optional fields with real FK references', () => {
      const session: Session = {
        sessionId: 'sess-1',
        projectPath: '/test/project',
        branch: 'main',
        startedAt: '2026-01-15T10:00:00.000Z',
        status: 'active',
      };
      createSession(db, session);

      const event: SessionEvent = {
        eventId: 'evt-1',
        sessionId: 'sess-1',
        timestamp: '2026-01-15T10:05:00.000Z',
        eventType: 'decision',
        category: 'other',
        detail: { type: 'decision', title: 'Test', rationale: 'Test' },
      };
      insertEvent(db, event);

      const knowledge = makeKnowledge({
        sessionId: 'sess-1',
        sourceEventId: 'evt-1',
      });
      insertKnowledge(db, knowledge);

      const items = getProjectKnowledge(db, '/test/project');
      expect(items[0]?.sessionId).toBe('sess-1');
      expect(items[0]?.sourceEventId).toBe('evt-1');
    });

    it('stores null for missing optional fields', () => {
      const knowledge = makeKnowledge();
      insertKnowledge(db, knowledge);

      const items = getProjectKnowledge(db, '/test/project');
      expect(items[0]?.sessionId).toBeUndefined();
      expect(items[0]?.sourceEventId).toBeUndefined();
      expect(items[0]?.syncedAt).toBeUndefined();
    });
  });

  describe('getProjectKnowledge', () => {
    it('returns items in descending creation order', () => {
      insertKnowledge(db, makeKnowledge({
        knowledgeId: 'k1',
        title: 'First',
        createdAt: '2026-01-15T09:00:00.000Z',
      }));
      insertKnowledge(db, makeKnowledge({
        knowledgeId: 'k2',
        title: 'Second',
        createdAt: '2026-01-15T10:00:00.000Z',
      }));

      const items = getProjectKnowledge(db, '/test/project');
      expect(items[0]?.title).toBe('Second');
      expect(items[1]?.title).toBe('First');
    });

    it('filters by knowledge type', () => {
      insertKnowledge(db, makeKnowledge({
        knowledgeId: 'k1',
        knowledgeType: 'decision',
        title: 'Decision',
      }));
      insertKnowledge(db, makeKnowledge({
        knowledgeId: 'k2',
        knowledgeType: 'pattern',
        title: 'Pattern',
      }));

      const decisions = getProjectKnowledge(db, '/test/project', 'decision');
      expect(decisions).toHaveLength(1);
      expect(decisions[0]?.title).toBe('Decision');
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        insertKnowledge(db, makeKnowledge({
          knowledgeId: `k${i}`,
        }));
      }

      const items = getProjectKnowledge(db, '/test/project', undefined, 3);
      expect(items).toHaveLength(3);
    });

    it('isolates by project path', () => {
      insertKnowledge(db, makeKnowledge({
        knowledgeId: 'k1',
        projectPath: '/project-a',
      }));
      insertKnowledge(db, makeKnowledge({
        knowledgeId: 'k2',
        projectPath: '/project-b',
      }));

      const items = getProjectKnowledge(db, '/project-a');
      expect(items).toHaveLength(1);
    });
  });

  describe('getUnsyncedKnowledge', () => {
    it('returns items without synced_at', () => {
      insertKnowledge(db, makeKnowledge({ knowledgeId: 'k1' }));
      insertKnowledge(db, makeKnowledge({ knowledgeId: 'k2' }));

      const unsynced = getUnsyncedKnowledge(db, '/test/project');
      expect(unsynced).toHaveLength(2);
    });

    it('excludes synced items', () => {
      insertKnowledge(db, makeKnowledge({ knowledgeId: 'k1' }));
      markKnowledgeSynced(db, 'k1', '2026-01-15T12:00:00.000Z', 'synapse-123');

      const unsynced = getUnsyncedKnowledge(db, '/test/project');
      expect(unsynced).toHaveLength(0);
    });

    it('returns in ascending creation order', () => {
      insertKnowledge(db, makeKnowledge({
        knowledgeId: 'k1',
        title: 'First',
        createdAt: '2026-01-15T09:00:00.000Z',
      }));
      insertKnowledge(db, makeKnowledge({
        knowledgeId: 'k2',
        title: 'Second',
        createdAt: '2026-01-15T10:00:00.000Z',
      }));

      const unsynced = getUnsyncedKnowledge(db, '/test/project');
      expect(unsynced[0]?.title).toBe('First');
      expect(unsynced[1]?.title).toBe('Second');
    });
  });

  describe('markKnowledgeSynced', () => {
    it('sets synced_at and synapse ID', () => {
      insertKnowledge(db, makeKnowledge({ knowledgeId: 'k1' }));
      markKnowledgeSynced(db, 'k1', '2026-01-15T12:00:00.000Z', 'synapse-456');

      const items = getProjectKnowledge(db, '/test/project');
      expect(items[0]?.syncedAt).toBe('2026-01-15T12:00:00.000Z');
      expect(items[0]?.synapseKnowledgeId).toBe('synapse-456');
    });
  });
});
