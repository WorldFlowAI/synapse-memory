import type Database from 'better-sqlite3';
import type { AgentInfo, AgentType } from '../types.js';
import { getAgentDisplayName, nowISO } from '../utils.js';

interface AgentRow {
  agent_type: string;
  display_name: string;
  first_seen_at: string;
  last_seen_at: string;
  total_sessions: number;
}

function rowToAgentInfo(row: AgentRow): AgentInfo {
  return {
    agentType: row.agent_type as AgentType,
    displayName: row.display_name,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    totalSessions: row.total_sessions,
  };
}

export function upsertAgent(
  db: Database.Database,
  agentType: AgentType,
): AgentInfo {
  const now = nowISO();
  const displayName = getAgentDisplayName(agentType);

  db.prepare(`
    INSERT INTO agents (agent_type, display_name, first_seen_at, last_seen_at, total_sessions)
    VALUES (@agent_type, @display_name, @now, @now, 1)
    ON CONFLICT(agent_type) DO UPDATE SET
      last_seen_at = @now,
      total_sessions = total_sessions + 1
  `).run({
    agent_type: agentType,
    display_name: displayName,
    now,
  });

  return getAgent(db, agentType)!;
}

export function getAgent(
  db: Database.Database,
  agentType: AgentType,
): AgentInfo | undefined {
  const row = db.prepare(`
    SELECT * FROM agents WHERE agent_type = ?
  `).get(agentType) as AgentRow | undefined;

  return row ? rowToAgentInfo(row) : undefined;
}

export function getAllAgents(
  db: Database.Database,
): readonly AgentInfo[] {
  const rows = db.prepare(`
    SELECT * FROM agents ORDER BY total_sessions DESC
  `).all() as AgentRow[];

  return rows.map(rowToAgentInfo);
}

export function getAgentStats(
  db: Database.Database,
  projectPath: string,
  since?: string,
): readonly { agentType: AgentType; sessionCount: number }[] {
  const sinceClause = since ? `AND started_at >= ?` : '';
  const params: unknown[] = [projectPath];
  if (since) {
    params.push(since);
  }

  const rows = db.prepare(`
    SELECT agent_type, COUNT(*) as session_count
    FROM sessions
    WHERE project_path = ? ${sinceClause}
    GROUP BY agent_type
    ORDER BY session_count DESC
  `).all(...params) as Array<{ agent_type: string; session_count: number }>;

  return rows.map((row) => ({
    agentType: row.agent_type as AgentType,
    sessionCount: row.session_count,
  }));
}
