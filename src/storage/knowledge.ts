import type Database from 'better-sqlite3';
import type { KnowledgeType, PromotedKnowledge } from '../types.js';

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
    knowledgeType: row.knowledge_type as KnowledgeType,
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

export function insertKnowledge(
  db: Database.Database,
  knowledge: PromotedKnowledge,
): PromotedKnowledge {
  db.prepare(`
    INSERT INTO promoted_knowledge
      (knowledge_id, project_path, session_id, source_event_id,
       title, content, knowledge_type, tags, created_at,
       branch, content_hash, usage_count)
    VALUES (@knowledge_id, @project_path, @session_id, @source_event_id,
            @title, @content, @knowledge_type, @tags, @created_at,
            @branch, @content_hash, @usage_count)
  `).run({
    knowledge_id: knowledge.knowledgeId,
    project_path: knowledge.projectPath,
    session_id: knowledge.sessionId ?? null,
    source_event_id: knowledge.sourceEventId ?? null,
    title: knowledge.title,
    content: knowledge.content,
    knowledge_type: knowledge.knowledgeType,
    tags: JSON.stringify(knowledge.tags),
    created_at: knowledge.createdAt,
    branch: knowledge.branch ?? null,
    content_hash: knowledge.contentHash ?? null,
    usage_count: knowledge.usageCount ?? 0,
  });

  return knowledge;
}

export function getProjectKnowledge(
  db: Database.Database,
  projectPath: string,
  knowledgeType?: KnowledgeType,
  limit: number = 50,
): readonly PromotedKnowledge[] {
  // Exclude superseded knowledge
  const query = knowledgeType
    ? `SELECT * FROM promoted_knowledge
       WHERE project_path = ? AND knowledge_type = ? AND superseded_by IS NULL
       ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM promoted_knowledge
       WHERE project_path = ? AND superseded_by IS NULL
       ORDER BY created_at DESC LIMIT ?`;

  const params = knowledgeType
    ? [projectPath, knowledgeType, limit]
    : [projectPath, limit];

  const rows = db.prepare(query).all(...params) as KnowledgeRow[];
  return rows.map(rowToKnowledge);
}

export function getKnowledgeById(
  db: Database.Database,
  knowledgeId: string,
): PromotedKnowledge | undefined {
  const row = db.prepare(`
    SELECT * FROM promoted_knowledge WHERE knowledge_id = ?
  `).get(knowledgeId) as KnowledgeRow | undefined;

  return row ? rowToKnowledge(row) : undefined;
}

export function getUnsyncedKnowledge(
  db: Database.Database,
  projectPath: string,
): readonly PromotedKnowledge[] {
  const rows = db.prepare(`
    SELECT * FROM promoted_knowledge
    WHERE project_path = ? AND synced_at IS NULL AND superseded_by IS NULL
    ORDER BY created_at ASC
  `).all(projectPath) as KnowledgeRow[];

  return rows.map(rowToKnowledge);
}

export function markKnowledgeSynced(
  db: Database.Database,
  knowledgeId: string,
  syncedAt: string,
  synapseKnowledgeId: string,
): void {
  db.prepare(`
    UPDATE promoted_knowledge
    SET synced_at = ?, synapse_knowledge_id = ?
    WHERE knowledge_id = ?
  `).run(syncedAt, synapseKnowledgeId, knowledgeId);
}

export function getKnowledgeCount(
  db: Database.Database,
  projectPath: string,
): { total: number; byType: Record<KnowledgeType, number> } {
  const total = db.prepare(`
    SELECT COUNT(*) as count FROM promoted_knowledge
    WHERE project_path = ? AND superseded_by IS NULL
  `).get(projectPath) as { count: number };

  const byType = db.prepare(`
    SELECT knowledge_type, COUNT(*) as count FROM promoted_knowledge
    WHERE project_path = ? AND superseded_by IS NULL
    GROUP BY knowledge_type
  `).all(projectPath) as Array<{ knowledge_type: string; count: number }>;

  const counts: Record<KnowledgeType, number> = {
    decision: 0,
    pattern: 0,
    error_resolved: 0,
    milestone: 0,
  };

  for (const row of byType) {
    counts[row.knowledge_type as KnowledgeType] = row.count;
  }

  return { total: total.count, byType: counts };
}
