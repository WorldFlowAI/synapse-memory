import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import { handleValueMetrics } from '../../src/tools/value-metrics.js';
import {
  incrementSessionCount,
  incrementKnowledgeSurfaced,
  incrementDecisionRecall,
} from '../../src/storage/value-metrics.js';
import { insertKnowledge } from '../../src/storage/knowledge.js';
import type { PromotedKnowledge } from '../../src/types.js';

describe('value-metrics tool', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
  });

  describe('get_value_metrics', () => {
    it('returns no data message for new project', async () => {
      const handler = handleValueMetrics(db);
      const result = await handler({ projectPath: '/new/project' });

      expect(result.content[0]?.text).toContain('No data yet');
    });

    it('shows session count', async () => {
      incrementSessionCount(db, '/test/project');
      incrementSessionCount(db, '/test/project');
      incrementSessionCount(db, '/test/project');

      const handler = handleValueMetrics(db);
      const result = await handler({ projectPath: '/test/project' });

      expect(result.content[0]?.text).toContain('Sessions tracked: 3');
    });

    it('shows knowledge surfaced count', async () => {
      incrementKnowledgeSurfaced(db, '/test/project', 10);

      const handler = handleValueMetrics(db);
      const result = await handler({ projectPath: '/test/project' });

      expect(result.content[0]?.text).toContain('Knowledge surfaced: 10 times');
    });

    it('shows decisions recalled count', async () => {
      incrementDecisionRecall(db, '/test/project', 5);

      const handler = handleValueMetrics(db);
      const result = await handler({ projectPath: '/test/project' });

      expect(result.content[0]?.text).toContain('Decisions recalled via search: 5 times');
    });

    it('shows time savings estimate', async () => {
      // Add enough to show meaningful time
      incrementKnowledgeSurfaced(db, '/test/project', 60); // 60 minutes

      const handler = handleValueMetrics(db);
      const result = await handler({ projectPath: '/test/project' });

      expect(result.content[0]?.text).toContain('Time savings estimate:');
      expect(result.content[0]?.text).toContain('1h');
    });

    it('shows knowledge item counts by type', async () => {
      const decision: PromotedKnowledge = {
        knowledgeId: 'k1',
        projectPath: '/test/project',
        title: 'Decision 1',
        content: 'Content',
        knowledgeType: 'decision',
        tags: [],
        createdAt: new Date().toISOString(),
        usageCount: 0,
      };
      const pattern: PromotedKnowledge = {
        knowledgeId: 'k2',
        projectPath: '/test/project',
        title: 'Pattern 1',
        content: 'Content',
        knowledgeType: 'pattern',
        tags: [],
        createdAt: new Date().toISOString(),
        usageCount: 0,
      };

      insertKnowledge(db, decision);
      insertKnowledge(db, pattern);
      incrementSessionCount(db, '/test/project'); // Trigger metrics creation

      const handler = handleValueMetrics(db);
      const result = await handler({ projectPath: '/test/project' });

      expect(result.content[0]?.text).toContain('Knowledge items: 2');
      expect(result.content[0]?.text).toContain('1 decisions');
      expect(result.content[0]?.text).toContain('1 patterns');
    });

    it('uses custom hourly rate for value calculation', async () => {
      // 1 hour of time saved
      incrementDecisionRecall(db, '/test/project', 20); // 20 * 3 min = 60 min

      const handler = handleValueMetrics(db);
      const result = await handler({ projectPath: '/test/project', hourlyRate: 100 });

      expect(result.content[0]?.text).toContain('$100');
    });

    it('shows calculation basis', async () => {
      incrementSessionCount(db, '/test/project');

      const handler = handleValueMetrics(db);
      const result = await handler({ projectPath: '/test/project' });

      expect(result.content[0]?.text).toContain('Calculation basis:');
      expect(result.content[0]?.text).toContain('Each knowledge surface');
      expect(result.content[0]?.text).toContain('Each decision recall');
    });
  });
});
