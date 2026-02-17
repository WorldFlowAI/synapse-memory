import { z } from 'zod';
import type Database from 'better-sqlite3';
import {
  createSession,
  abandonStaleSessions,
  getRecentSessions,
} from '../storage/sessions.js';
import { getSessionEvents } from '../storage/events.js';
import { getProjectKnowledge } from '../storage/knowledge.js';
import { generateId, nowISO, getGitBranch, getGitHead } from '../utils.js';
import type { Session } from '../types.js';

export const sessionStartSchema = {
  projectPath: z.string().describe('Working directory / project root path'),
  branch: z.string().optional().describe('Git branch name (auto-detected if omitted)'),
  gitCommit: z.string().optional().describe('Current HEAD commit SHA'),
};

export function handleSessionStart(db: Database.Database) {
  return async ({ projectPath, branch, gitCommit }: {
    projectPath: string;
    branch?: string;
    gitCommit?: string;
  }) => {
    try {
      const now = nowISO();

      const abandoned = abandonStaleSessions(db, projectPath, now);

      const resolvedBranch = branch ?? getGitBranch(projectPath);
      const resolvedCommit = gitCommit ?? getGitHead(projectPath);

      const session: Session = {
        sessionId: generateId(),
        projectPath,
        branch: resolvedBranch,
        startedAt: now,
        status: 'active',
        gitCommitStart: resolvedCommit,
      };

      createSession(db, session);

      const recentSessions = getRecentSessions(db, projectPath, 3, resolvedBranch);

      const contextLines: string[] = [
        `Session started: ${session.sessionId}`,
        `Project: ${projectPath}`,
        `Branch: ${resolvedBranch}`,
      ];

      if (abandoned > 0) {
        contextLines.push(`Cleaned up ${abandoned} stale session(s).`);
      }

      if (recentSessions.length > 0) {
        contextLines.push('', '--- Recent Sessions ---');
        for (const s of recentSessions) {
          contextLines.push(`[${s.startedAt}] ${s.summary ?? '(no summary)'}`);
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

      const knowledge = getProjectKnowledge(db, projectPath, undefined, 10);
      if (knowledge.length > 0) {
        contextLines.push('', '--- Project Knowledge ---');
        for (const k of knowledge) {
          contextLines.push(`[${k.knowledgeType}] ${k.title}: ${k.content}`);
        }
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
