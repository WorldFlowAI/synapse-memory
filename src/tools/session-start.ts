import { z } from 'zod';
import type Database from 'better-sqlite3';
import {
  createSession,
  abandonStaleSessions,
  getRecentSessions,
} from '../storage/sessions.js';
import { getSessionEvents } from '../storage/events.js';
import { getProjectKnowledge } from '../storage/knowledge.js';
import { upsertAgent } from '../storage/agents.js';
import { getImportantFiles } from '../storage/file-importance.js';
import { recordKnowledgeUsage } from '../storage/knowledge-usage.js';
import {
  incrementSessionCount,
  incrementKnowledgeSurfaced,
  incrementContextReuse,
  computeValueSummary,
} from '../storage/value-metrics.js';
import { rankSessions, rankKnowledge } from '../context/scoring.js';
import {
  generateId,
  nowISO,
  getGitBranch,
  getGitHead,
  detectAgentType,
  getAgentVersion,
  getAgentDisplayName,
} from '../utils.js';
import type { AgentType, Session } from '../types.js';

export const sessionStartSchema = {
  projectPath: z.string().describe('Working directory / project root path'),
  branch: z.string().optional().describe('Git branch name (auto-detected if omitted)'),
  gitCommit: z.string().optional().describe('Current HEAD commit SHA'),
  agentType: z.enum(['claude-code', 'cursor', 'aider', 'openclaw', 'unknown'])
    .optional()
    .describe('AI agent calling this tool'),
  agentVersion: z.string().optional().describe('Version of the AI agent'),
};

export function handleSessionStart(db: Database.Database) {
  return async ({ projectPath, branch, gitCommit, agentType, agentVersion }: {
    projectPath: string;
    branch?: string;
    gitCommit?: string;
    agentType?: AgentType;
    agentVersion?: string;
  }) => {
    try {
      const now = nowISO();

      const abandoned = abandonStaleSessions(db, projectPath, now);

      const resolvedBranch = branch ?? getGitBranch(projectPath);
      const resolvedCommit = gitCommit ?? getGitHead(projectPath);

      // Resolve agent type from parameter or environment
      const resolvedAgentType = agentType ?? detectAgentType();
      const resolvedAgentVersion = agentVersion ?? getAgentVersion();

      // Register/update agent in registry
      upsertAgent(db, resolvedAgentType);

      const session: Session = {
        sessionId: generateId(),
        projectPath,
        branch: resolvedBranch,
        startedAt: now,
        status: 'active',
        gitCommitStart: resolvedCommit,
        agentType: resolvedAgentType,
        agentVersion: resolvedAgentVersion,
      };

      createSession(db, session);

      // Track value metrics
      incrementSessionCount(db, projectPath);

      // Get recent sessions and rank by relevance
      const recentSessions = getRecentSessions(db, projectPath, 10, undefined);
      const rankedSessions = rankSessions(recentSessions, resolvedBranch).slice(0, 5);

      const contextLines: string[] = [
        `Session started: ${session.sessionId}`,
        `Project: ${projectPath}`,
        `Branch: ${resolvedBranch}`,
        `Agent: ${getAgentDisplayName(resolvedAgentType)}${resolvedAgentVersion ? ` (${resolvedAgentVersion})` : ''}`,
      ];

      if (abandoned > 0) {
        contextLines.push(`Cleaned up ${abandoned} stale session(s).`);
      }

      // Show ranked recent sessions
      if (rankedSessions.length > 0) {
        contextLines.push('', '--- Recent Sessions (ranked by relevance) ---');
        incrementContextReuse(db, projectPath);

        for (const { session: s, score } of rankedSessions) {
          const dateStr = s.startedAt.split('T')[0];
          contextLines.push(`[${dateStr}] ${s.summary ?? '(no summary)'} (score: ${score.toFixed(2)})`);

          const decisions = getSessionEvents(db, s.sessionId, 'decision');
          for (const e of decisions) {
            if (e.detail.type === 'decision') {
              contextLines.push(`  Decision: ${e.detail.title}`);
            }
          }
          const patterns = getSessionEvents(db, s.sessionId, 'pattern');
          for (const e of patterns) {
            if (e.detail.type === 'pattern') {
              contextLines.push(`  Pattern: ${e.detail.description}`);
            }
          }
        }
      }

      // Get knowledge and rank by relevance
      const knowledge = getProjectKnowledge(db, projectPath, undefined, 30);
      const rankedKnowledge = rankKnowledge(knowledge, resolvedBranch).slice(0, 15);

      if (rankedKnowledge.length > 0) {
        contextLines.push('', '--- Project Knowledge ---');

        // Track surfacing for value metrics
        incrementKnowledgeSurfaced(db, projectPath, rankedKnowledge.length);

        for (const { knowledge: k } of rankedKnowledge) {
          contextLines.push(`[${k.knowledgeType}] ${k.title}: ${k.content}`);

          // Record that this knowledge was surfaced
          recordKnowledgeUsage(db, k.knowledgeId, session.sessionId, 'surfaced');
        }
      }

      // Show important files
      const importantFiles = getImportantFiles(db, projectPath, 10);
      if (importantFiles.length > 0) {
        contextLines.push('', '--- Important Files ---');
        for (const f of importantFiles) {
          contextLines.push(
            `${f.filePath} (score: ${f.importanceScore.toFixed(1)} | ${f.readCount} reads, ${f.editCount} edits)`,
          );
        }
      }

      // Show value summary
      const valueSummary = computeValueSummary(db, projectPath);
      if (valueSummary.timeSavedMinutes > 0) {
        const hours = Math.floor(valueSummary.timeSavedMinutes / 60);
        const mins = valueSummary.timeSavedMinutes % 60;
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

        contextLines.push('', '--- Value Summary ---');
        contextLines.push(
          `Sessions: ${valueSummary.breakdown.knowledgeSurfaced > 0 ? 'tracked' : '0'} | ` +
          `Knowledge surfaced: ${valueSummary.breakdown.knowledgeSurfaced} times | ` +
          `Time saved: ~${timeStr}`,
        );
      }

      return {
        content: [{ type: 'text' as const, text: contextLines.join('\n') }],
      };
    } catch (error: unknown) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to start session: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  };
}
