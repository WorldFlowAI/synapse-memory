import type Database from 'better-sqlite3';
import type { AgentType, Session, SessionMetrics } from '../types.js';

interface SessionRow {
  session_id: string;
  project_path: string;
  branch: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  summary: string | null;
  git_commit_start: string | null;
  git_commit_end: string | null;
  agent_type: string;
  agent_version: string | null;
}

function rowToSession(row: SessionRow): Session {
  return {
    sessionId: row.session_id,
    projectPath: row.project_path,
    branch: row.branch,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    status: row.status as Session['status'],
    summary: row.summary ?? undefined,
    gitCommitStart: row.git_commit_start ?? undefined,
    gitCommitEnd: row.git_commit_end ?? undefined,
    agentType: row.agent_type as AgentType,
    agentVersion: row.agent_version ?? undefined,
  };
}

export function createSession(
  db: Database.Database,
  session: Session,
): Session {
  db.prepare(`
    INSERT INTO sessions (session_id, project_path, branch, started_at, status, git_commit_start, agent_type, agent_version)
    VALUES (@session_id, @project_path, @branch, @started_at, @status, @git_commit_start, @agent_type, @agent_version)
  `).run({
    session_id: session.sessionId,
    project_path: session.projectPath,
    branch: session.branch,
    started_at: session.startedAt,
    status: session.status,
    git_commit_start: session.gitCommitStart ?? null,
    agent_type: session.agentType ?? 'unknown',
    agent_version: session.agentVersion ?? null,
  });

  return session;
}

export function endSession(
  db: Database.Database,
  sessionId: string,
  endedAt: string,
  summary?: string,
  gitCommitEnd?: string,
): Session | undefined {
  const result = db.prepare(`
    UPDATE sessions
    SET ended_at = @ended_at,
        status = 'completed',
        summary = @summary,
        git_commit_end = @git_commit_end
    WHERE session_id = @session_id AND status = 'active'
  `).run({
    session_id: sessionId,
    ended_at: endedAt,
    summary: summary ?? null,
    git_commit_end: gitCommitEnd ?? null,
  });

  if (result.changes === 0) {
    return undefined;
  }

  return getSession(db, sessionId);
}

export function abandonStaleSessions(
  db: Database.Database,
  projectPath: string,
  endedAt: string,
): number {
  const result = db.prepare(`
    UPDATE sessions
    SET ended_at = @ended_at, status = 'abandoned'
    WHERE project_path = @project_path AND status = 'active'
  `).run({
    project_path: projectPath,
    ended_at: endedAt,
  });

  return result.changes;
}

export function getSession(
  db: Database.Database,
  sessionId: string,
): Session | undefined {
  const row = db.prepare(`
    SELECT * FROM sessions WHERE session_id = ?
  `).get(sessionId) as SessionRow | undefined;

  return row ? rowToSession(row) : undefined;
}

export function getActiveSession(
  db: Database.Database,
  projectPath: string,
): Session | undefined {
  const row = db.prepare(`
    SELECT * FROM sessions
    WHERE project_path = ? AND status = 'active'
    ORDER BY started_at DESC
    LIMIT 1
  `).get(projectPath) as SessionRow | undefined;

  return row ? rowToSession(row) : undefined;
}

export function getRecentSessions(
  db: Database.Database,
  projectPath: string,
  limit: number = 10,
  branch?: string,
): readonly Session[] {
  const query = branch
    ? `SELECT * FROM sessions
       WHERE project_path = ? AND branch = ? AND status = 'completed'
       ORDER BY started_at DESC LIMIT ?`
    : `SELECT * FROM sessions
       WHERE project_path = ? AND status = 'completed'
       ORDER BY started_at DESC LIMIT ?`;

  const params = branch
    ? [projectPath, branch, limit]
    : [projectPath, limit];

  const rows = db.prepare(query).all(...params) as SessionRow[];
  return rows.map(rowToSession);
}

export function searchSessions(
  db: Database.Database,
  projectPath: string,
  query?: string,
  branch?: string,
  limit: number = 10,
): readonly Session[] {
  if (query) {
    const likePattern = `%${query}%`;
    const baseQuery = branch
      ? `SELECT * FROM sessions
         WHERE project_path = ? AND branch = ? AND summary LIKE ?
         ORDER BY started_at DESC LIMIT ?`
      : `SELECT * FROM sessions
         WHERE project_path = ? AND summary LIKE ?
         ORDER BY started_at DESC LIMIT ?`;

    const params = branch
      ? [projectPath, branch, likePattern, limit]
      : [projectPath, likePattern, limit];

    const rows = db.prepare(baseQuery).all(...params) as SessionRow[];
    return rows.map(rowToSession);
  }

  return getRecentSessions(db, projectPath, limit, branch);
}

