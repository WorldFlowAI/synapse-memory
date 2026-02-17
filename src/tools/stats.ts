import { z } from 'zod';
import type Database from 'better-sqlite3';
import { getSessionStats } from '../storage/sessions.js';
import { periodToDate } from '../utils.js';
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
        `Project stats for ${projectPath} (${resolvedPeriod}):`,
        '',
        `Sessions: ${stats.totalSessions}`,
        `Total time: ${formatDuration(stats.totalDurationSecs)}`,
        `Patterns discovered: ${stats.patternsDiscovered}`,
      ];

      if (stats.topFiles.length > 0) {
        lines.push('', 'Most-touched files:');
        for (const f of stats.topFiles) {
          lines.push(`  ${f.path} (${f.count})`);
        }
      }

      if (stats.toolBreakdown.length > 0) {
        lines.push('', 'Event categories:');
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
