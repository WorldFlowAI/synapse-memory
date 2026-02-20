import { z } from 'zod';
import type Database from 'better-sqlite3';
import { searchSessions, getActiveSession } from '../storage/sessions.js';
import { getSessionEvents, getRecentEvents } from '../storage/events.js';
import { getProjectKnowledge } from '../storage/knowledge.js';
import { recordKnowledgeUsage } from '../storage/knowledge-usage.js';
import { incrementDecisionRecall, incrementPatternApplied } from '../storage/value-metrics.js';
import { rankKnowledge, rankSessions } from '../context/scoring.js';
import { getGitBranch } from '../utils.js';
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

      // Get current branch for scoring
      const currentBranch = branch ?? getGitBranch(projectPath);

      // Get active session for usage tracking
      const activeSession = getActiveSession(db, projectPath);

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

      // If searching for decisions or patterns specifically, also search promoted knowledge
      if (eventType === 'decision' || eventType === 'pattern') {
        const knowledgeType = eventType === 'decision' ? 'decision' : 'pattern';
        const knowledge = getProjectKnowledge(db, projectPath, knowledgeType, maxResults);
        const rankedKnowledge = rankKnowledge(knowledge, currentBranch);

        if (rankedKnowledge.length > 0) {
          lines.push(`Promoted ${knowledgeType}s (${rankedKnowledge.length}, ranked by relevance):`);

          // Track value metrics
          if (knowledgeType === 'decision') {
            incrementDecisionRecall(db, projectPath, rankedKnowledge.length);
          } else {
            incrementPatternApplied(db, projectPath, rankedKnowledge.length);
          }

          for (const { knowledge: k, relevanceScore } of rankedKnowledge) {
            lines.push(`  [${k.knowledgeType}] ${k.title} (score: ${relevanceScore.toFixed(2)})`);
            lines.push(`    ${k.content}`);

            // Record usage if we have an active session
            if (activeSession) {
              recordKnowledgeUsage(db, k.knowledgeId, activeSession.sessionId, 'recalled');
            }
          }
          lines.push('');
        }
      }

      const sessions = searchSessions(db, projectPath, query, branch, maxResults);

      if (sessions.length === 0 && lines.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No sessions found for ${projectPath}${query ? ` matching "${query}"` : ''}.`,
          }],
        };
      }

      if (sessions.length > 0) {
        // Rank sessions by relevance
        const rankedSessions = rankSessions(sessions, currentBranch);

        lines.push(`Found ${sessions.length} session(s) (ranked by relevance):`);
        for (const { session: s, score } of rankedSessions) {
          lines.push('');
          lines.push(`Session: ${s.sessionId} (score: ${score.toFixed(2)})`);
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
