import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { sessionStartSchema, handleSessionStart } from './tools/session-start.js';
import { sessionEndSchema, handleSessionEnd } from './tools/session-end.js';
import { recordEventSchema, handleRecordEvent } from './tools/record-event.js';
import { recallSchema, handleRecall } from './tools/recall.js';
import { statsSchema, handleStats } from './tools/stats.js';
import {
  promoteKnowledgeSchema,
  handlePromoteKnowledge,
  getKnowledgeSchema,
  handleGetKnowledge,
} from './tools/knowledge.js';
import { valueMetricsSchema, handleValueMetrics } from './tools/value-metrics.js';

export function createServer(db: Database.Database): McpServer {
  const server = new McpServer({
    name: 'synapse-memory',
    version: '0.2.0',
  }, {
    capabilities: {
      logging: {},
    },
  });

  // --- Session lifecycle ---

  server.tool(
    'session_start',
    'Start a new coding session. Records the session and returns context from past sessions on this project/branch.',
    sessionStartSchema,
    handleSessionStart(db),
  );

  server.tool(
    'session_end',
    'End the current session. Computes metrics and stores a summary of what was accomplished.',
    sessionEndSchema,
    handleSessionEnd(db),
  );

  // --- Event recording ---

  server.tool(
    'record_event',
    'Record a significant event during a session: file operations, decisions, patterns, errors resolved, or milestones.',
    recordEventSchema,
    handleRecordEvent(db),
  );

  // --- Query & analytics ---

  server.tool(
    'recall',
    'Query past sessions for relevant knowledge: decisions made, patterns discovered, errors resolved.',
    recallSchema,
    handleRecall(db),
  );

  server.tool(
    'stats',
    'Get session analytics for a project: total sessions, time spent, most-touched files, tool usage.',
    statsSchema,
    handleStats(db),
  );

  // --- Knowledge promotion (Synapse integration path) ---

  server.tool(
    'promote_knowledge',
    'Elevate a session finding to project-level knowledge. Promoted knowledge persists across sessions and can optionally sync to a Synapse instance.',
    promoteKnowledgeSchema,
    handlePromoteKnowledge(db),
  );

  server.tool(
    'get_knowledge',
    'Retrieve promoted project-level knowledge: decisions, patterns, error resolutions, and milestones that persist across sessions.',
    getKnowledgeSchema,
    handleGetKnowledge(db),
  );

  // --- Value tracking ---

  server.tool(
    'get_value_metrics',
    'Get value analytics for a project: sessions tracked, knowledge surfaced, time saved estimates.',
    valueMetricsSchema,
    handleValueMetrics(db),
  );

  return server;
}
