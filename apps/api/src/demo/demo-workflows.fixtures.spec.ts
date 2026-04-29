import { NODE_CATALOG, NodeType, workflowDefinitionSchema } from '@tietide/shared';
import { DEMO_WORKFLOWS, DEMO_WORKFLOW_SLUGS } from './demo-workflows.fixtures';

const KNOWN_TYPES = new Set(NODE_CATALOG.map((c) => c.type));

describe('Demo workflow fixtures', () => {
  it('should expose at least four fixtures (3 success scenarios + 1 failure)', () => {
    expect(DEMO_WORKFLOWS.length).toBeGreaterThanOrEqual(4);
  });

  it('should have unique slugs across all fixtures', () => {
    const unique = new Set(DEMO_WORKFLOW_SLUGS);
    expect(unique.size).toBe(DEMO_WORKFLOW_SLUGS.length);
  });

  it('should have unique names across all fixtures', () => {
    const names = DEMO_WORKFLOWS.map((w) => w.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it.each(DEMO_WORKFLOWS.map((w) => [w.slug, w]))(
    '"%s" should have a non-empty name and description',
    (_slug, fixture) => {
      expect(fixture.name.length).toBeGreaterThan(0);
      expect(fixture.description.length).toBeGreaterThan(0);
    },
  );

  it.each(DEMO_WORKFLOWS.map((w) => [w.slug, w]))(
    '"%s" should validate against workflowDefinitionSchema',
    (_slug, fixture) => {
      const result = workflowDefinitionSchema.safeParse(fixture.definition);
      if (!result.success) {
        throw new Error(`Invalid demo workflow definition: ${result.error.message}`);
      }
      expect(result.success).toBe(true);
    },
  );

  it.each(DEMO_WORKFLOWS.map((w) => [w.slug, w]))(
    '"%s" should reference only known node types from the catalog',
    (_slug, fixture) => {
      for (const node of fixture.definition.nodes) {
        expect(KNOWN_TYPES.has(node.type as NodeType)).toBe(true);
      }
    },
  );

  it.each(DEMO_WORKFLOWS.map((w) => [w.slug, w]))(
    '"%s" should have edges that reference existing node ids',
    (_slug, fixture) => {
      const ids = new Set(fixture.definition.nodes.map((n) => n.id));
      for (const edge of fixture.definition.edges) {
        expect(ids.has(edge.source)).toBe(true);
        expect(ids.has(edge.target)).toBe(true);
      }
    },
  );

  it.each(DEMO_WORKFLOWS.map((w) => [w.slug, w]))(
    '"%s" should have unique node ids',
    (_slug, fixture) => {
      const ids = fixture.definition.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it.each(DEMO_WORKFLOWS.map((w) => [w.slug, w]))(
    '"%s" should start with exactly one trigger node (no incoming edges)',
    (_slug, fixture) => {
      const targets = new Set(fixture.definition.edges.map((e) => e.target));
      const sources = fixture.definition.nodes.filter((n) => !targets.has(n.id));
      expect(sources).toHaveLength(1);
      const triggerCategory = NODE_CATALOG.find((c) => c.type === sources[0].type)?.category;
      expect(triggerCategory).toBe('trigger');
    },
  );

  describe('Demo 1 — webhook-conditional-notification', () => {
    const demo = DEMO_WORKFLOWS.find((w) => w.slug === 'webhook-conditional-notification');

    it('should exist', () => {
      expect(demo).toBeDefined();
    });

    it('should declare a webhook configuration', () => {
      expect(demo!.webhook).toBeDefined();
      expect(demo!.webhook!.pathSuffix.length).toBeGreaterThan(0);
    });

    it('should be active so the webhook URL works after seeding', () => {
      expect(demo!.activate).toBe(true);
    });

    it('should chain webhook → http → conditional → http(notify)', () => {
      const types = demo!.definition.nodes.map((n) => n.type);
      expect(types).toContain(NodeType.WEBHOOK_TRIGGER);
      expect(types).toContain(NodeType.CONDITIONAL);
      expect(types.filter((t) => t === NodeType.HTTP_REQUEST)).toHaveLength(2);
    });

    it('should branch only on the truthy handle of the conditional', () => {
      const conditional = demo!.definition.nodes.find((n) => n.type === NodeType.CONDITIONAL)!;
      const outgoing = demo!.definition.edges.filter((e) => e.source === conditional.id);
      expect(outgoing.length).toBeGreaterThanOrEqual(1);
      expect(outgoing.every((e) => e.sourceHandle === 'true')).toBe(true);
    });
  });

  describe('Demo 2 — cron-fetch-process', () => {
    const demo = DEMO_WORKFLOWS.find((w) => w.slug === 'cron-fetch-process');

    it('should exist', () => {
      expect(demo).toBeDefined();
    });

    it('should start with a cron trigger', () => {
      const trigger = demo!.definition.nodes.find((n) => n.type === NodeType.CRON_TRIGGER);
      expect(trigger).toBeDefined();
      expect(trigger!.config.expression).toMatch(/^[\d*,\-/\s]+$/);
    });

    it('should not declare a webhook', () => {
      expect(demo!.webhook).toBeUndefined();
    });
  });

  describe('Demo 3 — manual-ai-docs-showcase', () => {
    const demo = DEMO_WORKFLOWS.find((w) => w.slug === 'manual-ai-docs-showcase');

    it('should exist', () => {
      expect(demo).toBeDefined();
    });

    it('should be triggered manually', () => {
      const trigger = demo!.definition.nodes.find((n) => n.type === NodeType.MANUAL_TRIGGER);
      expect(trigger).toBeDefined();
    });

    it('should be substantial enough for AI documentation (≥4 nodes)', () => {
      expect(demo!.definition.nodes.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Demo 4 — manual-failure-dlq', () => {
    const demo = DEMO_WORKFLOWS.find((w) => w.slug === 'manual-failure-dlq');

    it('should exist as a failure scenario', () => {
      expect(demo).toBeDefined();
    });

    it('should target an unreachable URL so retries exhaust into the DLQ', () => {
      const httpNode = demo!.definition.nodes.find((n) => n.type === NodeType.HTTP_REQUEST);
      const url = (httpNode!.config.url as string) ?? '';
      expect(url).toMatch(/\.invalid|unreachable|never-resolve/i);
    });
  });
});
