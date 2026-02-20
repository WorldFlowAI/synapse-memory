<p align="center">
  <h1 align="center">synapse-memory</h1>
  <p align="center">
    <strong>Persistent session memory for AI coding assistants</strong>
  </p>
  <p align="center">
    An <a href="https://modelcontextprotocol.io">MCP</a> server that gives your AI assistant a memory that lasts.<br/>
    Every session — files touched, decisions made, patterns discovered — recorded locally in SQLite.<br/>
    Works with Claude Code, Cursor, Aider, and any MCP-compatible tool.
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> •
    <a href="#features">Features</a> •
    <a href="#tool-reference">Tool Reference</a> •
    <a href="#roadmap">Roadmap</a>
  </p>
</p>

---

## The Problem

AI coding assistants start every session with amnesia. They don't know what you decided yesterday, which files you refactored last week, or what patterns your codebase follows. You re-explain context. They re-discover patterns. Everyone wastes time.

## The Solution

synapse-memory records what happens in each coding session and makes it available at the start of the next one. Decisions persist. Patterns are remembered. Errors that were resolved stay resolved.

**All data persists in a local SQLite file across sessions, across restarts, forever.** No cloud. No accounts. No infrastructure.

---

## Quick Start

### One command (Claude Code)

```bash
claude mcp add synapse-memory -- npx -y synapse-memory
```

### Or add to your MCP config

**Claude Code** (`~/.claude/mcp.json` or project `.mcp.json`):
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

**Cursor** (Settings → MCP Servers):
```json
{
  "synapse-memory": {
    "command": "npx",
    "args": ["-y", "synapse-memory"]
  }
}
```

That's it. No database to run. No API keys. No configuration. Data lives in `~/.synapse-memory/memory.db`.

---

## Features

### v0.2 Highlights

| Feature | Description |
|---------|-------------|
| **Multi-Agent Support** | Works with Claude Code, Cursor, Aider, OpenClaw — any MCP client |
| **Value Analytics** | Track how much time synapse-memory saves you |
| **Smart Context Ranking** | Branch-aware scoring ranks recent, relevant sessions higher |
| **Duplicate Detection** | Prevents promoting identical or near-duplicate knowledge |
| **File Importance** | Tracks which files matter most based on access patterns |
| **Agent Usage Stats** | See which AI tools you use and how often |

### Cross-Session Memory in Action

```
┌─────────────────────── SESSION 1 ───────────────────────┐
│                                                         │
│  > session_start({projectPath: "/myapp"})               │
│  Session started: a1b2c3d4                              │
│  Agent: Claude Code                                     │
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
│               functions. Never access db directly.",    │
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
│  Agent: Cursor                                          │
│                                                         │
│  --- Recent Sessions (ranked by relevance) ---          │
│  [2026-02-16] Built storage layer (score: 0.95)         │
│    Decision: Use repository pattern                     │
│    Pattern: Immutable return types with readonly        │
│                                                         │
│  --- Project Knowledge ---                              │
│  [decision] Use repository pattern: All data access     │
│    through repository functions.                        │
│                                                         │
│  --- Important Files ---                                │
│  src/storage/sessions.ts (score: 2.4 | 15 reads)        │
│  src/utils.ts (score: 1.8 | 10 reads, 5 edits)          │
│                                                         │
│  --- Value Summary ---                                  │
│  Sessions: tracked | Knowledge surfaced: 5 | ~15m saved │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Session 2 automatically surfaces decisions, patterns, important files, and promoted knowledge from Session 1 — regardless of which AI tool you use.

---

## Architecture

```
  session_start ──> record_event (repeat) ──> session_end
       │                                           │
       │  Returns ranked context from              │  Computes metrics,
       │  past sessions + knowledge                │  stores summary
       │                                           │
       ▼                                           ▼
  ┌─────────────────────────────────────────────────────┐
  │                  SQLite (persisted)                 │
  │                ~/.synapse-memory/memory.db          │
  │                                                     │
  │  sessions ─── events ─── knowledge ─── value_metrics│
  │      │                       │                      │
  │  agents ─── file_importance ─── knowledge_usage     │
  └─────────────────────────────────────────────────────┘
       ▲                                           ▲
       │                                           │
    recall / stats                        promote_knowledge
    get_knowledge                         get_value_metrics
