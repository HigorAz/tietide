import { describe, it, expect } from 'vitest';
import type { WorkflowDefinition } from '@tietide/shared';
import { WORKFLOW_EXPORT_VERSION, WorkflowExportFormatError } from '@tietide/shared';
import {
  buildExportPayload,
  exportFilename,
  parseExport,
  sanitizeFilename,
  serializeExport,
} from './workflowExport';

const makeDefinition = (): WorkflowDefinition => ({
  nodes: [
    {
      id: 'n1',
      type: 'manual_trigger',
      name: 'Manual Trigger',
      position: { x: 100, y: 100 },
      config: {},
    },
    {
      id: 'n2',
      type: 'http_request',
      name: 'HTTP Request',
      position: { x: 300, y: 100 },
      config: { url: 'https://example.com' },
    },
  ],
  edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
});

describe('workflowExport', () => {
  describe('buildExportPayload', () => {
    it('should return an envelope with version, name, definition, and ISO exportedAt', () => {
      const definition = makeDefinition();
      const now = new Date('2026-05-07T10:30:00.000Z');
      const payload = buildExportPayload('My Workflow', definition, now);

      expect(payload.tietideExportVersion).toBe(WORKFLOW_EXPORT_VERSION);
      expect(payload.name).toBe('My Workflow');
      expect(payload.definition).toEqual(definition);
      expect(payload.exportedAt).toBe('2026-05-07T10:30:00.000Z');
    });

    it('should default exportedAt to now when not provided', () => {
      const before = Date.now();
      const payload = buildExportPayload('x', makeDefinition());
      const after = Date.now();
      const ts = Date.parse(payload.exportedAt);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  describe('serializeExport', () => {
    it('should produce parseable JSON containing tietideExportVersion: 1', () => {
      const payload = buildExportPayload(
        'wf',
        makeDefinition(),
        new Date('2026-01-01T00:00:00.000Z'),
      );
      const json = serializeExport(payload);
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed.tietideExportVersion).toBe(1);
      expect(parsed.name).toBe('wf');
      expect(parsed.exportedAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('sanitizeFilename', () => {
    it('should strip path/filesystem-reserved characters', () => {
      expect(sanitizeFilename('my\\workflow/with:bad*chars?"<>|here')).toBe(
        'myworkflowwithbadcharshere',
      );
    });

    it('should collapse whitespace and trim', () => {
      expect(sanitizeFilename('  hello   world  ')).toBe('hello world');
    });

    it('should fall back to "workflow" when input is empty or all-stripped', () => {
      expect(sanitizeFilename('')).toBe('workflow');
      expect(sanitizeFilename('   ')).toBe('workflow');
      expect(sanitizeFilename('///\\\\:::')).toBe('workflow');
    });
  });

  describe('exportFilename', () => {
    it('should append .tietide.json to the sanitized name', () => {
      expect(exportFilename('My Workflow')).toBe('My Workflow.tietide.json');
      expect(exportFilename('a/b\\c')).toBe('abc.tietide.json');
      expect(exportFilename('')).toBe('workflow.tietide.json');
    });
  });

  describe('parseExport', () => {
    it('should parse a valid export envelope', () => {
      const payload = buildExportPayload(
        'wf',
        makeDefinition(),
        new Date('2026-01-01T00:00:00.000Z'),
      );
      const json = serializeExport(payload);
      const result = parseExport(json);
      expect(result).toEqual(payload);
    });

    it('should throw WorkflowExportFormatError when tietideExportVersion is missing', () => {
      const json = JSON.stringify({
        name: 'wf',
        definition: makeDefinition(),
        exportedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(() => parseExport(json)).toThrow(WorkflowExportFormatError);
    });

    it('should throw WorkflowExportFormatError when tietideExportVersion is wrong', () => {
      const json = JSON.stringify({
        tietideExportVersion: 2,
        name: 'wf',
        definition: makeDefinition(),
        exportedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(() => parseExport(json)).toThrow(WorkflowExportFormatError);
    });

    it('should throw WorkflowExportFormatError on malformed JSON', () => {
      expect(() => parseExport('{not json')).toThrow(WorkflowExportFormatError);
    });

    it('should throw on missing name or missing definition', () => {
      const baseValid = buildExportPayload(
        'wf',
        makeDefinition(),
        new Date('2026-01-01T00:00:00.000Z'),
      );

      const noName = JSON.stringify({ ...baseValid, name: '' });
      expect(() => parseExport(noName)).toThrow(WorkflowExportFormatError);

      const noDef = JSON.stringify({ ...baseValid, definition: undefined });
      expect(() => parseExport(noDef)).toThrow(WorkflowExportFormatError);
    });

    it('should accept an empty nodes array as a valid draft export', () => {
      // Matches the API: empty `nodes` is a valid draft (see commit 564ffae).
      // Topology rules are enforced at execute/activate time, not on import.
      const baseValid = buildExportPayload(
        'wf',
        makeDefinition(),
        new Date('2026-01-01T00:00:00.000Z'),
      );
      const emptyNodes = JSON.stringify({
        ...baseValid,
        definition: { nodes: [], edges: [] },
      });
      expect(() => parseExport(emptyNodes)).not.toThrow();
    });

    it('should roundtrip build → serialize → parse to a deep-equal payload', () => {
      const payload = buildExportPayload(
        'Roundtrip',
        makeDefinition(),
        new Date('2026-05-07T10:30:00.000Z'),
      );
      const back = parseExport(serializeExport(payload));
      expect(back).toEqual(payload);
    });
  });
});
