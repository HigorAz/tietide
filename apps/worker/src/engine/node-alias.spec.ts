import { NodeType, assignNodeAliases, slugifyAlias, type WorkflowNode } from '@tietide/shared';

function node(
  partial: Partial<WorkflowNode> & Pick<WorkflowNode, 'id' | 'type' | 'name'>,
): WorkflowNode {
  return { position: { x: 0, y: 0 }, config: {}, ...partial };
}

describe('slugifyAlias', () => {
  it('lowercases and underscores non-alphanumerics', () => {
    expect(slugifyAlias('Gmail: Search Messages')).toBe('gmail_search_messages');
    expect(slugifyAlias('Code')).toBe('code');
  });

  it('collapses repeats and trims edges', () => {
    expect(slugifyAlias('  --Hello--World!!  ')).toBe('hello_world');
  });

  it('falls back to "node" for empty slugs', () => {
    expect(slugifyAlias('@@@')).toBe('node');
  });
});

describe('assignNodeAliases', () => {
  it('maps the first trigger to "trigger"', () => {
    const nodes = [
      node({ id: 'n1', type: NodeType.MANUAL_TRIGGER, name: 'Manual Trigger' }),
      node({ id: 'n2', type: NodeType.CODE, name: 'Code' }),
    ];
    const map = assignNodeAliases(nodes);
    expect(map.get('n1')).toBe('trigger');
    expect(map.get('n2')).toBe('code');
  });

  it('dedupes same-named actions with a numeric suffix', () => {
    const nodes = [
      node({ id: 't', type: NodeType.CRON_TRIGGER, name: 'Cron Trigger' }),
      node({ id: 'a', type: NodeType.CODE, name: 'Code' }),
      node({ id: 'b', type: NodeType.CODE, name: 'Code' }),
    ];
    const map = assignNodeAliases(nodes);
    expect(map.get('a')).toBe('code');
    expect(map.get('b')).toBe('code_2');
  });

  it('never hands the reserved container words to an action', () => {
    const nodes = [
      node({ id: 'a', type: NodeType.CODE, name: 'steps' }),
      node({ id: 'b', type: NodeType.CODE, name: 'trigger' }),
    ];
    const map = assignNodeAliases(nodes);
    expect(map.get('a')).toBe('steps_2');
    expect(map.get('b')).toBe('trigger_2');
  });

  it('respects a valid stored alias so references stay stable', () => {
    const nodes = [
      node({ id: 'a', type: NodeType.CODE, name: 'Code', alias: 'my_step' }),
      node({ id: 'b', type: NodeType.CODE, name: 'My Step' }),
    ];
    const map = assignNodeAliases(nodes);
    expect(map.get('a')).toBe('my_step');
    // derived slug of "My Step" collides with the stored one → suffixed
    expect(map.get('b')).toBe('my_step_2');
  });

  it('forces the trigger alias even if a stored alias is present', () => {
    const nodes = [
      node({ id: 't', type: NodeType.MANUAL_TRIGGER, name: 'Manual Trigger', alias: 'whatever' }),
    ];
    expect(assignNodeAliases(nodes).get('t')).toBe('trigger');
  });
});
