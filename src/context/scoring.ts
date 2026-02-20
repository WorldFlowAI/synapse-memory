import type { PromotedKnowledge, Session, ScoredKnowledge } from '../types.js';

/**
 * Compute branch weight for relevance scoring.
 * Same branch = 1.0, main/master = 0.7, other = 0.3
 */
export function computeBranchWeight(
  itemBranch: string | undefined,
  currentBranch: string,
): number {
  if (!itemBranch) {
    return 0.5; // Unknown branch gets moderate weight
  }

  if (itemBranch === currentBranch) {
    return 1.0;
  }

  if (itemBranch === 'main' || itemBranch === 'master') {
    return 0.7;
  }

  return 0.3;
}

/**
 * Compute recency weight based on age.
 * <1 day = 1.0, <1 week = 0.8, <1 month = 0.5, older = 0.3
 */
export function computeRecencyWeight(createdAt: string): number {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const daysSince = (now - created) / (1000 * 60 * 60 * 24);

  if (daysSince < 1) {
    return 1.0;
  }
  if (daysSince < 7) {
    return 0.8;
  }
  if (daysSince < 30) {
    return 0.5;
  }
  return 0.3;
}

/**
 * Compute usage weight based on how often knowledge has been used.
 * Formula: 1.0 + log(usageCount + 1) * 0.1
 */
export function computeUsageWeight(usageCount: number): number {
  return 1.0 + Math.log(usageCount + 1) * 0.1;
}

/**
 * Compute overall relevance score for a knowledge item.
 * relevanceScore = branchWeight * 0.4 + recencyWeight * 0.4 + usageWeight * 0.2
 */
export function computeRelevanceScore(
  knowledge: PromotedKnowledge,
  currentBranch: string,
): ScoredKnowledge {
  const branchWeight = computeBranchWeight(knowledge.branch, currentBranch);
  const recencyWeight = computeRecencyWeight(knowledge.createdAt);
  const usageWeight = computeUsageWeight(knowledge.usageCount ?? 0);

  const relevanceScore =
    branchWeight * 0.4 +
    recencyWeight * 0.4 +
    (usageWeight - 1.0) * 0.2 + 0.2; // Normalize usage weight to 0-1 range approx

  return {
    knowledge,
    relevanceScore,
    branchWeight,
    recencyWeight,
  };
}

/**
 * Score and rank a list of knowledge items by relevance.
 */
export function rankKnowledge(
  items: readonly PromotedKnowledge[],
  currentBranch: string,
): readonly ScoredKnowledge[] {
  return items
    .map((k) => computeRelevanceScore(k, currentBranch))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Score a session for relevance.
 */
export function scoreSession(
  session: Session,
  currentBranch: string,
): { session: Session; score: number } {
  const branchWeight = computeBranchWeight(session.branch, currentBranch);
  const recencyWeight = computeRecencyWeight(session.startedAt);

  const score = branchWeight * 0.5 + recencyWeight * 0.5;

  return { session, score };
}

/**
 * Score and rank sessions by relevance.
 */
export function rankSessions(
  sessions: readonly Session[],
  currentBranch: string,
): readonly { session: Session; score: number }[] {
  return sessions
    .map((s) => scoreSession(s, currentBranch))
    .sort((a, b) => b.score - a.score);
}
