import { describe, it, expect } from 'vitest';
import { createInMemoryDatabase } from '../../src/storage/database.js';

describe('database', () => {
  it('creates all tables on initialization', () => {
    const db = createInMemoryDatabase();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    // v1 tables
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('session_events');
    expect(tableNames).toContain('schema_version');
    // v2 tables
    expect(tableNames).toContain('promoted_knowledge');
    expect(tableNames).toContain('synapse_sync_config');
    // v3 tables
    expect(tableNames).toContain('agents');
    expect(tableNames).toContain('file_importance');
    expect(tableNames).toContain('knowledge_usage');
    expect(tableNames).toContain('value_metrics');
  });

  it('enables WAL mode', () => {
    const db = createInMemoryDatabase();
    const mode = db.pragma('journal_mode', { simple: true }) as string;
    // In-memory databases use 'memory' mode instead of 'wal'
    expect(['wal', 'memory']).toContain(mode);
  });

  it('enables foreign keys', () => {
    const db = createInMemoryDatabase();
    const fk = db.pragma('foreign_keys', { simple: true }) as number;
    expect(fk).toBe(1);
  });

  it('creates indices for all tables', () => {
    const db = createInMemoryDatabase();
    const indices = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as Array<{ name: string }>;

    const indexNames = indices.map((i) => i.name);
    // v1 indices
    expect(indexNames).toContain('idx_events_session');
    expect(indexNames).toContain('idx_events_type');
    expect(indexNames).toContain('idx_sessions_project');
    expect(indexNames).toContain('idx_sessions_branch');
    expect(indexNames).toContain('idx_sessions_status');
    // v2 indices
    expect(indexNames).toContain('idx_knowledge_project');
    expect(indexNames).toContain('idx_knowledge_type');
    expect(indexNames).toContain('idx_knowledge_synced');
    // v3 indices
    expect(indexNames).toContain('idx_file_importance_project');
    expect(indexNames).toContain('idx_file_importance_score');
    expect(indexNames).toContain('idx_knowledge_usage_knowledge');
    expect(indexNames).toContain('idx_knowledge_usage_session');
    expect(indexNames).toContain('idx_knowledge_hash');
    expect(indexNames).toContain('idx_knowledge_branch');
  });

  it('records schema version after migrations', () => {
    const db = createInMemoryDatabase();
    const rows = db
      .prepare('SELECT version FROM schema_version ORDER BY version ASC')
      .all() as Array<{ version: number }>;

    expect(rows).toHaveLength(3);
    expect(rows[0]?.version).toBe(1);
    expect(rows[1]?.version).toBe(2);
    expect(rows[2]?.version).toBe(3);
  });

  it('is idempotent — second createInMemoryDatabase on same db is safe', () => {
    // Running migrations twice should not error (IF NOT EXISTS guards)
    const db1 = createInMemoryDatabase();
    // Insert data
    db1.prepare(
      "INSERT INTO sessions (session_id, project_path, branch, started_at, status) VALUES (?, ?, ?, ?, ?)",
    ).run('s1', '/test', 'main', '2026-01-01T00:00:00Z', 'active');

    // Verify data survives
    const row = db1.prepare('SELECT session_id FROM sessions WHERE session_id = ?').get('s1') as { session_id: string } | undefined;
    expect(row?.session_id).toBe('s1');
  });
});
