import { z } from 'zod';
import type Database from 'better-sqlite3';
import { searchSessions } from '../storage/sessions.js';
import { getSessionEvents, getRecentEvents } from '../storage/events.js';
import type { EventDetail, EventType } from '../types.js';

export const recallSchema = {
  projectPath: z.string().describe('Project root path to search'),
  query: z.string().optional().describe('Search term for session summaries'),
  branch: z.string().optional().describe('Filter by git branch'),
  eventType: z.enum([
    'file_read', 'file_write', 'file_edit', 'tool_call',
    'decision', 'pattern', 'error_resolved', 'milestone',
  ]).optional().describe('Filter by event type'),
  limit: z.number().min(1).max(50).optional().describe('Max results (default 10)'),
};

export function handleRecall(db: Database.Database) {
  return async ({ projectPath, query, branch, eventType, limit }: {
    projectPath: string;
    query?: string;
    branch?: string;
    eventType?: EventType;
    limit?: number;
  }) => {
    try {
      const maxResults = limit ?? 10;
      const lines: string[] = [];

      if (eventType && !query) {
        const events = getRecentEvents(db, projectPath, eventType, maxResults);
        if (events.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `No ${eventType} events found for ${projectPath}.`,
            }],
          };
        }

        lines.push(`Recent ${eventType} events (${events.length}):`);
        for (const e of events) {
          lines.push(`  [${e.timestamp}] ${formatDetail(e.detail)}`);
        }

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      }

      const sessions = searchSessions(db, projectPath, query, branch, maxResults);

      if (sessions.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No sessions found for ${projectPath}${query ? ` matching "${query}"` : ''}.`,
          }],
        };
      }

      lines.push(`Found ${sessions.length} session(s):`);
      for (const s of sessions) {
        lines.push('');
        lines.push(`Session: ${s.sessionId}`);
        lines.push(`  Branch: ${s.branch} | ${s.startedAt}${s.endedAt ? ` - ${s.endedAt}` : ''}`);
        lines.push(`  Status: ${s.status}`);
        if (s.summary) {
          lines.push(`  Summary: ${s.summary}`);
        }

        if (eventType) {
          const events = getSessionEvents(db, s.sessionId, eventType);
          for (const e of events) {
            lines.push(`  [${e.eventType}] ${formatDetail(e.detail)}`);
          }
        } else {
          const decisions = getSessionEvents(db, s.sessionId, 'decision');
          for (const e of decisions) {
            lines.push(`  [decision] ${formatDetail(e.detail)}`);
          }
          const patterns = getSessionEvents(db, s.sessionId, 'pattern');
          for (const e of patterns) {
            lines.push(`  [pattern] ${formatDetail(e.detail)}`);
          }
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    } catch (error: unknown) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to recall: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  };
}

function formatDetail(detail: EventDetail): string {
  switch (detail.type) {
    case 'file_op':
      return `${detail.operation} ${detail.path}`;
    case 'tool_call':
      return `${detail.toolName}${detail.params ? ` (${detail.params})` : ''}`;
    case 'decision':
      return `${detail.title}: ${detail.rationale}`;
    case 'pattern':
      return `${detail.description}`;
    case 'error_resolved':
      return `${detail.error} -> ${detail.resolution}`;
    case 'milestone':
      return `${detail.summary}`;
  }
}
