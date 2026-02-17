<p align="center">
  <h1 align="center">synapse-memory</h1>
  <p align="center">
    <strong>Persistent session memory for Claude Code</strong>
  </p>
  <p align="center">
    An <a href="https://modelcontextprotocol.io">MCP</a> server that gives Claude Code a memory that lasts.<br/>
    Every session — files touched, decisions made, patterns discovered — recorded locally in SQLite.<br/>
    Queryable across sessions. Zero infrastructure. Clear upgrade path to <a href="https://github.com/WorldFlowAI/synapse">Synapse</a>.
  </p>
</p>

---

## The Problem

Claude Code starts every session with amnesia. It doesn't know what you decided yesterday, which files you refactored last week, or what patterns your codebase follows. You re-explain context. It re-discovers patterns. You both waste time.

## The Solution

synapse-memory records what happens in each coding session and makes it available at the start of the next one. Decisions persist. Patterns are remembered. Errors that were resolved stay resolved.

```
Session 1: "Let's use the repository pattern for data access."
Session 2: "I see you established the repository pattern last session. I'll follow it."
```

## Quick Start

### One command

```bash
claude mcp add synapse-memory -- npx -y synapse-memory
```

### Or add to `.mcp.json`

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

That's it. No database to run. No API keys. No configuration. Data lives in `~/.synapse-memory/memory.db`.

---

## How It Works

synapse-memory provides **7 MCP tools** organized around a session lifecycle:

```
  session_start ──> record_event (repeat) ──> session_end
       |                                           |
       |  Returns context from past sessions       |  Computes metrics, stores summary
       |  + promoted knowledge                     |
       v                                           v
  ┌─────────────────────────────────────────────────────┐
  │                    SQLite (local)                    │
  │                                                     │
  │  sessions ─── session_events ─── promoted_knowledge  │
  └─────────────────────────────────────────────────────┘
       ^                                           ^
       |                                           |
    recall / stats                        promote_knowledge
    get_knowledge                         (elevate to permanent)
```

### Session Lifecycle

| Tool | Purpose |
|------|---------|
| **`session_start`** | Begin a session. Auto-detects git branch/commit. Returns context from recent sessions and promoted knowledge. |
| **`session_end`** | End a session. Computes metrics (duration, files touched, decisions recorded) and stores a summary. |

### Event Recording

| Tool | Purpose |
|------|---------|
| **`record_event`** | Record significant events during a session: file operations, tool calls, architectural decisions, patterns, error resolutions, milestones. |

### Querying

| Tool | Purpose |
|------|---------|
| **`recall`** | Full-text search across past sessions. Find decisions, patterns, and error resolutions from your project history. |
| **`stats`** | Session analytics: total sessions, time spent, most-touched files, event breakdowns by period. |

### Knowledge Promotion

| Tool | Purpose |
|------|---------|
| **`promote_knowledge`** | Elevate a session finding to project-level knowledge. Promoted knowledge persists permanently and is surfaced at the start of every new session. |
| **`get_knowledge`** | Retrieve promoted knowledge, optionally filtered by type (decision, pattern, error_resolved, milestone). |

---

## Tool Reference

### `session_start`

Start a new coding session. Abandons any stale active sessions for the same project.

```
Input:
  projectPath  string   (required)  Working directory / project root
  branch       string   (optional)  Git branch — auto-detected if omitted
  gitCommit    string   (optional)  Current HEAD SHA — auto-detected if omitted

Output:
  Session ID, project context from recent sessions, promoted knowledge
```

### `session_end`

End the current session with computed metrics.

```
Input:
  sessionId    string   (required)  Session ID from session_start
  summary      string   (optional)  What was accomplished
  gitCommit    string   (optional)  HEAD SHA at session end

Output:
  Session metrics (duration, events by category, files read/modified,
  decisions recorded, patterns discovered, errors resolved)
```

### `record_event`

Record a significant event. The `eventType` is derived from the `detail` object for consistency.

```
Input:
  sessionId    string   (required)  Active session ID
  eventType    string   (required)  file_read | file_write | file_edit | tool_call |
                                    decision | pattern | error_resolved | milestone
  detail       object   (required)  Event-specific detail (see below)
```

**Detail shapes:**

