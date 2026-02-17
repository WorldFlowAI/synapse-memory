import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import { handleSessionStart } from '../../src/tools/session-start.js';
import { handleSessionEnd } from '../../src/tools/session-end.js';
import { getSession, getActiveSession } from '../../src/storage/sessions.js';

describe('session tools', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
  });

  describe('session_start', () => {
    it('creates a new active session', async () => {
      const handler = handleSessionStart(db);
      const result = await handler({
        projectPath: '/test/project',
        branch: 'main',
      });

      expect(result.content[0]?.text).toContain('Session started:');
      expect(result.content[0]?.text).toContain('/test/project');

      const active = getActiveSession(db, '/test/project');
      expect(active).toBeDefined();
      expect(active?.branch).toBe('main');
    });

    it('abandons stale sessions', async () => {
      const handler = handleSessionStart(db);
      await handler({ projectPath: '/test/project', branch: 'main' });
      const first = getActiveSession(db, '/test/project');

      await handler({ projectPath: '/test/project', branch: 'main' });

      const old = getSession(db, first!.sessionId);
      expect(old?.status).toBe('abandoned');
    });

    it('returns context from recent sessions', async () => {
      const handler = handleSessionStart(db);
      const startHandler = handleSessionStart(db);
      const endHandler = handleSessionEnd(db);

      // Create and end a session
      await startHandler({ projectPath: '/test/project', branch: 'main' });
      const active = getActiveSession(db, '/test/project');
      await endHandler({
        sessionId: active!.sessionId,
        summary: 'Fixed a critical bug in authentication',
      });

      // Start a new session — should see prior session context
      const result = await handler({ projectPath: '/test/project', branch: 'main' });
      expect(result.content[0]?.text).toContain('Recent Sessions');
      expect(result.content[0]?.text).toContain('Fixed a critical bug');
    });
  });

  describe('session_end', () => {
    it('ends an active session with metrics', async () => {
      const startHandler = handleSessionStart(db);
      const endHandler = handleSessionEnd(db);

      await startHandler({ projectPath: '/test/project', branch: 'main' });
      const active = getActiveSession(db, '/test/project');

      const result = await endHandler({
        sessionId: active!.sessionId,
        summary: 'Completed the feature',
      });

      expect(result.content[0]?.text).toContain('completed');
      expect(result.content[0]?.text).toContain('Summary: Completed the feature');

      const ended = getSession(db, active!.sessionId);
      expect(ended?.status).toBe('completed');
    });

    it('returns error for nonexistent session', async () => {
      const endHandler = handleSessionEnd(db);
      const result = await endHandler({ sessionId: 'nonexistent' });
      expect(result.isError).toBe(true);
    });
  });
});
