import type Database from 'better-sqlite3';
import type { EventDetail, EventType, SessionEvent } from '../types.js';

interface EventRow {
  event_id: string;
  session_id: string;
  timestamp: string;
  event_type: string;
  category: string;
  detail_json: string;
}

function rowToEvent(row: EventRow): SessionEvent {
  return {
    eventId: row.event_id,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    eventType: row.event_type as EventType,
    category: row.category as SessionEvent['category'],
    detail: JSON.parse(row.detail_json) as EventDetail,
  };
}

export function insertEvent(
  db: Database.Database,
  event: SessionEvent,
): SessionEvent {
  db.prepare(`
    INSERT INTO session_events (event_id, session_id, timestamp, event_type, category, detail_json)
    VALUES (@event_id, @session_id, @timestamp, @event_type, @category, @detail_json)
  `).run({
    event_id: event.eventId,
    session_id: event.sessionId,
    timestamp: event.timestamp,
    event_type: event.eventType,
    category: event.category,
    detail_json: JSON.stringify(event.detail),
  });

  return event;
}

export function getSessionEvents(
  db: Database.Database,
  sessionId: string,
  eventType?: EventType,
): readonly SessionEvent[] {
  const query = eventType
    ? `SELECT * FROM session_events
       WHERE session_id = ? AND event_type = ?
       ORDER BY timestamp ASC`
    : `SELECT * FROM session_events
       WHERE session_id = ?
       ORDER BY timestamp ASC`;

  const params = eventType ? [sessionId, eventType] : [sessionId];
  const rows = db.prepare(query).all(...params) as EventRow[];
  return rows.map(rowToEvent);
}

export function getRecentEvents(
  db: Database.Database,
  projectPath: string,
  eventType?: EventType,
  limit: number = 20,
): readonly SessionEvent[] {
  const query = eventType
    ? `SELECT e.* FROM session_events e
       JOIN sessions s ON e.session_id = s.session_id
       WHERE s.project_path = ? AND e.event_type = ?
       ORDER BY e.timestamp DESC LIMIT ?`
    : `SELECT e.* FROM session_events e
       JOIN sessions s ON e.session_id = s.session_id
       WHERE s.project_path = ?
       ORDER BY e.timestamp DESC LIMIT ?`;

  const params = eventType
    ? [projectPath, eventType, limit]
    : [projectPath, limit];

  const rows = db.prepare(query).all(...params) as EventRow[];
  return rows.map(rowToEvent);
}
