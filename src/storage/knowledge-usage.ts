import type Database from 'better-sqlite3';
import type { KnowledgeUsage } from '../types.js';
import { generateId, nowISO } from '../utils.js';

interface KnowledgeUsageRow {
  usage_id: string;
  knowledge_id: string;
  session_id: string;
  usage_type: string;
  timestamp: string;
}

function rowToKnowledgeUsage(row: KnowledgeUsageRow): KnowledgeUsage {
  return {
    usageId: row.usage_id,
    knowledgeId: row.knowledge_id,
    sessionId: row.session_id,
    usageType: row.usage_type as KnowledgeUsage['usageType'],
    timestamp: row.timestamp,
  };
}

export function recordKnowledgeUsage(
  db: Database.Database,
  knowledgeId: string,
  sessionId: string,
  usageType: 'surfaced' | 'recalled' | 'applied',
): KnowledgeUsage {
  const usageId = generateId();
  const timestamp = nowISO();

  db.prepare(`
    INSERT INTO knowledge_usage (usage_id, knowledge_id, session_id, usage_type, timestamp)
    VALUES (@usage_id, @knowledge_id, @session_id, @usage_type, @timestamp)
  `).run({
    usage_id: usageId,
    knowledge_id: knowledgeId,
    session_id: sessionId,
    usage_type: usageType,
    timestamp,
  });

  // Increment usage_count on the knowledge item
  incrementUsageCount(db, knowledgeId);

  return {
    usageId,
    knowledgeId,
    sessionId,
    usageType,
    timestamp,
  };
}

export function incrementUsageCount(
  db: Database.Database,
  knowledgeId: string,
): void {
  db.prepare(`
    UPDATE promoted_knowledge
    SET usage_count = usage_count + 1
    WHERE knowledge_id = ?
  `).run(knowledgeId);
}

export function getKnowledgeUsageHistory(
  db: Database.Database,
  knowledgeId: string,
  limit: number = 50,
): readonly KnowledgeUsage[] {
  const rows = db.prepare(`
    SELECT * FROM knowledge_usage
    WHERE knowledge_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(knowledgeId, limit) as KnowledgeUsageRow[];

  return rows.map(rowToKnowledgeUsage);
}

export function getSessionKnowledgeUsage(
  db: Database.Database,
  sessionId: string,
): readonly KnowledgeUsage[] {
  const rows = db.prepare(`
    SELECT * FROM knowledge_usage
    WHERE session_id = ?
    ORDER BY timestamp ASC
  `).all(sessionId) as KnowledgeUsageRow[];

  return rows.map(rowToKnowledgeUsage);
}

export function getUsageCountByType(
  db: Database.Database,
  projectPath: string,
  since?: string,
): { surfaced: number; recalled: number; applied: number } {
  const sinceClause = since ? `AND ku.timestamp >= ?` : '';
  const params: unknown[] = [projectPath];
  if (since) {
    params.push(since);
  }

  const rows = db.prepare(`
    SELECT ku.usage_type, COUNT(*) as count
    FROM knowledge_usage ku
    JOIN promoted_knowledge pk ON ku.knowledge_id = pk.knowledge_id
    WHERE pk.project_path = ? ${sinceClause}
    GROUP BY ku.usage_type
  `).all(...params) as Array<{ usage_type: string; count: number }>;

  const result = { surfaced: 0, recalled: 0, applied: 0 };
  for (const row of rows) {
    if (row.usage_type === 'surfaced') result.surfaced = row.count;
    if (row.usage_type === 'recalled') result.recalled = row.count;
    if (row.usage_type === 'applied') result.applied = row.count;
  }

  return result;
}
