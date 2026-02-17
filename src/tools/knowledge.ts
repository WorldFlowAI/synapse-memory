import { z } from 'zod';
import type Database from 'better-sqlite3';
import { insertKnowledge, getProjectKnowledge } from '../storage/knowledge.js';
import { generateId, nowISO } from '../utils.js';
import type { PromotedKnowledge, KnowledgeType } from '../types.js';

export const promoteKnowledgeSchema = {
  projectPath: z.string().describe('Project root path'),
  title: z.string().describe('Short title for this knowledge'),
  content: z.string().describe('Detailed content (decision rationale, pattern description, etc.)'),
  knowledgeType: z.enum(['decision', 'pattern', 'error_resolved', 'milestone'])
    .describe('Type of knowledge'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
  sessionId: z.string().optional().describe('Source session ID'),
  sourceEventId: z.string().optional().describe('Source event ID'),
};

export function handlePromoteKnowledge(db: Database.Database) {
  return async ({ projectPath, title, content, knowledgeType, tags, sessionId, sourceEventId }: {
    projectPath: string;
    title: string;
    content: string;
    knowledgeType: KnowledgeType;
    tags?: string[];
    sessionId?: string;
    sourceEventId?: string;
  }) => {
    try {
      const knowledge: PromotedKnowledge = {
        knowledgeId: generateId(),
        projectPath,
        sessionId,
        sourceEventId,
        title,
        content,
        knowledgeType,
        tags: tags ?? [],
        createdAt: nowISO(),
      };

      insertKnowledge(db, knowledge);

      const existing = getProjectKnowledge(db, projectPath, undefined, 100);
      const lines = [
        `Knowledge promoted: ${title} (${knowledge.knowledgeId})`,
        `Type: ${knowledgeType}`,
        '',
        `Project now has ${existing.length} promoted knowledge item(s).`,
      ];

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    } catch (error: unknown) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to promote knowledge: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  };
}

export const getKnowledgeSchema = {
  projectPath: z.string().describe('Project root path'),
  knowledgeType: z.enum(['decision', 'pattern', 'error_resolved', 'milestone'])
    .optional()
    .describe('Filter by knowledge type'),
  limit: z.number().min(1).max(100).optional().describe('Max results (default 20)'),
};

export function handleGetKnowledge(db: Database.Database) {
  return async ({ projectPath, knowledgeType, limit }: {
    projectPath: string;
    knowledgeType?: KnowledgeType;
    limit?: number;
  }) => {
    try {
      const maxResults = limit ?? 20;
      const items = getProjectKnowledge(db, projectPath, knowledgeType, maxResults);

      if (items.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No promoted knowledge found for ${projectPath}.`,
          }],
        };
      }

      const lines = [`Project knowledge (${items.length} items):`];
      for (const k of items) {
        lines.push('');
        lines.push(`[${k.knowledgeType}] ${k.title}`);
        lines.push(`  ${k.content}`);
        if (k.tags.length > 0) {
          lines.push(`  Tags: ${k.tags.join(', ')}`);
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    } catch (error: unknown) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to get knowledge: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  };
}
