import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import { handlePromoteKnowledge, handleGetKnowledge } from '../../src/tools/knowledge.js';
import { getProjectKnowledge } from '../../src/storage/knowledge.js';
import { createSession } from '../../src/storage/sessions.js';
import { insertEvent } from '../../src/storage/events.js';
import type { Session, SessionEvent } from '../../src/types.js';

describe('knowledge tools', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
  });

  describe('promote_knowledge', () => {
    it('promotes a decision to project knowledge', async () => {
      const handler = handlePromoteKnowledge(db);
      const result = await handler({
        projectPath: '/test/project',
        title: 'Use SQLite for local storage',
        content: 'Zero infrastructure requirement, embedded in process',
        knowledgeType: 'decision',
      });

      expect(result.content[0]?.text).toContain('Knowledge promoted');
      expect(result.content[0]?.text).toContain('Use SQLite for local storage');

      const items = getProjectKnowledge(db, '/test/project');
      expect(items).toHaveLength(1);
      expect(items[0]?.title).toBe('Use SQLite for local storage');
      expect(items[0]?.knowledgeType).toBe('decision');
    });

    it('stores tags when provided', async () => {
      const handler = handlePromoteKnowledge(db);
      await handler({
        projectPath: '/test/project',
        title: 'Repository pattern',
        content: 'Data access abstraction layer',
        knowledgeType: 'pattern',
        tags: ['architecture', 'storage'],
      });

      const items = getProjectKnowledge(db, '/test/project');
      expect(items[0]?.tags).toEqual(['architecture', 'storage']);
    });

    it('stores session and event references', async () => {
      // Create real parent rows to satisfy FK constraints
      const session: Session = {
        sessionId: 'session-abc',
        projectPath: '/test/project',
        branch: 'main',
        startedAt: '2026-01-15T10:00:00.000Z',
        status: 'active',
      };
      createSession(db, session);

      const event: SessionEvent = {
        eventId: 'event-xyz',
        sessionId: 'session-abc',
        timestamp: '2026-01-15T10:05:00.000Z',
        eventType: 'decision',
        category: 'other',
        detail: { type: 'decision', title: 'Test', rationale: 'Test' },
      };
      insertEvent(db, event);

      const handler = handlePromoteKnowledge(db);
      await handler({
        projectPath: '/test/project',
        title: 'Fix null check',
        content: 'Added null check before property access',
        knowledgeType: 'error_resolved',
        sessionId: 'session-abc',
        sourceEventId: 'event-xyz',
      });

      const items = getProjectKnowledge(db, '/test/project');
      expect(items[0]?.sessionId).toBe('session-abc');
      expect(items[0]?.sourceEventId).toBe('event-xyz');
    });

    it('reports total knowledge count after promotion', async () => {
      const handler = handlePromoteKnowledge(db);
      await handler({
        projectPath: '/test/project',
        title: 'First',
        content: 'First item',
        knowledgeType: 'decision',
      });

      const result = await handler({
        projectPath: '/test/project',
        title: 'Second',
        content: 'Second item',
        knowledgeType: 'pattern',
      });

      expect(result.content[0]?.text).toContain('2 promoted knowledge item(s)');
    });

    it('defaults tags to empty array', async () => {
      const handler = handlePromoteKnowledge(db);
      await handler({
        projectPath: '/test/project',
        title: 'No tags',
        content: 'Content',
        knowledgeType: 'milestone',
      });

      const items = getProjectKnowledge(db, '/test/project');
      expect(items[0]?.tags).toEqual([]);
    });
  });

  describe('get_knowledge', () => {
    it('returns promoted knowledge for a project', async () => {
      const promote = handlePromoteKnowledge(db);
      await promote({
        projectPath: '/test/project',
        title: 'Use Zod',
        content: 'Type-safe validation',
        knowledgeType: 'decision',
      });
      await promote({
        projectPath: '/test/project',
        title: 'Observer pattern',
        content: 'Event-driven architecture',
        knowledgeType: 'pattern',
      });

      const handler = handleGetKnowledge(db);
      const result = await handler({ projectPath: '/test/project' });

      expect(result.content[0]?.text).toContain('2 items');
      expect(result.content[0]?.text).toContain('Use Zod');
      expect(result.content[0]?.text).toContain('Observer pattern');
    });

    it('filters by knowledge type', async () => {
      const promote = handlePromoteKnowledge(db);
      await promote({
        projectPath: '/test/project',
        title: 'Decision A',
        content: 'Content A',
        knowledgeType: 'decision',
      });
      await promote({
        projectPath: '/test/project',
        title: 'Pattern B',
        content: 'Content B',
        knowledgeType: 'pattern',
      });

      const handler = handleGetKnowledge(db);
      const result = await handler({
        projectPath: '/test/project',
        knowledgeType: 'decision',
      });

      expect(result.content[0]?.text).toContain('Decision A');
      expect(result.content[0]?.text).not.toContain('Pattern B');
    });

    it('respects limit parameter', async () => {
      const promote = handlePromoteKnowledge(db);
      for (let i = 0; i < 5; i++) {
        await promote({
          projectPath: '/test/project',
          title: `Item ${i}`,
          content: `Content ${i}`,
          knowledgeType: 'decision',
        });
      }

      const handler = handleGetKnowledge(db);
      const result = await handler({
        projectPath: '/test/project',
        limit: 2,
      });

      expect(result.content[0]?.text).toContain('2 items');
    });

    it('returns empty message when no knowledge exists', async () => {
      const handler = handleGetKnowledge(db);
      const result = await handler({ projectPath: '/empty/project' });

      expect(result.content[0]?.text).toContain('No promoted knowledge found');
    });

    it('shows tags in output', async () => {
      const promote = handlePromoteKnowledge(db);
      await promote({
        projectPath: '/test/project',
        title: 'Tagged item',
        content: 'Has tags',
        knowledgeType: 'pattern',
        tags: ['testing', 'ci'],
      });

      const handler = handleGetKnowledge(db);
      const result = await handler({ projectPath: '/test/project' });

      expect(result.content[0]?.text).toContain('Tags: testing, ci');
    });

    it('isolates knowledge by project path', async () => {
      const promote = handlePromoteKnowledge(db);
      await promote({
        projectPath: '/project-a',
        title: 'Project A knowledge',
        content: 'Only for A',
        knowledgeType: 'decision',
      });
      await promote({
        projectPath: '/project-b',
        title: 'Project B knowledge',
        content: 'Only for B',
        knowledgeType: 'decision',
      });

      const handler = handleGetKnowledge(db);
      const result = await handler({ projectPath: '/project-a' });

      expect(result.content[0]?.text).toContain('Project A knowledge');
      expect(result.content[0]?.text).not.toContain('Project B knowledge');
    });
  });
});
