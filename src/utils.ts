import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import type { EventCategory, EventDetail, EventType } from './types.js';

export function generateId(): string {
  return randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function categorizeEvent(eventType: EventType): EventCategory {
  switch (eventType) {
    case 'file_read':
      return 'read';
    case 'file_write':
    case 'file_edit':
      return 'edit';
    case 'tool_call':
      return 'execute';
    case 'decision':
    case 'pattern':
    case 'error_resolved':
    case 'milestone':
      return 'other';
  }
}

export function deriveEventType(detail: EventDetail): EventType {
  switch (detail.type) {
    case 'file_op':
      return detail.operation === 'read' ? 'file_read'
        : detail.operation === 'write' ? 'file_write'
        : 'file_edit';
    case 'tool_call':
      return 'tool_call';
    case 'decision':
      return 'decision';
    case 'pattern':
      return 'pattern';
    case 'error_resolved':
      return 'error_resolved';
    case 'milestone':
      return 'milestone';
  }
}

export function getGitBranch(cwd: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return 'unknown';
  }
}

export function getGitHead(cwd: string): string | undefined {
  try {
    return execSync('git rev-parse HEAD', {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return undefined;
  }
}

export function periodToDate(period: 'day' | 'week' | 'month' | 'all'): string | undefined {
  if (period === 'all') {
    return undefined;
  }

  const now = new Date();
  switch (period) {
    case 'day':
      now.setDate(now.getDate() - 1);
      break;
    case 'week':
      now.setDate(now.getDate() - 7);
      break;
    case 'month':
      now.setMonth(now.getMonth() - 1);
      break;
  }
  return now.toISOString();
}
