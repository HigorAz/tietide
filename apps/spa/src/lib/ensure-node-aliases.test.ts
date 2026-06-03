import { describe, it, expect } from 'vitest';
import type { Node } from 'reactflow';
import { NodeType } from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import { ensureNodeAliases } from './ensure-node-aliases';

const rf = (
  id: string,
  nodeType: NodeType,
  label: string,
  alias?: string,
): Node<CustomNodeData> => ({
  id,
  type: 'custom',
  position: { x: 0, y: 0 },
  data: { label, nodeType, status: 'idle', config: {}, ...(alias ? { alias } : {}) },
});

describe('ensureNodeAliases', () => {
  it('assigns trigger alias and deduped action slugs to nodes missing them', () => {
    const out = ensureNodeAliases([
      rf('n1', NodeType.MANUAL_TRIGGER, 'Manual Trigger'),
      rf('n2', NodeType.CODE, 'Code'),
      rf('n3', NodeType.CODE, 'Code'),
    ]);
    expect(out.map((n) => n.data.alias)).toEqual(['trigger', 'code', 'code_2']);
  });

  it('preserves existing aliases and only fills the missing ones', () => {
    const out = ensureNodeAliases([
      rf('n1', NodeType.MANUAL_TRIGGER, 'Manual Trigger', 'trigger'),
      rf('n2', NodeType.CODE, 'Code', 'kept'),
      rf('n3', NodeType.HTTP_REQUEST, 'HTTP Request'),
    ]);
    expect(out[1].data.alias).toBe('kept');
    expect(out[2].data.alias).toBe('http_request');
  });

  it('returns the same array reference when every node already has an alias', () => {
    const input = [rf('n1', NodeType.CODE, 'Code', 'code')];
    expect(ensureNodeAliases(input)).toBe(input);
  });
});
