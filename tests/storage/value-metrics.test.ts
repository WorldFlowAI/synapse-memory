import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../src/storage/database.js';
import {
  getValueMetrics,
  ensureValueMetrics,
  incrementSessionCount,
  incrementKnowledgeSurfaced,
  incrementDecisionRecall,
  incrementPatternApplied,
  incrementErrorPrevented,
  computeValueSummary,
  TIME_SAVINGS,
} from '../../src/storage/value-metrics.js';

describe('value-metrics storage', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDatabase();
  });

  describe('ensureValueMetrics', () => {
    it('creates metrics on first call', () => {
      const metrics = ensureValueMetrics(db, '/test/project');

      expect(metrics.projectPath).toBe('/test/project');
      expect(metrics.totalSessions).toBe(0);
      expect(metrics.knowledgeSurfacedCount).toBe(0);
    });

    it('returns existing metrics on subsequent calls', () => {
      ensureValueMetrics(db, '/test/project');
      incrementSessionCount(db, '/test/project');
      const metrics = ensureValueMetrics(db, '/test/project');

      expect(metrics.totalSessions).toBe(1);
    });
  });

  describe('increment functions', () => {
    it('incrementSessionCount increments total_sessions', () => {
      incrementSessionCount(db, '/test/project');
      incrementSessionCount(db, '/test/project');

      const metrics = getValueMetrics(db, '/test/project');
      expect(metrics?.totalSessions).toBe(2);
    });

    it('incrementKnowledgeSurfaced adds time saved', () => {
      incrementKnowledgeSurfaced(db, '/test/project', 5);

      const metrics = getValueMetrics(db, '/test/project');
      expect(metrics?.knowledgeSurfacedCount).toBe(5);
      expect(metrics?.estimatedTimeSavedSecs).toBe(5 * TIME_SAVINGS.knowledgeSurface);
    });

    it('incrementDecisionRecall adds time saved', () => {
      incrementDecisionRecall(db, '/test/project', 2);

      const metrics = getValueMetrics(db, '/test/project');
      expect(metrics?.decisionsRecalledCount).toBe(2);
      expect(metrics?.estimatedTimeSavedSecs).toBe(2 * TIME_SAVINGS.decisionRecall);
    });

    it('incrementPatternApplied adds time saved', () => {
      incrementPatternApplied(db, '/test/project', 3);

      const metrics = getValueMetrics(db, '/test/project');
      expect(metrics?.patternsAppliedCount).toBe(3);
      expect(metrics?.estimatedTimeSavedSecs).toBe(3 * TIME_SAVINGS.patternApplied);
    });

    it('incrementErrorPrevented adds time saved', () => {
      incrementErrorPrevented(db, '/test/project', 1);

      const metrics = getValueMetrics(db, '/test/project');
      expect(metrics?.errorsPreventedCount).toBe(1);
      expect(metrics?.estimatedTimeSavedSecs).toBe(TIME_SAVINGS.errorPrevented);
    });
  });

  describe('computeValueSummary', () => {
    it('returns zeros for project with no metrics', () => {
      const summary = computeValueSummary(db, '/nonexistent');

      expect(summary.timeSavedMinutes).toBe(0);
      expect(summary.estimatedValueUSD).toBe(0);
    });

    it('computes time saved in minutes', () => {
      incrementKnowledgeSurfaced(db, '/test/project', 10);

      const summary = computeValueSummary(db, '/test/project');

      // 10 surfaces * 60 seconds = 600 seconds = 10 minutes
      expect(summary.timeSavedMinutes).toBe(10);
    });

    it('computes estimated value based on hourly rate', () => {
      // Add 1 hour worth of time savings (3600 seconds)
      incrementDecisionRecall(db, '/test/project', 20); // 20 * 180 = 3600 seconds

      const summary = computeValueSummary(db, '/test/project', 100); // $100/hr

      expect(summary.estimatedValueUSD).toBe(100);
    });

    it('provides breakdown by category', () => {
      incrementKnowledgeSurfaced(db, '/test/project', 5);
      incrementDecisionRecall(db, '/test/project', 3);
      incrementPatternApplied(db, '/test/project', 2);
      incrementErrorPrevented(db, '/test/project', 1);

      const summary = computeValueSummary(db, '/test/project');

      expect(summary.breakdown.knowledgeSurfaced).toBe(5);
      expect(summary.breakdown.decisionsRecalled).toBe(3);
      expect(summary.breakdown.patternsApplied).toBe(2);
      expect(summary.breakdown.errorsPrevented).toBe(1);
    });
  });
});
