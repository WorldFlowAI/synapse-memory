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

**All data persists in a local SQLite file across sessions, across restarts, forever.** No cloud. No accounts. No infrastructure.

### Cross-Session in Action

Here's what actually happens when synapse-memory is connected:

```
┌─────────────────────── SESSION 1 ───────────────────────┐
│                                                         │
│  > session_start({projectPath: "/myapp"})               │
│  Session started: a1b2c3d4                              │
│                                                         │
│  > record_event({                                       │
│      detail: { type: "decision",                        │
│        title: "Use repository pattern",                 │
│        rationale: "Clean data access separation" }      │
│    })                                                   │
│  Event recorded: decision                               │
│                                                         │
│  > promote_knowledge({                                  │
│      title: "Use repository pattern",                   │
│      content: "All data access through repository       │
│               functions. Never access db directly.",     │
│      knowledgeType: "decision"                          │
│    })                                                   │
│  Knowledge promoted.                                    │
│                                                         │
│  > session_end({                                        │
│      summary: "Built storage layer with repo pattern"   │
│    })                                                   │
│  Session completed. Duration: 45 min. Events: 12.       │
│                                                         │
└─────────────────────────────────────────────────────────┘

  ════════════════ Time passes. New day. ════════════════

┌─────────────────────── SESSION 2 ───────────────────────┐
│                                                         │
│  > session_start({projectPath: "/myapp"})               │
│                                                         │
│  Session started: e5f6g7h8                              │
│  Project: /myapp                                        │
│  Branch: main                                           │
│                                                         │
│  --- Recent Sessions ---                                │
│  [2026-02-16] Built storage layer with repo pattern     │
│    Decision: Use repository pattern                     │
│    Pattern: Immutable return types with readonly         │
│                                                         │
│  --- Project Knowledge ---                              │
│  [decision] Use repository pattern: All data access     │
│    through repository functions. Never access db        │
│    directly.                                            │
│                                                         │
│  Claude now knows what happened yesterday.              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

This is real output. Session 2 automatically surfaces decisions, patterns, and promoted knowledge from Session 1 — with no manual context passing.

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
       │                                           │
       │  Returns context from past sessions       │  Computes metrics, stores summary
       │  + promoted knowledge                     │
       ▼                                           ▼
  ┌─────────────────────────────────────────────────────┐
  │                  SQLite (persisted)                   │
  │                ~/.synapse-memory/memory.db            │
  │                                                     │
  │  sessions ─── session_events ─── promoted_knowledge  │
  └─────────────────────────────────────────────────────┘
       ▲                                           ▲
       │                                           │
    recall / stats                        promote_knowledge
    get_knowledge                         (elevate to permanent)
```

**Key insight:** `session_start` reads from the database. `session_end` writes to it. The SQLite file bridges the gap between sessions — that's the entire trick. No external service needed.

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
  memory.db          # SQLite database (WAL mode, persists across sessions)
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

---

## Roadmap

### v0.1 — Local Session Memory (current)

- [x] Session lifecycle (`session_start`, `session_end`)
- [x] Event recording with 6 event types (file ops, decisions, patterns, errors, milestones, tool calls)
- [x] Cross-session context via `session_start` (recent sessions + decisions + patterns)
- [x] Full-text search across sessions (`recall`)
- [x] Session analytics by period (`stats`)
- [x] Knowledge promotion to project-level persistence
- [x] Schema versioning with migration system
- [x] Synapse-aligned types for future integration

### v0.2 — Smarter Context & Auto-Recording

- [ ] **Auto-session hooks** — Claude Code hook integration to auto-start/end sessions without manual tool calls
- [ ] **Intelligent context budget** — Rank and trim returned context to fit within token budgets
- [ ] **Branch-aware recall** — Weight results by branch relevance (same branch > main > other)
- [ ] **File importance scoring** — Track which files are most frequently read/edited and surface them proactively
- [ ] **Duplicate detection** — Deduplicate similar decisions and patterns across sessions

### v0.3 — Semantic Search & Embeddings

- [ ] **Local vector search** — Embed session summaries and knowledge using a local model for semantic recall
- [ ] **Similarity-based recall** — "Find sessions similar to what I'm doing now" using embedding similarity
- [ ] **Smart context injection** — Automatically suggest relevant past decisions when Claude reads files it hasn't seen before
- [ ] **Cross-project knowledge** — Share patterns and decisions across related projects

### v0.4 — Team Intelligence (Synapse Sync)

- [ ] **Synapse sync** — Opt-in push of promoted knowledge to a hosted Synapse instance
- [ ] **Team knowledge base** — Query knowledge from your team's shared Synapse instance
- [ ] **Conflict resolution** — Handle knowledge conflicts when multiple developers promote contradicting decisions
- [ ] **Knowledge lifecycle** — Deprecate, supersede, and version knowledge over time

### v0.5 — Proactive Intelligence

- [ ] **Context prediction** — Predict which files and context Claude will need based on the task description and past session patterns
- [ ] **Auto CLAUDE.md generation** — Generate and update CLAUDE.md files from promoted knowledge and discovered patterns
- [ ] **Session templates** — Pre-load context for common task types (bug fix, feature, refactor) based on historical patterns
- [ ] **Regression detection** — Alert when a new session re-introduces a previously resolved error

### Future

- [ ] **Multi-agent coordination** — Share session context between concurrent Claude Code instances working on the same project
- [ ] **IDE integration** — VS Code / Cursor extension for visualizing session history and knowledge graph
- [ ] **Analytics dashboard** — Web UI for exploring session history, patterns, and productivity metrics
- [ ] **Plugin system** — Custom event types and knowledge extractors for domain-specific workflows

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
