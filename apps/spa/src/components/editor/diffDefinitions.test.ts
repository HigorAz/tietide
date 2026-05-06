import { describe, it, expect } from 'vitest';
import { diffDefinitions } from './diffDefinitions';

const node = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: 'manual-trigger',
  name: 'Start',
  position: { x: 0, y: 0 },
  config: {},
  ...overrides,
});

describe('diffDefinitions', () => {
  it('should mark nodes only present in `to` as added', () => {
    const from = { nodes: [node('a')], edges: [] };
    const to = { nodes: [node('a'), node('b')], edges: [] };

    const result = diffDefinitions(from, to);

    expect(result.get('b')).toBe('added');
    expect(result.has('a')).toBe(false);
  });

  it('should mark nodes only present in `from` as removed', () => {
    const from = { nodes: [node('a'), node('b')], edges: [] };
    const to = { nodes: [node('a')], edges: [] };

    const result = diffDefinitions(from, to);

    expect(result.get('b')).toBe('removed');
    expect(result.has('a')).toBe(false);
  });

  it('should mark nodes with changed config as modified', () => {
    const from = { nodes: [node('a', { config: { url: 'http://x' } })], edges: [] };
    const to = { nodes: [node('a', { config: { url: 'http://y' } })], edges: [] };

    const result = diffDefinitions(from, to);

    expect(result.get('a')).toBe('modified');
  });

  it('should mark nodes with changed position as modified', () => {
    const from = { nodes: [node('a', { position: { x: 0, y: 0 } })], edges: [] };
    const to = { nodes: [node('a', { position: { x: 100, y: 0 } })], edges: [] };

    const result = diffDefinitions(from, to);

    expect(result.get('a')).toBe('modified');
  });

  it('should ignore unchanged nodes', () => {
    const from = { nodes: [node('a')], edges: [] };
    const to = { nodes: [node('a')], edges: [] };

    const result = diffDefinitions(from, to);

    expect(result.size).toBe(0);
  });

  it('should detect a mix of added/removed/modified in one pass', () => {
    const from = {
      nodes: [node('keep'), node('remove'), node('mod', { name: 'Old' })],
      edges: [],
    };
    const to = {
      nodes: [node('keep'), node('mod', { name: 'New' }), node('add')],
      edges: [],
    };

    const result = diffDefinitions(from, to);

    expect(result.get('add')).toBe('added');
    expect(result.get('remove')).toBe('removed');
    expect(result.get('mod')).toBe('modified');
    expect(result.has('keep')).toBe(false);
  });
});
