import type { WorkflowDefinition } from '@tietide/shared';
import { extractWorkflowFacts } from './workflow-facts';

const definition: WorkflowDefinition = {
  nodes: [
    {
      id: 'trigger',
      type: 'cron-trigger',
      name: 'Daily 9am',
      position: { x: 0, y: 0 },
      config: { cron: '0 9 * * *' },
    },
    {
      id: 'fetch',
      type: 'http-request',
      name: 'Fetch Orders',
      alias: 'fetch',
      position: { x: 0, y: 0 },
      config: {
        method: 'GET',
        url: 'https://partner.example.com/api/orders',
        headers: {
          authorization: 'Bearer {{secrets.PARTNER_TOKEN}}',
          'x-key': '{{PARTNER_API_KEY}}',
        },
      },
    },
    {
      id: 'gate',
      type: 'conditional',
      name: 'Has Orders?',
      position: { x: 0, y: 0 },
      config: { condition: '{{steps.fetch.body.count}} > 0' },
    },
    {
      id: 'post',
      type: 'slack-post-message',
      name: 'Notify Slack',
      position: { x: 0, y: 0 },
      config: {
        connectionId: 'conn-uuid-1',
        channel: 'C1',
        text: 'Got {{steps.fetch.body.count}} orders',
      },
    },
    {
      id: 'draft',
      type: 'claude-messages',
      name: 'Summarize',
      position: { x: 0, y: 0 },
      // Empty connectionId = unbound placeholder; must NOT count as a prerequisite.
      config: { connectionId: '', model: 'claude-sonnet-4-6' },
    },
    {
      id: 'onerr',
      type: 'http-request',
      name: 'Report Error',
      position: { x: 0, y: 0 },
      config: { url: 'https://internal.example.com/alert', body: '{{trigger.timestamp}}' },
    },
  ],
  edges: [
    { id: 'e1', source: 'trigger', target: 'fetch' },
    { id: 'e2', source: 'fetch', target: 'gate' },
    { id: 'e3', source: 'gate', target: 'post', sourceHandle: 'true' },
    { id: 'e4', source: 'fetch', target: 'onerr', sourceHandle: 'error', kind: 'error' },
    { id: 'e5', source: 'gate', target: 'draft', sourceHandle: 'true' },
  ],
};

describe('extractWorkflowFacts', () => {
  it('labels nodes with name, catalog category, and provider', () => {
    const facts = extractWorkflowFacts(definition);

    const post = facts.nodes.find((n) => n.id === 'post');
    expect(post).toMatchObject({
      id: 'post',
      label: 'Notify Slack',
      type: 'slack-post-message',
      category: 'action',
      provider: 'slack',
    });
    const trig = facts.nodes.find((n) => n.id === 'trigger');
    expect(trig).toMatchObject({ label: 'Daily 9am', category: 'trigger' });
  });

  it('includes a user-authored node description when present, omits it otherwise', () => {
    const withDesc: WorkflowDefinition = {
      nodes: [
        {
          id: 'fetch',
          type: 'http-request',
          name: 'Fetch Orders',
          description: 'Pulls the nightly orders report from the partner API',
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: 'bare',
          type: 'http-request',
          name: 'No description',
          position: { x: 0, y: 0 },
          config: {},
        },
      ],
      edges: [],
    };

    const facts = extractWorkflowFacts(withDesc);

    expect(facts.nodes.find((n) => n.id === 'fetch')?.description).toBe(
      'Pulls the nightly orders report from the partner API',
    );
    expect(facts.nodes.find((n) => n.id === 'bare')).not.toHaveProperty('description');
  });

  it('identifies the trigger node and its config', () => {
    const facts = extractWorkflowFacts(definition);
    expect(facts.trigger).toMatchObject({
      id: 'trigger',
      label: 'Daily 9am',
      type: 'cron-trigger',
    });
    expect(facts.trigger?.config).toEqual({ cron: '0 9 * * *' });
  });

  it('orders nodes from the trigger via topological sort', () => {
    const facts = extractWorkflowFacts(definition);
    expect(facts.executionOrder[0]).toBe('trigger');
    expect(facts.executionOrder[1]).toBe('fetch');
    expect(new Set(facts.executionOrder)).toEqual(
      new Set(['trigger', 'fetch', 'gate', 'post', 'draft', 'onerr']),
    );
    // fetch precedes gate; gate precedes post
    const order = facts.executionOrder;
    expect(order.indexOf('fetch')).toBeLessThan(order.indexOf('gate'));
    expect(order.indexOf('gate')).toBeLessThan(order.indexOf('post'));
  });

  it('extracts conditional branches by label', () => {
    const facts = extractWorkflowFacts(definition);
    expect(facts.branches).toHaveLength(1);
    const branch = facts.branches[0];
    expect(branch.nodeLabel).toBe('Has Orders?');
    expect(branch.condition).toContain('count');
    expect(branch.trueTargets).toEqual(expect.arrayContaining(['Notify Slack', 'Summarize']));
    expect(branch.falseTargets).toEqual([]);
  });

  it('extracts error edges by label', () => {
    const facts = extractWorkflowFacts(definition);
    expect(facts.errorEdges).toEqual([
      { sourceLabel: 'Fetch Orders', targetLabel: 'Report Error' },
    ]);
  });

  it('derives prerequisites: connections, secrets, env vars, endpoints', () => {
    const facts = extractWorkflowFacts(definition);
    // Only the bound Slack connection — the empty-connectionId Claude node is ignored.
    expect(facts.prerequisites.connections).toEqual([
      { provider: 'slack', nodeLabels: ['Notify Slack'] },
    ]);
    expect(facts.prerequisites.secrets).toEqual(['PARTNER_TOKEN']);
    expect(facts.prerequisites.envVars).toEqual(['PARTNER_API_KEY']);
    expect(facts.prerequisites.externalEndpoints).toEqual(
      expect.arrayContaining(['partner.example.com', 'internal.example.com']),
    );
  });

  it('extracts data-pill references per node', () => {
    const facts = extractWorkflowFacts(definition);
    const onerr = facts.dataPillRefs.find((d) => d.nodeLabel === 'Report Error');
    expect(onerr?.reads).toEqual([{ from: 'trigger', field: 'timestamp' }]);
    const post = facts.dataPillRefs.find((d) => d.nodeLabel === 'Notify Slack');
    expect(post?.reads).toEqual([{ from: 'fetch', field: 'body.count' }]);
  });

  it('handles an empty definition without throwing', () => {
    const facts = extractWorkflowFacts({ nodes: [], edges: [] });
    expect(facts.nodes).toEqual([]);
    expect(facts.executionOrder).toEqual([]);
    expect(facts.trigger).toBeNull();
    expect(facts.branches).toEqual([]);
    expect(facts.errorEdges).toEqual([]);
    expect(facts.prerequisites).toEqual({
      connections: [],
      secrets: [],
      envVars: [],
      externalEndpoints: [],
    });
    expect(facts.dataPillRefs).toEqual([]);
  });
});
