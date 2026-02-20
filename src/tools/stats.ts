import { z } from 'zod';
import type Database from 'better-sqlite3';
import { getSessionStats } from '../storage/sessions.js';
import { getAgentStats } from '../storage/agents.js';
import { getValueMetrics, computeValueSummary } from '../storage/value-metrics.js';
import { periodToDate, getAgentDisplayName } from '../utils.js';
import type { StatsPeriod } from '../types.js';

export const statsSchema = {
  projectPath: z.string().describe('Project root path'),
  period: z.enum(['day', 'week', 'month', 'all'])
    .optional()
    .describe('Time period (default: week)'),
};

export function handleStats(db: Database.Database) {
  return async ({ projectPath, period }: {
    projectPath: string;
    period?: StatsPeriod;
  }) => {
    try {
      const resolvedPeriod = period ?? 'week';
      const since = periodToDate(resolvedPeriod);
      const stats = getSessionStats(db, projectPath, since);

      const lines: string[] = [
        `--- Session Analytics (${resolvedPeriod}) ---`,
        `Sessions: ${stats.totalSessions} | Total time: ${formatDuration(stats.totalDurationSecs)}`,
      ];

      if (stats.topFiles.length > 0) {
        const topFilesStr = stats.topFiles.slice(0, 3).map((f) => `${f.path} (${f.count})`).join(', ');
        lines.push(`Top files: ${topFilesStr}`);
      }

      // Agent usage breakdown
      const agentStats = getAgentStats(db, projectPath, since);
      if (agentStats.length > 0) {
        lines.push('');
        lines.push('--- Agent Usage ---');
        const agentParts = agentStats.map(
          (a) => `${getAgentDisplayName(a.agentType)}: ${a.sessionCount} session(s)`,
        );
        lines.push(agentParts.join(' | '));
      }

      // Value metrics section
      const valueMetrics = getValueMetrics(db, projectPath);
      if (valueMetrics) {
        const valueSummary = computeValueSummary(db, projectPath);

        lines.push('');
        lines.push('--- Value Metrics ---');
        lines.push(`Knowledge surfaced: ${valueSummary.breakdown.knowledgeSurfaced} times`);
        lines.push(`Decisions recalled: ${valueSummary.breakdown.decisionsRecalled} times`);

        if (valueSummary.timeSavedMinutes > 0) {
          const hours = Math.floor(valueSummary.timeSavedMinutes / 60);
          const mins = valueSummary.timeSavedMinutes % 60;
          const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
          lines.push(`Time saved: ~${timeStr}`);
        }
      }

      // Patterns discovered
      if (stats.patternsDiscovered > 0) {
        lines.push('');
        lines.push(`Patterns discovered: ${stats.patternsDiscovered}`);
      }

      // Tool breakdown
      if (stats.toolBreakdown.length > 0) {
        lines.push('');
        lines.push('Event categories:');
        for (const t of stats.toolBreakdown) {
          lines.push(`  ${t.category}: ${t.count}`);
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    } catch (error: unknown) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  };
}

function formatDuration(totalSecs: number): string {
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}