| Type | Shape |
|------|-------|
| File operation | `{ type: "file_op", path: "/src/index.ts", operation: "read" \| "write" \| "edit" }` |
| Tool call | `{ type: "tool_call", toolName: "Bash", params?: "npm test" }` |
| Decision | `{ type: "decision", title: "Use SQLite", rationale: "Zero infrastructure" }` |
| Pattern | `{ type: "pattern", description: "Repository pattern", files: ["/src/storage/"] }` |
| Error resolved | `{ type: "error_resolved", error: "TypeError: ...", resolution: "Added null check", files: ["/src/utils.ts"] }` |
| Milestone | `{ type: "milestone", summary: "Storage layer complete" }` |

### `recall`

Query past sessions for relevant knowledge.

```
Input:
  projectPath  string   (required)  Project root path
  query        string   (optional)  Full-text search term
  branch       string   (optional)  Filter by git branch
  eventType    string   (optional)  Filter by event type
  limit        number   (optional)  Max results (default 10, max 50)

Output:
  Matching sessions with summaries, decisions, patterns, and error resolutions
```

### `stats`

Session analytics for a project.

```
Input:
  projectPath  string   (required)  Project root path
  period       string   (optional)  day | week | month | all (default: week)

Output:
  Total sessions, total time, most-touched files, patterns discovered
```

### `promote_knowledge`

Elevate a session finding to project-level knowledge.

```
Input:
  projectPath    string     (required)  Project root path
  title          string     (required)  Short title
  content        string     (required)  Detailed content
  knowledgeType  string     (required)  decision | pattern | error_resolved | milestone
  tags           string[]   (optional)  Tags for categorization
  sessionId      string     (optional)  Source session ID
  sourceEventId  string     (optional)  Source event ID

Output:
  Confirmation with knowledge ID and total count
```

### `get_knowledge`

Retrieve promoted project-level knowledge.

```
Input:
  projectPath    string   (required)  Project root path
  knowledgeType  string   (optional)  Filter by type
  limit          number   (optional)  Max results (default 20, max 100)

Output:
  Knowledge items with type, title, content, and tags
```

---

## Data Storage

All data stays on your machine. Nothing is sent anywhere.

```
~/.synapse-memory/
  memory.db          # SQLite database (WAL mode)
```

Override the location:

```bash
SYNAPSE_MEMORY_DIR=/custom/path synapse-memory
```

### Schema

The database uses versioned migrations (currently v2):

| Table | Purpose |
|-------|---------|
| `sessions` | Session lifecycle (start, end, status, summary, git refs) |
| `session_events` | Events recorded during sessions (file ops, decisions, patterns, ...) |
| `promoted_knowledge` | Project-level knowledge promoted from sessions |
| `synapse_sync_config` | Connection config for optional Synapse sync (future) |
| `schema_version` | Migration tracking |

---

## Synapse Integration

synapse-memory is the local-first entry point to [Synapse](https://github.com/WorldFlowAI/synapse), a semantic caching layer for LLM applications. The types and schema are designed for a smooth upgrade path:

| synapse-memory | Synapse (Rust) | Alignment |
|----------------|----------------|-----------|
| `PromotedKnowledge` | `synapse-types::PromotedKnowledge` | Field-level mapping |
| `SessionMetrics` | `synapse-types::SessionMetrics` | `eventsTotal` -> `tool_calls_total` |
| `SynapseSessionExport` | Full session export format | Ready for sync API |
| `synapse_sync_config` | Tenant/project model | Stores connection details |

**The upgrade path:**

1. Use synapse-memory locally (you are here)
2. Promote valuable findings to project knowledge
3. Connect to a Synapse instance for team-wide intelligence (coming soon)

---

## Development

```bash
git clone https://github.com/WorldFlowAI/synapse-memory
cd synapse-memory
npm install
npm test              # 71 tests, 88%+ coverage
npm run build         # Compile to dist/
```

### Project Structure

```
src/
  index.ts              # Entry point (stdio transport)
  server.ts             # MCP server setup + tool registration
  types.ts              # Core types (aligned with Synapse)
  utils.ts              # Git helpers, event categorization
  storage/
    database.ts         # SQLite setup + versioned migrations
    sessions.ts         # Session CRUD + metrics
    events.ts           # Event CRUD
    knowledge.ts        # Promoted knowledge CRUD
  tools/
    session-start.ts    # session_start tool
    session-end.ts      # session_end tool
    record-event.ts     # record_event tool
    recall.ts           # recall tool
    stats.ts            # stats tool
    knowledge.ts        # promote_knowledge + get_knowledge tools
tests/
  storage/              # Storage layer tests
  tools/                # Tool handler tests
```

### Manual MCP Test

```bash
npm run build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  SYNAPSE_MEMORY_DIR=/tmp/test node dist/index.js
```

---

## License

[MIT](LICENSE)