```

---

## Tool Reference

synapse-memory provides **8 MCP tools**:

### Session Lifecycle

#### `session_start`

Start a new coding session. Auto-detects git branch, agent type, and returns context from past sessions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | ✓ | Working directory / project root |
| `branch` | string | | Git branch (auto-detected) |
| `gitCommit` | string | | Current HEAD SHA (auto-detected) |
| `agentType` | string | | `claude-code` \| `cursor` \| `aider` \| `openclaw` \| `unknown` |
| `agentVersion` | string | | Version of the AI agent |

**Returns:** Session ID, ranked recent sessions, promoted knowledge, important files, value summary.

#### `session_end`

End the current session with computed metrics.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | ✓ | Session ID from session_start |
| `summary` | string | | What was accomplished |
| `gitCommit` | string | | HEAD SHA at session end |

**Returns:** Session metrics (duration, events, files touched).

### Event Recording

#### `record_event`

Record a significant event during a session. Automatically tracks file importance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | ✓ | Active session ID |
| `eventType` | string | ✓ | Event type (see below) |
| `detail` | object | ✓ | Event-specific detail |

**Event types and detail shapes:**

```typescript
// File operation
{ type: "file_op", path: "/src/index.ts", operation: "read" | "write" | "edit" }

// Tool call
{ type: "tool_call", toolName: "Bash", params?: "npm test" }

// Decision
{ type: "decision", title: "Use SQLite", rationale: "Zero infrastructure" }

// Pattern
{ type: "pattern", description: "Repository pattern", files: ["/src/storage/"] }

// Error resolved
{ type: "error_resolved", error: "TypeError...", resolution: "Added null check", files: [...] }

