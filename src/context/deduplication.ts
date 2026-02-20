import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { DuplicateCandidate, PromotedKnowledge } from '../types.js';

/**
 * Normalize content for hashing: lowercase, collapse whitespace.
 */
export function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute SHA256 hash of normalized content.
 */
export function computeContentHash(content: string): string {
  const normalized = normalizeContent(content);
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Compute Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1,     // insertion
          matrix[i - 1]![j]! + 1,     // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Compute normalized Levenshtein similarity (0-1, where 1 is identical).
 */
export function computeTitleSimilarity(title1: string, title2: string): number {
  const normalized1 = normalizeContent(title1);
  const normalized2 = normalizeContent(title2);

  if (normalized1 === normalized2) {
    return 1.0;
  }

  const maxLen = Math.max(normalized1.length, normalized2.length);
  if (maxLen === 0) {
    return 1.0;
  }

  const distance = levenshteinDistance(normalized1, normalized2);
  return 1 - distance / maxLen;
}

/**
 * Find duplicate candidates for a piece of content.
 * Returns matches with exact hash or similar title (similarity > 0.85).
 */
export function findDuplicates(
  db: Database.Database,
  projectPath: string,
  title: string,
  content: string,
): readonly DuplicateCandidate[] {
  const contentHash = computeContentHash(content);
  const duplicates: DuplicateCandidate[] = [];

  // Check for exact content hash match
  const exactMatch = db.prepare(`
    SELECT * FROM promoted_knowledge
    WHERE project_path = ? AND content_hash = ? AND superseded_by IS NULL
  `).get(projectPath, contentHash) as KnowledgeRow | undefined;

  if (exactMatch) {
    duplicates.push({
      existingKnowledge: rowToKnowledge(exactMatch),
      similarityScore: 1.0,
      matchType: 'exact_hash',
    });
    return duplicates; // Exact match, no need to check further
  }

  // Check for similar titles
  const candidates = db.prepare(`
    SELECT * FROM promoted_knowledge
    WHERE project_path = ? AND superseded_by IS NULL
  `).all(projectPath) as KnowledgeRow[];

  for (const candidate of candidates) {
    const similarity = computeTitleSimilarity(title, candidate.title);
    if (similarity >= 0.85) {
      duplicates.push({
        existingKnowledge: rowToKnowledge(candidate),
        similarityScore: similarity,
        matchType: 'title_match',
      });
    }
  }

  // Sort by similarity (highest first)
  return duplicates.sort((a, b) => b.similarityScore - a.similarityScore);
}

/**
 * Mark a knowledge item as superseded by another.
 */
export function markSuperseded(
  db: Database.Database,
  oldKnowledgeId: string,
  newKnowledgeId: string,
): void {
  db.prepare(`
    UPDATE promoted_knowledge
    SET superseded_by = ?
    WHERE knowledge_id = ?
  `).run(newKnowledgeId, oldKnowledgeId);
}

// Internal types for database rows
interface KnowledgeRow {
  knowledge_id: string;
  project_path: string;
  session_id: string | null;
  source_event_id: string | null;
  title: string;
  content: string;
  knowledge_type: string;
  tags: string;
  created_at: string;
  synced_at: string | null;
  synapse_knowledge_id: string | null;
  branch: string | null;
  content_hash: string | null;
  usage_count: number;
  superseded_by: string | null;
}

function rowToKnowledge(row: KnowledgeRow): PromotedKnowledge {
  return {
    knowledgeId: row.knowledge_id,
    projectPath: row.project_path,
    sessionId: row.session_id ?? undefined,
    sourceEventId: row.source_event_id ?? undefined,
    title: row.title,
    content: row.content,
    knowledgeType: row.knowledge_type as PromotedKnowledge['knowledgeType'],
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    syncedAt: row.synced_at ?? undefined,
    synapseKnowledgeId: row.synapse_knowledge_id ?? undefined,
    branch: row.branch ?? undefined,
    contentHash: row.content_hash ?? undefined,
    usageCount: row.usage_count,
    supersededBy: row.superseded_by ?? undefined,
  };
}
