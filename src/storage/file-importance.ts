import type Database from 'better-sqlite3';
import type { FileImportance } from '../types.js';
import { nowISO } from '../utils.js';

interface FileImportanceRow {
  project_path: string;
  file_path: string;
  read_count: number;
  edit_count: number;
  last_accessed_at: string;
  importance_score: number;
}

function rowToFileImportance(row: FileImportanceRow): FileImportance {
  return {
    projectPath: row.project_path,
    filePath: row.file_path,
    readCount: row.read_count,
    editCount: row.edit_count,
    lastAccessedAt: row.last_accessed_at,
    importanceScore: row.importance_score,
  };
}

/**
 * Compute importance score based on read/edit counts and recency.
 * Edits are weighted 3x reads, with recency decay applied.
 */
export function computeImportanceScore(
  readCount: number,
  editCount: number,
  lastAccessedAt: string,
): number {
  const now = Date.now();
  const lastAccess = new Date(lastAccessedAt).getTime();
  const daysSinceAccess = (now - lastAccess) / (1000 * 60 * 60 * 24);

  // Recency decay: score decays by 50% per 7 days
  const recencyFactor = Math.pow(0.5, daysSinceAccess / 7);

  // Base score: edits weighted 3x reads
  const baseScore = readCount + editCount * 3;

  return baseScore * recencyFactor;
}

export function upsertFileAccess(
  db: Database.Database,
  projectPath: string,
  filePath: string,
  operation: 'read' | 'edit',
): FileImportance {
  const now = nowISO();

  // Get current values or defaults
  const existing = db.prepare(`
    SELECT read_count, edit_count FROM file_importance
    WHERE project_path = ? AND file_path = ?
  `).get(projectPath, filePath) as { read_count: number; edit_count: number } | undefined;

  const readCount = (existing?.read_count ?? 0) + (operation === 'read' ? 1 : 0);
  const editCount = (existing?.edit_count ?? 0) + (operation === 'edit' ? 1 : 0);
  const importanceScore = computeImportanceScore(readCount, editCount, now);

  db.prepare(`
    INSERT INTO file_importance (project_path, file_path, read_count, edit_count, last_accessed_at, importance_score)
    VALUES (@project_path, @file_path, @read_count, @edit_count, @last_accessed_at, @importance_score)
    ON CONFLICT(project_path, file_path) DO UPDATE SET
      read_count = @read_count,
      edit_count = @edit_count,
      last_accessed_at = @last_accessed_at,
      importance_score = @importance_score
  `).run({
    project_path: projectPath,
    file_path: filePath,
    read_count: readCount,
    edit_count: editCount,
    last_accessed_at: now,
    importance_score: importanceScore,
  });

  return {
    projectPath,
    filePath,
    readCount,
    editCount,
    lastAccessedAt: now,
    importanceScore,
  };
}

export function getImportantFiles(
  db: Database.Database,
  projectPath: string,
  limit: number = 10,
): readonly FileImportance[] {
  const rows = db.prepare(`
    SELECT * FROM file_importance
    WHERE project_path = ?
    ORDER BY importance_score DESC
    LIMIT ?
  `).all(projectPath, limit) as FileImportanceRow[];

  return rows.map(rowToFileImportance);
}

export function refreshImportanceScores(
  db: Database.Database,
  projectPath: string,
): number {
  const rows = db.prepare(`
    SELECT * FROM file_importance WHERE project_path = ?
  `).all(projectPath) as FileImportanceRow[];

  let updated = 0;
  for (const row of rows) {
    const newScore = computeImportanceScore(
      row.read_count,
      row.edit_count,
      row.last_accessed_at,
    );

    if (Math.abs(newScore - row.importance_score) > 0.01) {
      db.prepare(`
        UPDATE file_importance
        SET importance_score = ?
        WHERE project_path = ? AND file_path = ?
      `).run(newScore, projectPath, row.file_path);
      updated++;
    }
  }

  return updated;
}
