import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectAgentType, getAgentDisplayName, getAgentVersion } from '../../src/utils.js';

describe('agent detection utils', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('detectAgentType', () => {
    it('returns claude-code when CLAUDE_CODE_VERSION is set', () => {
      process.env['CLAUDE_CODE_VERSION'] = '1.0.0';

      expect(detectAgentType()).toBe('claude-code');
    });

    it('returns cursor when CURSOR_VERSION is set', () => {
      process.env['CURSOR_VERSION'] = '0.45.0';

      expect(detectAgentType()).toBe('cursor');
    });

    it('returns aider when AIDER_VERSION is set', () => {
      process.env['AIDER_VERSION'] = '0.50.0';

      expect(detectAgentType()).toBe('aider');
    });

    it('returns openclaw when OPENCLAW_VERSION is set', () => {
      process.env['OPENCLAW_VERSION'] = '1.0.0';

      expect(detectAgentType()).toBe('openclaw');
    });

    it('returns unknown when no agent env var is set', () => {
      delete process.env['CLAUDE_CODE_VERSION'];
      delete process.env['CURSOR_VERSION'];
      delete process.env['AIDER_VERSION'];
      delete process.env['OPENCLAW_VERSION'];

      expect(detectAgentType()).toBe('unknown');
    });

    it('prioritizes claude-code over other agents', () => {
      process.env['CLAUDE_CODE_VERSION'] = '1.0.0';
      process.env['CURSOR_VERSION'] = '0.45.0';

      expect(detectAgentType()).toBe('claude-code');
    });
  });

  describe('getAgentDisplayName', () => {
    it('returns correct display names', () => {
      expect(getAgentDisplayName('claude-code')).toBe('Claude Code');
      expect(getAgentDisplayName('cursor')).toBe('Cursor');
      expect(getAgentDisplayName('aider')).toBe('Aider');
      expect(getAgentDisplayName('openclaw')).toBe('OpenClaw');
      expect(getAgentDisplayName('unknown')).toBe('Unknown Agent');
    });
  });

  describe('getAgentVersion', () => {
    it('returns CLAUDE_CODE_VERSION when set', () => {
      process.env['CLAUDE_CODE_VERSION'] = '1.2.3';

      expect(getAgentVersion()).toBe('1.2.3');
    });

    it('returns CURSOR_VERSION when set', () => {
      process.env['CURSOR_VERSION'] = '0.45.0';

      expect(getAgentVersion()).toBe('0.45.0');
    });

    it('returns undefined when no version env var is set', () => {
      delete process.env['CLAUDE_CODE_VERSION'];
      delete process.env['CURSOR_VERSION'];
      delete process.env['AIDER_VERSION'];
      delete process.env['OPENCLAW_VERSION'];

      expect(getAgentVersion()).toBeUndefined();
    });
  });
});
