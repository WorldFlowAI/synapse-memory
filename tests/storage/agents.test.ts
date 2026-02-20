import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import { upsertAgent, getAgent, getAllAgents, getAgentStats } from '../../src/storage/agents.js';
import { createSession } from '../../src/storage/sessions.js';
import type { Session } from '../../src/types.js';

describe('agents storage', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
  });

  describe('upsertAgent', () => {
    it('creates a new agent on first call', () => {
      const agent = upsertAgent(db, 'claude-code');

      expect(agent.agentType).toBe('claude-code');
      expect(agent.displayName).toBe('Claude Code');
      expect(agent.totalSessions).toBe(1);
    });

    it('increments session count on subsequent calls', () => {
      upsertAgent(db, 'claude-code');
      upsertAgent(db, 'claude-code');
      const agent = upsertAgent(db, 'claude-code');

      expect(agent.totalSessions).toBe(3);
    });

    it('updates last_seen_at on each call', () => {
      const first = upsertAgent(db, 'cursor');
      const second = upsertAgent(db, 'cursor');

      expect(new Date(second.lastSeenAt).getTime()).toBeGreaterThanOrEqual(
        new Date(first.firstSeenAt).getTime()
      );
    });
  });

  describe('getAgent', () => {
    it('returns undefined for unknown agent', () => {
      const agent = getAgent(db, 'aider');
      expect(agent).toBeUndefined();
    });

    it('returns agent after creation', () => {
      upsertAgent(db, 'openclaw');
      const agent = getAgent(db, 'openclaw');

      expect(agent).toBeDefined();
      expect(agent?.displayName).toBe('OpenClaw');
    });
  });

  describe('getAllAgents', () => {
    it('returns empty array initially', () => {
      const agents = getAllAgents(db);
      expect(agents).toHaveLength(0);
    });

    it('returns all agents sorted by session count', () => {
      upsertAgent(db, 'aider');
      upsertAgent(db, 'claude-code');
      upsertAgent(db, 'claude-code');
      upsertAgent(db, 'cursor');
      upsertAgent(db, 'cursor');
      upsertAgent(db, 'cursor');

      const agents = getAllAgents(db);

      expect(agents).toHaveLength(3);
      expect(agents[0]?.agentType).toBe('cursor');
      expect(agents[1]?.agentType).toBe('claude-code');
      expect(agents[2]?.agentType).toBe('aider');
    });
  });

  describe('getAgentStats', () => {
    it('returns empty array for project with no sessions', () => {
      const stats = getAgentStats(db, '/test/project');
      expect(stats).toHaveLength(0);
    });

    it('returns agent breakdown for project sessions', () => {
      // Create sessions with different agent types
      const session1: Session = {
        sessionId: 's1',
        projectPath: '/test/project',
        branch: 'main',
        startedAt: '2026-02-20T10:00:00Z',
        status: 'completed',
        agentType: 'claude-code',
      };
      const session2: Session = {
        sessionId: 's2',
        projectPath: '/test/project',
        branch: 'main',
        startedAt: '2026-02-20T11:00:00Z',
        status: 'completed',
        agentType: 'cursor',
      };
      const session3: Session = {
        sessionId: 's3',
        projectPath: '/test/project',
        branch: 'main',
        startedAt: '2026-02-20T12:00:00Z',
        status: 'completed',
        agentType: 'claude-code',
      };

      createSession(db, session1);
      createSession(db, session2);
      createSession(db, session3);

      const stats = getAgentStats(db, '/test/project');

      expect(stats).toHaveLength(2);
      expect(stats.find((s) => s.agentType === 'claude-code')?.sessionCount).toBe(2);
      expect(stats.find((s) => s.agentType === 'cursor')?.sessionCount).toBe(1);
    });
  });
});
