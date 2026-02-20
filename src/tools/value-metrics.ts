import { z } from 'zod';
import type Database from 'better-sqlite3';
import { getValueMetrics, computeValueSummary, TIME_SAVINGS } from '../storage/value-metrics.js';
import { getKnowledgeCount } from '../storage/knowledge.js';

export const valueMetricsSchema = {
  projectPath: z.string().describe('Project root path'),
  hourlyRate: z.number().optional().describe('Hourly rate for value calculation (default: $50)'),
};

export function handleValueMetrics(db: Database.Database) {
  return async ({ projectPath, hourlyRate }: {
    projectPath: string;
    hourlyRate?: number;
  }) => {
    try {
      const rate = hourlyRate ?? 50;
      const metrics = getValueMetrics(db, projectPath);

      if (!metrics) {
        return {
          content: [{
            type: 'text' as const,
            text: `No data yet for ${projectPath}. Start a session to begin tracking value.`,
          }],
        };
      }

      const valueSummary = computeValueSummary(db, projectPath, rate);
      const knowledgeCount = getKnowledgeCount(db, projectPath);

      // Format time saved
      const hours = Math.floor(valueSummary.timeSavedMinutes / 60);
      const mins = valueSummary.timeSavedMinutes % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

      const lines = [
        '--- synapse-memory Value Report ---',
        `Project: ${projectPath}`,
        '',
        `Sessions tracked: ${metrics.totalSessions}`,
        `Knowledge items: ${knowledgeCount.total} (${knowledgeCount.byType.decision} decisions, ${knowledgeCount.byType.pattern} patterns, ${knowledgeCount.byType.error_resolved} errors resolved)`,
        '',
        'Value delivered:',
        `  Knowledge surfaced: ${valueSummary.breakdown.knowledgeSurfaced} times across sessions`,
        `  Decisions recalled via search: ${valueSummary.breakdown.decisionsRecalled} times`,
        `  Patterns applied: ${valueSummary.breakdown.patternsApplied} times`,
        `  Errors prevented (same error resolved before): ${valueSummary.breakdown.errorsPrevented} times`,
        '',
        'Time savings estimate:',
        `  ${timeStr} saved (~$${valueSummary.estimatedValueUSD.toFixed(2)} at $${rate}/hr)`,
        '',
        'Calculation basis:',
        `  • Each knowledge surface: ~${TIME_SAVINGS.knowledgeSurface / 60} min saved (context already there)`,
        `  • Each decision recall: ~${TIME_SAVINGS.decisionRecall / 60} min saved (no re-research)`,
        `  • Each pattern application: ~${TIME_SAVINGS.patternApplied / 60} min saved (no re-discovery)`,
        `  • Each error prevention: ~${TIME_SAVINGS.errorPrevented / 60} min saved (no re-debugging)`,
      ];

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    } catch (error: unknown) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to get value metrics: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  };
}
