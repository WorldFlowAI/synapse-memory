import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import { handleStats } from '../../src/tools/stats.js';
import { createSession, endSession } from '../../src/storage/sessions.js';
import { insertEvent } from '../../src/storage/events.js';
import type { Session, SessionEvent } from '../../src/types.js';

describe('stats tool', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
  });

  it('returns stats for a project', async () => {
    const session: Session = {
      sessionId: 's1',
      projectPath: '/test/project',
      branch: 'main',
      startedAt: new Date(Date.now() - 3600_000).toISOString(),
      status: 'active',
    };
    createSession(db, session);
    endSession(db, 's1', new Date().toISOString(), 'Test session');

    const event: SessionEvent = {
      eventId: 'e1',
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      eventType: 'file_read',
      category: 'read',
      detail: { type: 'file_op', path: '/src/index.ts', operation: 'read' },
    };
    insertEvent(db, event);

    const handler = handleStats(db);
    const result = await handler({ projectPath: '/test/project', period: 'week' });

    expect(result.content[0]?.text).toContain('Sessions: 1');
    expect(result.content[0]?.text).toContain('/src/index.ts');
  });

  it('returns zero stats for empty project', async () => {
    const handler = handleStats(db);
    const result = await handler({ projectPath: '/empty/project' });

    expect(result.content[0]?.text).toContain('Sessions: 0');
  });

  it('defaults to week period', async () => {
    const handler = handleStats(db);
    const result = await handler({ projectPath: '/test/project' });
    expect(result.content[0]?.text).toContain('(week)');
  });

  it('filters by period', async () => {
    // Create a session from 2 weeks ago — should not appear in 'day' stats
    const oldDate = new Date(Date.now() - 14 * 86400_000);
    const session: Session = {
      sessionId: 's-old',
      projectPath: '/test/project',
      branch: 'main',
      startedAt: oldDate.toISOString(),
      status: 'active',
    };
    createSession(db, session);
    endSession(db, 's-old', new Date(oldDate.getTime() + 3600_000).toISOString());

    const handler = handleStats(db);
    const result = await handler({ projectPath: '/test/project', period: 'day' });
    expect(result.content[0]?.text).toContain('Sessions: 0');

    const allResult = await handler({ projectPath: '/test/project', period: 'all' });
    expect(allResult.content[0]?.text).toContain('Sessions: 1');
  });
});
