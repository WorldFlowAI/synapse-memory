# synapse-memory

MCP server for Claude Code that provides persistent session memory with a clear upgrade path to [Synapse](https://github.com/WorldFlowAI/synapse). Records what happens in each coding session — files touched, tools used, decisions made, patterns discovered — and makes it queryable across sessions. Promotes key findings to project-level knowledge that persists forever. All data stays local in SQLite.

## Install

### Claude Code (quickest)

```bash
claude mcp add synapse-memory -- npx -y synapse-memory
```

### Manual (.mcp.json)

Add to your project's `.mcp.json` or `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "synapse-memory": {
      "command": "npx",
      "args": ["-y", "synapse-memory"]
    }
  }
}
```

## Tools

### `session_start`

Start a new coding session. Automatically detects git branch/commit and returns context from past sessions on the same project.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectPath | string | yes | Working directory |
| branch | string | no | Git branch (auto-detected) |
| gitCommit | string | no | Current HEAD SHA |

### `session_end`

End the current session. Computes metrics and stores a summary.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | string | yes | Session ID from session_start |
| summary | string | no | What was accomplished |
| gitCommit | string | no | HEAD SHA at end |

### `record_event`

Record a significant event during a session.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | string | yes | Active session ID |
| eventType | string | yes | One of: file_read, file_write, file_edit, tool_call, decision, pattern, error_resolved, milestone |
| detail | object | yes | Event detail (shape depends on eventType) |

**Detail shapes:**

- `file_op`: `{ type: "file_op", path: string, operation: "read" | "write" | "edit" }`
- `tool_call`: `{ type: "tool_call", toolName: string, params?: string }`
- `decision`: `{ type: "decision", title: string, rationale: string }`
- `pattern`: `{ type: "pattern", description: string, files: string[] }`
- `error_resolved`: `{ type: "error_resolved", error: string, resolution: string, files: string[] }`
- `milestone`: `{ type: "milestone", summary: string }`

### `recall`

Query past sessions for relevant knowledge.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectPath | string | yes | Project root path |
| query | string | no | Search term |
| branch | string | no | Filter by branch |
| eventType | string | no | Filter by event type |
| limit | number | no | Max results (default 10) |

### `stats`

Session analytics for a project.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectPath | string | yes | Project root path |
| period | string | no | day, week, month, or all (default: week) |

### `promote_knowledge`

Elevate a session finding (decision, pattern, error resolution, milestone) to project-level knowledge that persists across sessions. Promoted knowledge is returned by `session_start` and `get_knowledge`, and can optionally sync to a Synapse instance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectPath | string | yes | Project root path |
| title | string | yes | Short title for this knowledge |
| content | string | yes | Detailed content (rationale, description, etc.) |
| knowledgeType | string | yes | decision, pattern, error_resolved, or milestone |
| tags | string[] | no | Tags for categorization |
| sessionId | string | no | Source session ID |
| sourceEventId | string | no | Source event ID |

### `get_knowledge`

Retrieve promoted project-level knowledge.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectPath | string | yes | Project root path |
| knowledgeType | string | no | Filter by type |
| limit | number | no | Max results (default 20, max 100) |

## Synapse Integration Path

synapse-memory is designed as the local-first entry point to the [Synapse](https://github.com/WorldFlowAI/synapse) platform. The types and schema align with Synapse's Rust types (`synapse-types/src/memory.rs`):

- `PromotedKnowledge` maps to Synapse's `PromotedKnowledge`
- `SessionMetrics` maps to Synapse's `SessionMetrics`
- The `synapse_sync_config` table stores connection details for optional sync

The upgrade path: use synapse-memory locally, promote valuable knowledge, then optionally sync to a hosted Synapse instance for team-wide intelligence.

## Data Storage

All data is stored locally in `~/.synapse-memory/memory.db` (SQLite).

Override the location with the `SYNAPSE_MEMORY_DIR` environment variable:

```bash
SYNAPSE_MEMORY_DIR=/custom/path synapse-memory
```

## Development

```bash
git clone https://github.com/WorldFlowAI/synapse-memory
cd synapse-memory
npm install
npm test
npm run build
```

## License

MIT
