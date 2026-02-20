import { describe, it, expect } from 'vitest';
import {
  computeBranchWeight,
  computeRecencyWeight,
  computeUsageWeight,
  computeRelevanceScore,
  rankKnowledge,
  rankSessions,
} from '../../src/context/scoring.js';
import type { PromotedKnowledge, Session } from '../../src/types.js';

describe('context scoring', () => {
  describe('computeBranchWeight', () => {
    it('returns 1.0 for same branch', () => {
      expect(computeBranchWeight('feature-x', 'feature-x')).toBe(1.0);
    });

    it('returns 0.7 for main branch', () => {
      expect(computeBranchWeight('main', 'feature-x')).toBe(0.7);
    });

    it('returns 0.7 for master branch', () => {
      expect(computeBranchWeight('master', 'feature-x')).toBe(0.7);
    });

    it('returns 0.3 for other branches', () => {
      expect(computeBranchWeight('old-feature', 'feature-x')).toBe(0.3);
    });

    it('returns 0.5 for undefined branch', () => {
      expect(computeBranchWeight(undefined, 'feature-x')).toBe(0.5);
    });
  });

  describe('computeRecencyWeight', () => {
    it('returns 1.0 for items less than 1 day old', () => {
      const recent = new Date().toISOString();
      expect(computeRecencyWeight(recent)).toBe(1.0);
    });

    it('returns 0.8 for items 3 days old', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(computeRecencyWeight(threeDaysAgo)).toBe(0.8);
    });

    it('returns 0.5 for items 2 weeks old', () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      expect(computeRecencyWeight(twoWeeksAgo)).toBe(0.5);
    });

    it('returns 0.3 for items older than 30 days', () => {
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      expect(computeRecencyWeight(oldDate)).toBe(0.3);
    });
  });

  describe('computeUsageWeight', () => {
    it('returns 1.0 for zero usage', () => {
      expect(computeUsageWeight(0)).toBeCloseTo(1.0, 2);
    });

    it('increases with usage count', () => {
      const zeroUsage = computeUsageWeight(0);
      const tenUsage = computeUsageWeight(10);
      const hundredUsage = computeUsageWeight(100);

      expect(tenUsage).toBeGreaterThan(zeroUsage);
      expect(hundredUsage).toBeGreaterThan(tenUsage);
    });
  });

  describe('computeRelevanceScore', () => {
    it('scores same-branch recent items higher', () => {
      const knowledge: PromotedKnowledge = {
        knowledgeId: 'k1',
        projectPath: '/test',
        title: 'Test',
        content: 'Content',
        knowledgeType: 'decision',
        tags: [],
        createdAt: new Date().toISOString(),
        branch: 'feature-x',
        usageCount: 0,
      };

      const score = computeRelevanceScore(knowledge, 'feature-x');

      expect(score.branchWeight).toBe(1.0);
      expect(score.recencyWeight).toBe(1.0);
      expect(score.relevanceScore).toBeGreaterThan(0.8);
    });
  });

  describe('rankKnowledge', () => {
    it('ranks by relevance score', () => {
      const oldOtherBranch: PromotedKnowledge = {
        knowledgeId: 'k1',
        projectPath: '/test',
        title: 'Old',
        content: 'Content',
        knowledgeType: 'decision',
        tags: [],
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        branch: 'old-branch',
        usageCount: 0,
      };

      const recentSameBranch: PromotedKnowledge = {
        knowledgeId: 'k2',
        projectPath: '/test',
        title: 'Recent',
        content: 'Content',
        knowledgeType: 'decision',
        tags: [],
        createdAt: new Date().toISOString(),
        branch: 'feature-x',
        usageCount: 0,
      };

      const ranked = rankKnowledge([oldOtherBranch, recentSameBranch], 'feature-x');

      expect(ranked[0]?.knowledge.knowledgeId).toBe('k2');
      expect(ranked[1]?.knowledge.knowledgeId).toBe('k1');
    });
  });

  describe('rankSessions', () => {
    it('ranks sessions by relevance', () => {
      const oldSession: Session = {
        sessionId: 's1',
        projectPath: '/test',
        branch: 'old-branch',
        startedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'completed',
      };

      const recentSession: Session = {
        sessionId: 's2',
        projectPath: '/test',
        branch: 'feature-x',
        startedAt: new Date().toISOString(),
        status: 'completed',
      };

      const ranked = rankSessions([oldSession, recentSession], 'feature-x');

      expect(ranked[0]?.session.sessionId).toBe('s2');
      expect(ranked[1]?.session.sessionId).toBe('s1');
    });
  });
});
