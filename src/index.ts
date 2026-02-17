#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDatabase } from './storage/database.js';
import { createServer } from './server.js';

async function main() {
  const db = createDatabase();
  const server = createServer(db);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('synapse-memory MCP server running on stdio');
}

main().catch((error: unknown) => {
  console.error('Failed to start synapse-memory:', error);
  process.exit(1);
});
