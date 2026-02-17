import { z } from 'zod';
import type Database from 'better-sqlite3';
import { insertEvent } from '../storage/events.js';
import { getSession } from '../storage/sessions.js';
import { generateId, nowISO, categorizeEvent, deriveEventType } from '../utils.js';
import type { EventDetail, SessionEvent } from '../types.js';

const fileOpDetailSchema = z.object({
  type: z.literal('file_op'),
  path: z.string(),
  operation: z.enum(['read', 'write', 'edit']),
});

const toolCallDetailSchema = z.object({
  type: z.literal('tool_call'),
  toolName: z.string(),
  params: z.string().optional(),
});

const decisionDetailSchema = z.object({
  type: z.literal('decision'),
  title: z.string(),
  rationale: z.string(),
});

const patternDetailSchema = z.object({
  type: z.literal('pattern'),
  description: z.string(),
  files: z.array(z.string()),
});

const errorResolvedDetailSchema = z.object({
  type: z.literal('error_resolved'),
  error: z.string(),
  resolution: z.string(),
  files: z.array(z.string()),
});

const milestoneDetailSchema = z.object({
  type: z.literal('milestone'),
  summary: z.string(),
});

const detailSchema = z.discriminatedUnion('type', [
  fileOpDetailSchema,
  toolCallDetailSchema,
  decisionDetailSchema,
  patternDetailSchema,
  errorResolvedDetailSchema,
  milestoneDetailSchema,
]);

export const recordEventSchema = {
  sessionId: z.string().describe('Session ID to record event for'),
  eventType: z.enum([
    'file_read', 'file_write', 'file_edit', 'tool_call',
    'decision', 'pattern', 'error_resolved', 'milestone',
  ]).describe('Type of event'),
  detail: detailSchema.describe('Event detail object (shape depends on eventType)'),
};

export function handleRecordEvent(db: Database.Database) {
  return async ({ sessionId, detail }: {
    sessionId: string;
    eventType?: string;
    detail: EventDetail;
  }) => {
    try {
      const session = getSession(db, sessionId);
      if (!session) {
        return {
          content: [{
            type: 'text' as const,
            text: `Session ${sessionId} not found.`,
          }],
          isError: true,
        };
      }

      if (session.status !== 'active') {
        return {
          content: [{
            type: 'text' as const,
            text: `Session ${sessionId} is ${session.status}, not active.`,
          }],
          isError: true,
        };
      }

      const resolvedEventType = deriveEventType(detail);
      const category = categorizeEvent(resolvedEventType);

      const event: SessionEvent = {
        eventId: generateId(),
        sessionId,
        timestamp: nowISO(),
        eventType: resolvedEventType,
        category,
        detail,
      };

      insertEvent(db, event);

      return {
        content: [{
          type: 'text' as const,
          text: `Event recorded: ${resolvedEventType} (${event.eventId})`,
        }],
      };
    } catch (error: unknown) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to record event: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  };
}
