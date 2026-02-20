import { z } from 'zod';
import type Database from 'better-sqlite3';
import { insertKnowledge, getProjectKnowledge } from '../storage/knowledge.js';
import { getSession } from '../storage/sessions.js';
import { findDuplicates, computeContentHash, markSuperseded } from '../context/deduplication.js';
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
  allowDuplicate: z.boolean().optional().describe('Force promotion even if duplicate detected'),
  supersedes: z.string().optional().describe('Knowledge ID this supersedes (marks old as superseded)'),
};

export function handlePromoteKnowledge(db: Database.Database) {
  return async ({ projectPath, title, content, knowledgeType, tags, sessionId, sourceEventId, allowDuplicate, supersedes }: {
    projectPath: string;
    title: string;
    content: string;
    knowledgeType: KnowledgeType;
    tags?: string[];
    sessionId?: string;
    sourceEventId?: string;
    allowDuplicate?: boolean;
    supersedes?: string;
  }) => {
    try {
      // Check for duplicates unless explicitly allowed
      if (!allowDuplicate) {
        const duplicates = findDuplicates(db, projectPath, title, content);
        if (duplicates.length > 0) {
          const dup = duplicates[0]!;
          const matchTypeDesc = dup.matchType === 'exact_hash' ? 'identical content' : 'similar title';
          const lines = [
            `Duplicate detected (${matchTypeDesc}, similarity: ${(dup.similarityScore * 100).toFixed(0)}%):`,
            `  Existing: [${dup.existingKnowledge.knowledgeType}] ${dup.existingKnowledge.title}`,
            `  ID: ${dup.existingKnowledge.knowledgeId}`,
            '',
            'To promote anyway, set allowDuplicate: true',
            'To supersede the existing item, set supersedes: "<knowledge_id>"',
          ];

          return {
            content: [{ type: 'text' as const, text: lines.join('\n') }],
          };
        }
      }

      // Compute content hash for future deduplication
      const contentHash = computeContentHash(content);

      // Get branch from session if available
      let branch: string | undefined;
      if (sessionId) {
        const session = getSession(db, sessionId);
        branch = session?.branch;
      }

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
        branch,
        contentHash,
        usageCount: 0,
      };

      insertKnowledge(db, knowledge);

      // Mark old knowledge as superseded if specified
      if (supersedes) {
        markSuperseded(db, supersedes, knowledge.knowledgeId);
      }

      const existing = getProjectKnowledge(db, projectPath, undefined, 100);
      const lines = [
        `Knowledge promoted: ${title} (${knowledge.knowledgeId})`,
        `Type: ${knowledgeType}`,
        branch ? `Branch: ${branch}` : '',
        '',
        `Project now has ${existing.length} promoted knowledge item(s).`,
      ].filter(Boolean);

      if (supersedes) {
        lines.push(`Superseded: ${supersedes}`);
      }

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
        if (k.usageCount && k.usageCount > 0) {
          lines.push(`  Used: ${k.usageCount} time(s)`);
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
