import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const CURRENT_SCHEMA_VERSION = 3;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT 'main',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      summary TEXT,
      git_commit_start TEXT,
      git_commit_end TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_events (
      event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(session_id),
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON session_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
    CREATE INDEX IF NOT EXISTS idx_sessions_branch ON sessions(project_path, branch);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  `,

  // v2: Synapse integration path — promoted knowledge + sync config
  2: `
    CREATE TABLE IF NOT EXISTS promoted_knowledge (
      knowledge_id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      session_id TEXT REFERENCES sessions(session_id),
      source_event_id TEXT REFERENCES session_events(event_id),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      knowledge_type TEXT NOT NULL DEFAULT 'decision',
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      synapse_knowledge_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_project
      ON promoted_knowledge(project_path);
    CREATE INDEX IF NOT EXISTS idx_knowledge_type
      ON promoted_knowledge(knowledge_type);
    CREATE INDEX IF NOT EXISTS idx_knowledge_synced
      ON promoted_knowledge(synced_at);

    CREATE TABLE IF NOT EXISTS synapse_sync_config (
      project_path TEXT PRIMARY KEY,
      synapse_endpoint TEXT,
      synapse_project_id TEXT,
      tenant_id TEXT,
      api_key_env_var TEXT NOT NULL DEFAULT 'SYNAPSE_API_KEY',
      auto_sync_promoted BOOLEAN NOT NULL DEFAULT 0,
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `,

  // v3: Multi-agent support + value tracking + deduplication
  3: `
    -- Agent tracking on sessions
    ALTER TABLE sessions ADD COLUMN agent_type TEXT NOT NULL DEFAULT 'unknown';
    ALTER TABLE sessions ADD COLUMN agent_version TEXT;

    -- Agent registry for statistics
    CREATE TABLE IF NOT EXISTS agents (
      agent_type TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      total_sessions INTEGER NOT NULL DEFAULT 0
    );

    -- Track file access frequency for importance scoring
    CREATE TABLE IF NOT EXISTS file_importance (
      project_path TEXT NOT NULL,
      file_path TEXT NOT NULL,
      read_count INTEGER NOT NULL DEFAULT 0,
      edit_count INTEGER NOT NULL DEFAULT 0,
      last_accessed_at TEXT NOT NULL,
      importance_score REAL NOT NULL DEFAULT 0.0,
      PRIMARY KEY (project_path, file_path)
    );

    CREATE INDEX IF NOT EXISTS idx_file_importance_project
      ON file_importance(project_path);
    CREATE INDEX IF NOT EXISTS idx_file_importance_score
      ON file_importance(project_path, importance_score DESC);

    -- Track when knowledge is surfaced/recalled (proves value)
    CREATE TABLE IF NOT EXISTS knowledge_usage (
      usage_id TEXT PRIMARY KEY,
      knowledge_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      usage_type TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_usage_knowledge
      ON knowledge_usage(knowledge_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_usage_session
      ON knowledge_usage(session_id);

    -- Aggregate value metrics per project
    CREATE TABLE IF NOT EXISTS value_metrics (
      project_path TEXT PRIMARY KEY,
      total_sessions INTEGER NOT NULL DEFAULT 0,
      context_reuse_count INTEGER NOT NULL DEFAULT 0,
      knowledge_surfaced_count INTEGER NOT NULL DEFAULT 0,
      decisions_recalled_count INTEGER NOT NULL DEFAULT 0,
      patterns_applied_count INTEGER NOT NULL DEFAULT 0,
      errors_prevented_count INTEGER NOT NULL DEFAULT 0,
      estimated_time_saved_secs INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Extend promoted_knowledge for dedup + branch awareness
    ALTER TABLE promoted_knowledge ADD COLUMN branch TEXT;
    ALTER TABLE promoted_knowledge ADD COLUMN content_hash TEXT;
    ALTER TABLE promoted_knowledge ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE promoted_knowledge ADD COLUMN superseded_by TEXT;

    CREATE INDEX IF NOT EXISTS idx_knowledge_hash
      ON promoted_knowledge(content_hash);
    CREATE INDEX IF NOT EXISTS idx_knowledge_branch
      ON promoted_knowledge(project_path, branch);
  `,
};

function getSchemaVersion(db: Database.Database): number {
  try {
    const row = db.prepare(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1',
    ).get() as { version: number } | undefined;
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const currentVersion = getSchemaVersion(db);

  const migrate = db.transaction(() => {
    for (let v = currentVersion + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
      const sql = MIGRATIONS[v];
      if (!sql) {
        throw new Error(`Missing migration for version ${v}`);
      }
      db.exec(sql);
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(v);
    }
  });

  migrate();
}

export function getDbPath(): string {
  const dir = process.env['SYNAPSE_MEMORY_DIR'] ?? join(homedir(), '.synapse-memory');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'memory.db');
}

export function createDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? getDbPath();
  const db = new Database(path);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);

  return db;
}

export function createInMemoryDatabase(): Database.Database {
  return createDatabase(':memory:');
}
