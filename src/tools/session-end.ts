import { z } from 'zod';
import type Database from 'better-sqlite3';
import { endSession, computeMetrics } from '../storage/sessions.js';
import { nowISO } from '../utils.js';

export const sessionEndSchema = {
  sessionId: z.string().describe('Session ID to end'),
  summary: z.string().optional().describe('Summary of what was accomplished'),
  gitCommit: z.string().optional().describe('HEAD commit SHA at session end'),
};

export function handleSessionEnd(db: Database.Database) {
  return async ({ sessionId, summary, gitCommit }: {
    sessionId: string;
    summary?: string;
    gitCommit?: string;
  }) => {
    try {
      const now = nowISO();

      const session = endSession(db, sessionId, now, summary, gitCommit);
      if (!session) {
        return {
          content: [{
            type: 'text' as const,
            text: `Session ${sessionId} not found or already ended.`,
          }],
          isError: true,
        };
      }

      const metrics = computeMetrics(db, sessionId);
      if (!metrics) {
        return {
          content: [{
            type: 'text' as const,
            text: `Session ${sessionId} ended but metrics could not be computed.`,
          }],
        };
      }

      const durationMin = Math.floor(metrics.durationSecs / 60);
      const lines = [
        `Session ${sessionId} completed.`,
        '',
        `Duration: ${durationMin} min`,
        `Events: ${metrics.eventsTotal}`,
        `Files read: ${metrics.filesRead} | modified: ${metrics.filesModified}`,
        `Decisions: ${metrics.decisionsRecorded} | Patterns: ${metrics.patternsDiscovered}`,
        `Errors resolved: ${metrics.errorsResolved}`,
      ];

      if (summary) {
        lines.push('', `Summary: ${summary}`);
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    } catch (error: unknown) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to end session: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  };
}
