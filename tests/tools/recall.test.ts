import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import { handleRecall } from '../../src/tools/recall.js';
import { createSession, endSession } from '../../src/storage/sessions.js';
import { insertEvent } from '../../src/storage/events.js';
import type { Session, SessionEvent } from '../../src/types.js';

function seedSession(db: Database.Database, id: string, summary: string): void {
  const session: Session = {
    sessionId: id,
    projectPath: '/test/project',
    branch: 'main',
    startedAt: '2026-01-15T10:00:00.000Z',
    status: 'active',
  };
  createSession(db, session);
  endSession(db, id, '2026-01-15T11:00:00.000Z', summary);
}

function seedEvent(
  db: Database.Database,
  sessionId: string,
  event: Partial<SessionEvent>,
): void {
  const base: SessionEvent = {
    eventId: `evt-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    timestamp: '2026-01-15T10:30:00.000Z',
    eventType: 'decision',
    category: 'other',
    detail: { type: 'decision', title: 'Test', rationale: 'Test reason' },
    ...event,
  };
  insertEvent(db, base);
}

describe('recall tool', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
  });

  it('returns sessions matching a query', async () => {
    seedSession(db, 's1', 'Fixed authentication bug');
    seedSession(db, 's2', 'Added new API endpoint');

    const handler = handleRecall(db);
    const result = await handler({
      projectPath: '/test/project',
      query: 'authentication',
    });

    expect(result.content[0]?.text).toContain('authentication');
    expect(result.content[0]?.text).not.toContain('API endpoint');
  });

  it('returns all sessions when no query provided', async () => {
    seedSession(db, 's1', 'Session one');
    seedSession(db, 's2', 'Session two');

    const handler = handleRecall(db);
    const result = await handler({ projectPath: '/test/project' });

    expect(result.content[0]?.text).toContain('2 session(s)');
  });

  it('shows decisions and patterns from sessions', async () => {
    seedSession(db, 's1', 'Architecture work');
    seedEvent(db, 's1', {
      eventType: 'decision',
      detail: { type: 'decision', title: 'Use SQLite', rationale: 'Zero infra' },
    });
    seedEvent(db, 's1', {
      eventType: 'pattern',
      category: 'other',
      detail: { type: 'pattern', description: 'Repository pattern', files: [] },
    });

    const handler = handleRecall(db);
    const result = await handler({ projectPath: '/test/project' });

    expect(result.content[0]?.text).toContain('Use SQLite');
    expect(result.content[0]?.text).toContain('Repository pattern');
  });

  it('filters by event type', async () => {
    seedSession(db, 's1', 'Some work');
    seedEvent(db, 's1', {
      eventType: 'decision',
      detail: { type: 'decision', title: 'Decision A', rationale: 'reason' },
    });
    seedEvent(db, 's1', {
      eventType: 'pattern',
      category: 'other',
      detail: { type: 'pattern', description: 'Pattern B', files: [] },
    });

    const handler = handleRecall(db);
    const result = await handler({
      projectPath: '/test/project',
      eventType: 'decision',
    });

    expect(result.content[0]?.text).toContain('Decision A');
    expect(result.content[0]?.text).not.toContain('Pattern B');
  });

  it('returns message when no sessions found', async () => {
    const handler = handleRecall(db);
    const result = await handler({ projectPath: '/test/project' });
    expect(result.content[0]?.text).toContain('No sessions found');
  });

  it('returns message when no events match type filter', async () => {
    const handler = handleRecall(db);
    const result = await handler({
      projectPath: '/test/project',
      eventType: 'milestone',
    });
    expect(result.content[0]?.text).toContain('No milestone events found');
  });
});
