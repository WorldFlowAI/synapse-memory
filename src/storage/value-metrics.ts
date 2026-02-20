import type Database from 'better-sqlite3';
import type { ValueMetrics, TimeSavingsEstimates } from '../types.js';
import { nowISO } from '../utils.js';

interface ValueMetricsRow {
  project_path: string;
  total_sessions: number;
  context_reuse_count: number;
  knowledge_surfaced_count: number;
  decisions_recalled_count: number;
  patterns_applied_count: number;
  errors_prevented_count: number;
  estimated_time_saved_secs: number;
  updated_at: string;
}

function rowToValueMetrics(row: ValueMetricsRow): ValueMetrics {
  return {
    projectPath: row.project_path,
    totalSessions: row.total_sessions,
    contextReuseCount: row.context_reuse_count,
    knowledgeSurfacedCount: row.knowledge_surfaced_count,
    decisionsRecalledCount: row.decisions_recalled_count,
    patternsAppliedCount: row.patterns_applied_count,
    errorsPreventedCount: row.errors_prevented_count,
    estimatedTimeSavedSecs: row.estimated_time_saved_secs,
    updatedAt: row.updated_at,
  };
}

// Time savings estimates in seconds
export const TIME_SAVINGS: TimeSavingsEstimates = {
  knowledgeSurface: 60,     // 1 min saved per knowledge surface
  decisionRecall: 180,      // 3 min saved per decision recall
  patternApplied: 300,      // 5 min saved per pattern application
  errorPrevented: 900,      // 15 min saved per error prevention
};

export function ensureValueMetrics(
  db: Database.Database,
  projectPath: string,
): ValueMetrics {
  const existing = getValueMetrics(db, projectPath);
  if (existing) {
    return existing;
  }

  const now = nowISO();
  db.prepare(`
    INSERT INTO value_metrics (project_path, updated_at)
    VALUES (?, ?)
  `).run(projectPath, now);

  return getValueMetrics(db, projectPath)!;
}

export function getValueMetrics(
  db: Database.Database,
  projectPath: string,
): ValueMetrics | undefined {
  const row = db.prepare(`
    SELECT * FROM value_metrics WHERE project_path = ?
  `).get(projectPath) as ValueMetricsRow | undefined;

  return row ? rowToValueMetrics(row) : undefined;
}

export function incrementSessionCount(
  db: Database.Database,
  projectPath: string,
): void {
  ensureValueMetrics(db, projectPath);
  db.prepare(`
    UPDATE value_metrics
    SET total_sessions = total_sessions + 1, updated_at = ?
    WHERE project_path = ?
  `).run(nowISO(), projectPath);
}

export function incrementContextReuse(
  db: Database.Database,
  projectPath: string,
): void {
  ensureValueMetrics(db, projectPath);
  db.prepare(`
    UPDATE value_metrics
    SET context_reuse_count = context_reuse_count + 1, updated_at = ?
    WHERE project_path = ?
  `).run(nowISO(), projectPath);
}

export function incrementKnowledgeSurfaced(
  db: Database.Database,
  projectPath: string,
  count: number = 1,
): void {
  ensureValueMetrics(db, projectPath);
  const timeSaved = count * TIME_SAVINGS.knowledgeSurface;
  db.prepare(`
    UPDATE value_metrics
    SET knowledge_surfaced_count = knowledge_surfaced_count + ?,
        estimated_time_saved_secs = estimated_time_saved_secs + ?,
        updated_at = ?
    WHERE project_path = ?
  `).run(count, timeSaved, nowISO(), projectPath);
}

export function incrementDecisionRecall(
  db: Database.Database,
  projectPath: string,
  count: number = 1,
): void {
  ensureValueMetrics(db, projectPath);
  const timeSaved = count * TIME_SAVINGS.decisionRecall;
  db.prepare(`
    UPDATE value_metrics
    SET decisions_recalled_count = decisions_recalled_count + ?,
        estimated_time_saved_secs = estimated_time_saved_secs + ?,
        updated_at = ?
    WHERE project_path = ?
  `).run(count, timeSaved, nowISO(), projectPath);
}

export function incrementPatternApplied(
  db: Database.Database,
  projectPath: string,
  count: number = 1,
): void {
  ensureValueMetrics(db, projectPath);
  const timeSaved = count * TIME_SAVINGS.patternApplied;
  db.prepare(`
    UPDATE value_metrics
    SET patterns_applied_count = patterns_applied_count + ?,
        estimated_time_saved_secs = estimated_time_saved_secs + ?,
        updated_at = ?
    WHERE project_path = ?
  `).run(count, timeSaved, nowISO(), projectPath);
}

export function incrementErrorPrevented(
  db: Database.Database,
  projectPath: string,
  count: number = 1,
): void {
  ensureValueMetrics(db, projectPath);
  const timeSaved = count * TIME_SAVINGS.errorPrevented;
  db.prepare(`
    UPDATE value_metrics
    SET errors_prevented_count = errors_prevented_count + ?,
        estimated_time_saved_secs = estimated_time_saved_secs + ?,
        updated_at = ?
    WHERE project_path = ?
  `).run(count, timeSaved, nowISO(), projectPath);
}

export function computeValueSummary(
  db: Database.Database,
  projectPath: string,
  hourlyRate: number = 50,
): {
  timeSavedMinutes: number;
  estimatedValueUSD: number;
  breakdown: {
    knowledgeSurfaced: number;
    decisionsRecalled: number;
    patternsApplied: number;
    errorsPrevented: number;
  };
} {
  const metrics = getValueMetrics(db, projectPath);

  if (!metrics) {
    return {
      timeSavedMinutes: 0,
      estimatedValueUSD: 0,
      breakdown: {
        knowledgeSurfaced: 0,
        decisionsRecalled: 0,
        patternsApplied: 0,
        errorsPrevented: 0,
      },
    };
  }

  const timeSavedMinutes = Math.floor(metrics.estimatedTimeSavedSecs / 60);
  const estimatedValueUSD = (metrics.estimatedTimeSavedSecs / 3600) * hourlyRate;

  return {
    timeSavedMinutes,
    estimatedValueUSD: Math.round(estimatedValueUSD * 100) / 100,
    breakdown: {
      knowledgeSurfaced: metrics.knowledgeSurfacedCount,
      decisionsRecalled: metrics.decisionsRecalledCount,
      patternsApplied: metrics.patternsAppliedCount,
      errorsPrevented: metrics.errorsPreventedCount,
    },
  };
}
