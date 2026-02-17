import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import {
  createSession,
  endSession,
  abandonStaleSessions,
  getSession,
  getActiveSession,
  getRecentSessions,
  searchSessions,
  computeMetrics,
  getSessionStats,
} from '../../src/storage/sessions.js';
import { insertEvent } from '../../src/storage/events.js';
import type { Session, SessionEvent } from '../../src/types.js';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: `session-${Math.random().toString(36).slice(2, 8)}`,
    projectPath: '/test/project',
    branch: 'main',
    startedAt: '2026-01-15T10:00:00.000Z',
    status: 'active',
    ...overrides,
  };
}

function makeEvent(
  sessionId: string,
  overrides: Partial<SessionEvent> = {},
): SessionEvent {
  return {
    eventId: `event-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    timestamp: '2026-01-15T10:05:00.000Z',
    eventType: 'file_read',
    category: 'read',
    detail: { type: 'file_op', path: '/test/file.ts', operation: 'read' },
    ...overrides,
  };
}

describe('sessions', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
  });

  describe('createSession', () => {
    it('inserts a session and returns it', () => {
      const session = makeSession();
      const result = createSession(db, session);
      expect(result.sessionId).toBe(session.sessionId);
      expect(result.status).toBe('active');
    });

    it('persists to the database', () => {
      const session = makeSession();
      createSession(db, session);
      const fetched = getSession(db, session.sessionId);
      expect(fetched).toBeDefined();
      expect(fetched?.projectPath).toBe(session.projectPath);
    });
  });

  describe('endSession', () => {
    it('marks session as completed', () => {
      const session = makeSession();
      createSession(db, session);
      const ended = endSession(
        db,
        session.sessionId,
        '2026-01-15T11:00:00.000Z',
        'Did some work',
        'abc123',
      );
      expect(ended?.status).toBe('completed');
      expect(ended?.endedAt).toBe('2026-01-15T11:00:00.000Z');
      expect(ended?.summary).toBe('Did some work');
      expect(ended?.gitCommitEnd).toBe('abc123');
    });

    it('returns undefined for nonexistent session', () => {
      const result = endSession(db, 'nonexistent', '2026-01-15T11:00:00.000Z');
      expect(result).toBeUndefined();
    });

    it('does not re-end a completed session', () => {
      const session = makeSession();
      createSession(db, session);
      const first = endSession(db, session.sessionId, '2026-01-15T11:00:00.000Z', 'First');
      expect(first).toBeDefined();

      const second = endSession(db, session.sessionId, '2026-01-15T12:00:00.000Z', 'Second');
      expect(second).toBeUndefined();

      const fetched = getSession(db, session.sessionId);
      expect(fetched?.summary).toBe('First');
    });
  });

  describe('abandonStaleSessions', () => {
    it('marks active sessions as abandoned', () => {
      const s1 = makeSession({ sessionId: 's1' });
      const s2 = makeSession({ sessionId: 's2' });
      createSession(db, s1);
      createSession(db, s2);

      const count = abandonStaleSessions(db, '/test/project', '2026-01-15T11:00:00.000Z');
      expect(count).toBe(2);

      const fetched = getSession(db, 's1');
      expect(fetched?.status).toBe('abandoned');
    });

    it('does not affect other projects', () => {
      const s1 = makeSession({ projectPath: '/other/project' });
      createSession(db, s1);

      const count = abandonStaleSessions(db, '/test/project', '2026-01-15T11:00:00.000Z');
      expect(count).toBe(0);
    });
  });

  describe('getActiveSession', () => {
    it('returns the most recent active session', () => {
      const s1 = makeSession({
        sessionId: 's1',
        startedAt: '2026-01-15T09:00:00.000Z',
      });
      const s2 = makeSession({
        sessionId: 's2',
        startedAt: '2026-01-15T10:00:00.000Z',
      });
      createSession(db, s1);
      createSession(db, s2);

      const active = getActiveSession(db, '/test/project');
      expect(active?.sessionId).toBe('s2');
    });

    it('returns undefined when no active session', () => {
      const active = getActiveSession(db, '/test/project');
      expect(active).toBeUndefined();
    });
  });

  describe('getRecentSessions', () => {
    it('returns completed sessions in descending order', () => {
      const s1 = makeSession({
        sessionId: 's1',
        startedAt: '2026-01-14T10:00:00.000Z',
      });
      const s2 = makeSession({
        sessionId: 's2',
        startedAt: '2026-01-15T10:00:00.000Z',
      });
      createSession(db, s1);
      createSession(db, s2);
      endSession(db, 's1', '2026-01-14T11:00:00.000Z', 'Session 1');
      endSession(db, 's2', '2026-01-15T11:00:00.000Z', 'Session 2');

      const recent = getRecentSessions(db, '/test/project', 10);
      expect(recent).toHaveLength(2);
      expect(recent[0]?.sessionId).toBe('s2');
    });

    it('filters by branch when provided', () => {
      const s1 = makeSession({ sessionId: 's1', branch: 'main' });
      const s2 = makeSession({ sessionId: 's2', branch: 'feature' });
      createSession(db, s1);
      createSession(db, s2);
      endSession(db, 's1', '2026-01-15T11:00:00.000Z');
      endSession(db, 's2', '2026-01-15T11:00:00.000Z');

      const recent = getRecentSessions(db, '/test/project', 10, 'feature');
      expect(recent).toHaveLength(1);
      expect(recent[0]?.branch).toBe('feature');
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        const s = makeSession({
          sessionId: `s${i}`,
          startedAt: `2026-01-1${i}T10:00:00.000Z`,
        });
        createSession(db, s);
        endSession(db, `s${i}`, `2026-01-1${i}T11:00:00.000Z`);
      }

      const recent = getRecentSessions(db, '/test/project', 3);
      expect(recent).toHaveLength(3);
    });
  });

  describe('searchSessions', () => {
    it('searches by summary text', () => {
      const s1 = makeSession({ sessionId: 's1' });
      const s2 = makeSession({ sessionId: 's2' });
      createSession(db, s1);
      createSession(db, s2);
      endSession(db, 's1', '2026-01-15T11:00:00.000Z', 'Fixed authentication bug');
      endSession(db, 's2', '2026-01-15T11:00:00.000Z', 'Added new feature');

      const results = searchSessions(db, '/test/project', 'authentication');
      expect(results).toHaveLength(1);
      expect(results[0]?.summary).toContain('authentication');
    });

    it('returns all recent sessions when no query', () => {
      const s1 = makeSession({ sessionId: 's1' });
      createSession(db, s1);
      endSession(db, 's1', '2026-01-15T11:00:00.000Z', 'Some work');

      const results = searchSessions(db, '/test/project');
      expect(results).toHaveLength(1);
    });
  });

  describe('computeMetrics', () => {
    it('computes metrics from session events', () => {
      const session = makeSession({ sessionId: 'metrics-test' });
      createSession(db, session);
      endSession(db, 'metrics-test', '2026-01-15T11:00:00.000Z');

      insertEvent(db, makeEvent('metrics-test', {
        eventId: 'e1',
        eventType: 'file_read',
        category: 'read',
        detail: { type: 'file_op', path: '/a.ts', operation: 'read' },
      }));
      insertEvent(db, makeEvent('metrics-test', {
        eventId: 'e2',
        eventType: 'file_edit',
        category: 'edit',
        detail: { type: 'file_op', path: '/b.ts', operation: 'edit' },
      }));
      insertEvent(db, makeEvent('metrics-test', {
        eventId: 'e3',
        eventType: 'decision',
        category: 'other',
        detail: { type: 'decision', title: 'Use Zod', rationale: 'Type safety' },
      }));

      const metrics = computeMetrics(db, 'metrics-test');
      expect(metrics).toBeDefined();
      expect(metrics?.eventsTotal).toBe(3);
      expect(metrics?.eventsByCategory.read).toBe(1);
      expect(metrics?.eventsByCategory.edit).toBe(1);
      expect(metrics?.eventsByCategory.other).toBe(1);
      expect(metrics?.filesRead).toBe(1);
      expect(metrics?.filesModified).toBe(1);
      expect(metrics?.decisionsRecorded).toBe(1);
      expect(metrics?.durationSecs).toBe(3600);
    });

    it('returns undefined for nonexistent session', () => {
      const metrics = computeMetrics(db, 'nonexistent');
      expect(metrics).toBeUndefined();
    });
  });

  describe('getSessionStats', () => {
    it('aggregates stats across sessions', () => {
      const s1 = makeSession({
        sessionId: 's1',
        startedAt: '2026-01-15T10:00:00.000Z',
      });
      const s2 = makeSession({
        sessionId: 's2',
        startedAt: '2026-01-15T12:00:00.000Z',
      });
      createSession(db, s1);
      createSession(db, s2);
      endSession(db, 's1', '2026-01-15T11:00:00.000Z');
      endSession(db, 's2', '2026-01-15T13:00:00.000Z');

      insertEvent(db, makeEvent('s1', {
        eventId: 'e1',
        eventType: 'file_read',
        category: 'read',
        detail: { type: 'file_op', path: '/a.ts', operation: 'read' },
      }));
      insertEvent(db, makeEvent('s2', {
        eventId: 'e2',
        eventType: 'pattern',
        category: 'other',
        detail: { type: 'pattern', description: 'Observer pattern', files: ['/a.ts'] },
      }));

      const stats = getSessionStats(db, '/test/project');
      expect(stats.totalSessions).toBe(2);
      expect(stats.totalDurationSecs).toBe(7200);
      expect(stats.patternsDiscovered).toBe(1);
      expect(stats.topFiles.length).toBeGreaterThan(0);
    });
  });
});