// Milestone
{ type: "milestone", summary: "Storage layer complete" }
```

### Knowledge Management

#### `promote_knowledge`

Elevate a session finding to project-level knowledge. Includes duplicate detection.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | ✓ | Project root path |
| `title` | string | ✓ | Short title |
| `content` | string | ✓ | Detailed content |
| `knowledgeType` | string | ✓ | `decision` \| `pattern` \| `error_resolved` \| `milestone` |
| `tags` | string[] | | Tags for categorization |
| `sessionId` | string | | Source session ID |
| `allowDuplicate` | boolean | | Force promotion even if duplicate detected |
| `supersedes` | string | | Knowledge ID this supersedes |

**Returns:** Confirmation with knowledge ID, or duplicate warning if similar knowledge exists.

#### `get_knowledge`

Retrieve promoted project-level knowledge.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | ✓ | Project root path |
| `knowledgeType` | string | | Filter by type |
| `limit` | number | | Max results (default 20, max 100) |

### Querying & Analytics

#### `recall`

Query past sessions for relevant knowledge with branch-aware scoring.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | ✓ | Project root path |
| `query` | string | | Full-text search term |
| `branch` | string | | Filter by git branch |
| `eventType` | string | | Filter by event type |
| `limit` | number | | Max results (default 10, max 50) |

**Returns:** Ranked sessions with summaries, decisions, and patterns.

#### `stats`

Session analytics with agent usage breakdown.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | ✓ | Project root path |
| `period` | string | | `day` \| `week` \| `month` \| `all` (default: week) |

**Returns:** Session count, time spent, top files, agent usage, value metrics.

#### `get_value_metrics`

Comprehensive value report showing how much time synapse-memory saves you.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | ✓ | Project root path |
| `hourlyRate` | number | | Hourly rate for $ calculation (default: 50) |

**Returns:** Sessions tracked, knowledge surfaced, time saved estimate with breakdown.

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

### Schema (v3)

| Table | Purpose |
|-------|---------|
| `sessions` | Session lifecycle + agent tracking |
| `session_events` | Events recorded during sessions |
| `promoted_knowledge` | Project-level knowledge with deduplication |
| `agents` | Agent registry (Claude Code, Cursor, etc.) |
| `file_importance` | File access tracking and scoring |
| `knowledge_usage` | When knowledge is surfaced/recalled |
| `value_metrics` | Aggregate value tracking per project |
| `synapse_sync_config` | Future Synapse sync configuration |

---

## Roadmap

### v0.1 — Local Session Memory ✅

- [x] Session lifecycle (`session_start`, `session_end`)
- [x] Event recording with 6 event types
- [x] Cross-session context injection
- [x] Full-text search (`recall`)
- [x] Session analytics (`stats`)
- [x] Knowledge promotion system
- [x] Schema versioning with migrations

### v0.2 — Multi-Agent & Value Tracking ✅ (Current)

- [x] **Multi-agent support** — Works with Claude Code, Cursor, Aider, OpenClaw
- [x] **Agent detection** — Auto-detect agent from environment variables
- [x] **Value analytics** — Track knowledge surfaced, time saved, $ value
- [x] **Branch-aware scoring** — Rank context by branch relevance
- [x] **File importance** — Track most-accessed files
- [x] **Duplicate detection** — Prevent redundant knowledge promotion
- [x] **Knowledge supersession** — Mark old knowledge as superseded

### v0.3 — Semantic Search & Embeddings

- [ ] **Local vector search** — Embed session summaries for semantic recall
- [ ] **Similarity-based recall** — "Find sessions similar to what I'm doing now"
- [ ] **Smart context injection** — Auto-suggest past decisions when reading new files
- [ ] **Cross-project knowledge** — Share patterns across related projects

### v0.4 — Team Intelligence (Synapse Sync)

- [ ] **Synapse sync** — Opt-in push to hosted Synapse instance
- [ ] **Team knowledge base** — Query shared team knowledge
- [ ] **Conflict resolution** — Handle contradicting decisions
- [ ] **Knowledge lifecycle** — Deprecate and version knowledge

### v0.5 — Proactive Intelligence

- [ ] **Context prediction** — Predict what context Claude will need
- [ ] **Auto CLAUDE.md** — Generate CLAUDE.md from promoted knowledge
- [ ] **Session templates** — Pre-load context for task types
- [ ] **Regression detection** — Alert on re-introduced errors

### Future

- [ ] **IDE integration** — VS Code / Cursor extension
- [ ] **Analytics dashboard** — Web UI for session history
- [ ] **Plugin system** — Custom event types and extractors

---

## Development

```bash
git clone https://github.com/WorldFlowAI/synapse-memory
cd synapse-memory
npm install
npm test              # 151 tests, 84%+ coverage
npm run build         # Compile to dist/
```

### Project Structure

```
src/
  index.ts              # Entry point (stdio transport)
  server.ts             # MCP server + tool registration
  types.ts              # Core types (Synapse-aligned)
  utils.ts              # Git helpers, agent detection
  storage/
    database.ts         # SQLite + migrations (v3)
    sessions.ts         # Session CRUD + metrics
    events.ts           # Event CRUD
    knowledge.ts        # Knowledge CRUD + dedup
    agents.ts           # Agent registry
    file-importance.ts  # File access tracking
    knowledge-usage.ts  # Usage tracking
    value-metrics.ts    # Value aggregation
  context/
    scoring.ts          # Branch-aware relevance scoring
    deduplication.ts    # Content hashing + duplicate detection
  tools/
    session-start.ts    # session_start
    session-end.ts      # session_end
    record-event.ts     # record_event
    recall.ts           # recall
    stats.ts            # stats
    knowledge.ts        # promote_knowledge + get_knowledge
    value-metrics.ts    # get_value_metrics
tests/
  storage/              # Storage layer tests
  context/              # Scoring + dedup tests
  tools/                # Tool handler tests
  utils/                # Utility tests
```

### Manual MCP Test

```bash
npm run build

# Test session start with agent type
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"session_start","arguments":{"projectPath":"/tmp/test","agentType":"cursor"}}}' | node dist/index.js

# Test value metrics
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_value_metrics","arguments":{"projectPath":"/tmp/test"}}}' | node dist/index.js
```

---

## Synapse Integration

synapse-memory is the local-first entry point to [Synapse](https://github.com/WorldFlowAI/synapse), a semantic caching layer for LLM applications. Types and schema are designed for a smooth upgrade path when team sync features ship in v0.4.

---

## License

[MIT with Commons Clause](LICENSE)

You're free to use, modify, and distribute synapse-memory for any purpose, including commercial use within your organization. The Commons Clause restricts selling synapse-memory as a hosted service that competes with WorldFlow AI's offerings.
