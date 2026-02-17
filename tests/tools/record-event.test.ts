import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import { handleRecordEvent } from '../../src/tools/record-event.js';
import { createSession, endSession } from '../../src/storage/sessions.js';
import { getSessionEvents } from '../../src/storage/events.js';
import type { Session } from '../../src/types.js';

describe('record_event tool', () => {
  let db: Database.Database;
  let session: Session;

  beforeEach(() => {
    db = createInMemoryDatabase();
    session = {
      sessionId: 'test-session',
      projectPath: '/test/project',
      branch: 'main',
      startedAt: '2026-01-15T10:00:00.000Z',
      status: 'active',
    };
    createSession(db, session);
  });

  it('records a file_read event', async () => {
    const handler = handleRecordEvent(db);
    const result = await handler({
      sessionId: 'test-session',
      eventType: 'file_read',
      detail: { type: 'file_op', path: '/src/index.ts', operation: 'read' },
    });

    expect(result.content[0]?.text).toContain('Event recorded: file_read');

    const events = getSessionEvents(db, 'test-session');
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe('file_read');
    expect(events[0]?.category).toBe('read');
  });

  it('derives eventType from detail.type (consistency)', async () => {
    const handler = handleRecordEvent(db);
    // Pass mismatched eventType — handler should derive from detail
    const result = await handler({
      sessionId: 'test-session',
      eventType: 'milestone',
      detail: { type: 'file_op', path: '/src/index.ts', operation: 'edit' },
    });

    expect(result.content[0]?.text).toContain('Event recorded: file_edit');

    const events = getSessionEvents(db, 'test-session');
    expect(events[0]?.eventType).toBe('file_edit');
    expect(events[0]?.category).toBe('edit');
  });

  it('records a decision event', async () => {
    const handler = handleRecordEvent(db);
    await handler({
      sessionId: 'test-session',
      eventType: 'decision',
      detail: {
        type: 'decision',
        title: 'Use SQLite',
        rationale: 'Zero infrastructure requirement',
      },
    });

    const events = getSessionEvents(db, 'test-session', 'decision');
    expect(events).toHaveLength(1);
    expect(events[0]?.detail).toEqual({
      type: 'decision',
      title: 'Use SQLite',
      rationale: 'Zero infrastructure requirement',
    });
  });

  it('records a pattern event', async () => {
    const handler = handleRecordEvent(db);
    await handler({
      sessionId: 'test-session',
      eventType: 'pattern',
      detail: {
        type: 'pattern',
        description: 'Repository pattern for data access',
        files: ['/src/storage/sessions.ts', '/src/storage/events.ts'],
      },
    });

    const events = getSessionEvents(db, 'test-session', 'pattern');
    expect(events).toHaveLength(1);
    expect(events[0]?.category).toBe('other');
  });

  it('records an error_resolved event', async () => {
    const handler = handleRecordEvent(db);
    await handler({
      sessionId: 'test-session',
      eventType: 'error_resolved',
      detail: {
        type: 'error_resolved',
        error: 'TypeError: cannot read property of undefined',
        resolution: 'Added null check before accessing property',
        files: ['/src/utils.ts'],
      },
    });

    const events = getSessionEvents(db, 'test-session', 'error_resolved');
    expect(events).toHaveLength(1);
  });

  it('records a milestone event', async () => {
    const handler = handleRecordEvent(db);
    await handler({
      sessionId: 'test-session',
      eventType: 'milestone',
      detail: { type: 'milestone', summary: 'Storage layer complete' },
    });

    const events = getSessionEvents(db, 'test-session', 'milestone');
    expect(events).toHaveLength(1);
  });

  it('records a tool_call event', async () => {
    const handler = handleRecordEvent(db);
    await handler({
      sessionId: 'test-session',
      eventType: 'tool_call',
      detail: { type: 'tool_call', toolName: 'Bash', params: 'npm test' },
    });

    const events = getSessionEvents(db, 'test-session', 'tool_call');
    expect(events).toHaveLength(1);
    expect(events[0]?.category).toBe('execute');
  });

  it('returns error for nonexistent session', async () => {
    const handler = handleRecordEvent(db);
    const result = await handler({
      sessionId: 'nonexistent',
      eventType: 'file_read',
      detail: { type: 'file_op', path: '/a.ts', operation: 'read' },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('not found');
  });

  it('returns error for completed session', async () => {
    endSession(db, 'test-session', '2026-01-15T11:00:00.000Z');

    const handler = handleRecordEvent(db);
    const result = await handler({
      sessionId: 'test-session',
      eventType: 'decision',
      detail: { type: 'decision', title: 'Late', rationale: 'Too late' },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('completed, not active');
  });
});