export function computeMetrics(
  db: Database.Database,
  sessionId: string,
): SessionMetrics | undefined {
  const session = getSession(db, sessionId);
  if (!session) {
    return undefined;
  }

  const endTime = session.endedAt ?? new Date().toISOString();
  const durationSecs = Math.floor(
    (new Date(endTime).getTime() - new Date(session.startedAt).getTime()) / 1000,
  );

  const categoryCounts = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM session_events
    WHERE session_id = ?
    GROUP BY category
  `).all(sessionId) as Array<{ category: string; count: number }>;

  const eventTypeCounts = db.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM session_events
    WHERE session_id = ?
    GROUP BY event_type
  `).all(sessionId) as Array<{ event_type: string; count: number }>;

  const fileReadCount = db.prepare(`
    SELECT COUNT(DISTINCT json_extract(detail_json, '$.path')) as count
    FROM session_events
    WHERE session_id = ? AND event_type = 'file_read'
  `).get(sessionId) as { count: number };

  const fileModifiedCount = db.prepare(`
    SELECT COUNT(DISTINCT json_extract(detail_json, '$.path')) as count
    FROM session_events
    WHERE session_id = ? AND event_type IN ('file_write', 'file_edit')
  `).get(sessionId) as { count: number };

  const countByCategory = (cat: string): number =>
    categoryCounts.find((c) => c.category === cat)?.count ?? 0;

  const countByType = (t: string): number =>
    eventTypeCounts.find((c) => c.event_type === t)?.count ?? 0;

  const eventsTotal = categoryCounts.reduce((sum, c) => sum + c.count, 0);

  return {
    sessionId,
    durationSecs,
    eventsTotal,
    eventsByCategory: {
      read: countByCategory('read'),
      search: countByCategory('search'),
      edit: countByCategory('edit'),
      execute: countByCategory('execute'),
      agent: countByCategory('agent'),
      other: countByCategory('other'),
    },
    filesRead: fileReadCount.count,
    filesModified: fileModifiedCount.count,
    decisionsRecorded: countByType('decision'),
    patternsDiscovered: countByType('pattern'),
    errorsResolved: countByType('error_resolved'),
  };
}

export function getSessionStats(
  db: Database.Database,
  projectPath: string,
  since?: string,
): {
  totalSessions: number;
  totalDurationSecs: number;
  topFiles: readonly { path: string; count: number }[];
  toolBreakdown: readonly { category: string; count: number }[];
  patternsDiscovered: number;
} {
  const sinceClause = since ? `AND s.started_at >= ?` : '';
  const params: unknown[] = [projectPath];
  if (since) {
    params.push(since);
  }

  const sessionStats = db.prepare(`
    SELECT
      COUNT(*) as total_sessions,
      COALESCE(SUM(
        CASE WHEN ended_at IS NOT NULL
          THEN (julianday(ended_at) - julianday(started_at)) * 86400
          ELSE 0
        END
      ), 0) as total_duration
    FROM sessions s
    WHERE s.project_path = ? ${sinceClause}
  `).get(...params) as { total_sessions: number; total_duration: number };

  const topFiles = db.prepare(`
    SELECT json_extract(e.detail_json, '$.path') as path, COUNT(*) as count
    FROM session_events e
    JOIN sessions s ON e.session_id = s.session_id
    WHERE s.project_path = ? ${sinceClause}
      AND e.event_type IN ('file_read', 'file_write', 'file_edit')
      AND json_extract(e.detail_json, '$.path') IS NOT NULL
    GROUP BY path
    ORDER BY count DESC
    LIMIT 10
  `).all(...params) as Array<{ path: string; count: number }>;

  const toolBreakdown = db.prepare(`
    SELECT e.category, COUNT(*) as count
    FROM session_events e
    JOIN sessions s ON e.session_id = s.session_id
    WHERE s.project_path = ? ${sinceClause}
    GROUP BY e.category
    ORDER BY count DESC
  `).all(...params) as Array<{ category: string; count: number }>;

  const patternCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM session_events e
    JOIN sessions s ON e.session_id = s.session_id
    WHERE s.project_path = ? ${sinceClause}
      AND e.event_type = 'pattern'
  `).get(...params) as { count: number };

  return {
    totalSessions: sessionStats.total_sessions,
    totalDurationSecs: Math.floor(sessionStats.total_duration),
    topFiles,
    toolBreakdown,
    patternsDiscovered: patternCount.count,
  };
}
