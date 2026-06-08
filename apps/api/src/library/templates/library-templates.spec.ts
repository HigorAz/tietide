import { NODE_CATALOG, NodeCategory, NodeType, workflowDefinitionSchema } from '@tietide/shared';
import { LIBRARY_TEMPLATES, LIBRARY_TEMPLATE_SLUGS, LIBRARY_DEPARTMENT_ORDER } from './index';

const KNOWN_TYPES = new Set(NODE_CATALOG.map((c) => c.type));
const TRIGGER_TYPES = new Set(
  NODE_CATALOG.filter((c) => c.category === NodeCategory.TRIGGER).map((c) => c.type),
);

// Real, no-auth public APIs the gallery templates call so they run closer to
// out-of-box (Hacker News Firebase API, Open-Meteo forecast).
const PUBLIC_API_HOSTS = ['hacker-news.firebaseio.com', 'api.open-meteo.com'];

describe('Library templates', () => {
  it('should expose at least 9 templates (issue #286)', () => {
    expect(LIBRARY_TEMPLATES.length).toBeGreaterThanOrEqual(9);
  });

  it('should span at least 6 distinct departments (categories)', () => {
    const departments = new Set(LIBRARY_TEMPLATES.map((t) => t.category));
    expect(departments.size).toBeGreaterThanOrEqual(6);
  });

  it('should only use departments declared in LIBRARY_DEPARTMENT_ORDER', () => {
    const order = new Set(LIBRARY_DEPARTMENT_ORDER);
    for (const t of LIBRARY_TEMPLATES) {
      expect(order.has(t.category)).toBe(true);
    }
  });

  it('should have unique slugs across all templates', () => {
    const unique = new Set(LIBRARY_TEMPLATE_SLUGS);
    expect(unique.size).toBe(LIBRARY_TEMPLATE_SLUGS.length);
    expect(LIBRARY_TEMPLATE_SLUGS.length).toBe(LIBRARY_TEMPLATES.length);
  });

  it('should have unique names across all templates', () => {
    const names = LIBRARY_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should contain a `code` node in at least 2 templates', () => {
    const withCode = LIBRARY_TEMPLATES.filter((t) =>
      t.definition.nodes.some((n) => n.type === NodeType.CODE),
    );
    expect(withCode.length).toBeGreaterThanOrEqual(2);
  });

  it('should call a public no-auth API via http-request in at least 2 templates', () => {
    const withPublicApi = LIBRARY_TEMPLATES.filter((t) =>
      t.definition.nodes.some(
        (n) =>
          n.type === NodeType.HTTP_REQUEST &&
          typeof n.config.url === 'string' &&
          PUBLIC_API_HOSTS.some((host) => (n.config.url as string).includes(host)),
      ),
    );
    expect(withPublicApi.length).toBeGreaterThanOrEqual(2);
  });

  it.each(LIBRARY_TEMPLATES.map((t) => [t.slug, t]))(
    '"%s" should have a non-empty name, description and category',
    (_slug, template) => {
      expect(template.name.trim().length).toBeGreaterThan(0);
      expect(template.description.trim().length).toBeGreaterThan(0);
      expect(typeof template.category).toBe('string');
      expect(template.category.trim().length).toBeGreaterThan(0);
    },
  );

  it.each(LIBRARY_TEMPLATES.map((t) => [t.slug, t]))(
    '"%s" should validate against workflowDefinitionSchema',
    (_slug, template) => {
      const result = workflowDefinitionSchema.safeParse(template.definition);
      if (!result.success) {
        throw new Error(`Invalid library template definition: ${result.error.message}`);
      }
      expect(result.success).toBe(true);
    },
  );

  it.each(LIBRARY_TEMPLATES.map((t) => [t.slug, t]))(
    '"%s" should reference only known node types from the catalog',
    (_slug, template) => {
      for (const node of template.definition.nodes) {
        expect(KNOWN_TYPES.has(node.type as NodeType)).toBe(true);
      }
    },
  );

  it.each(LIBRARY_TEMPLATES.map((t) => [t.slug, t]))(
    '"%s" should have unique node ids',
    (_slug, template) => {
      const ids = template.definition.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it.each(LIBRARY_TEMPLATES.map((t) => [t.slug, t]))(
    '"%s" should have edges that reference existing node ids',
    (_slug, template) => {
      const ids = new Set(template.definition.nodes.map((n) => n.id));
      for (const edge of template.definition.edges) {
        expect(ids.has(edge.source)).toBe(true);
        expect(ids.has(edge.target)).toBe(true);
      }
    },
  );

  it.each(LIBRARY_TEMPLATES.map((t) => [t.slug, t]))(
    '"%s" should have exactly one trigger node with no incoming edges',
    (_slug, template) => {
      const targets = new Set(template.definition.edges.map((e) => e.target));
      const roots = template.definition.nodes.filter((n) => !targets.has(n.id));
      expect(roots).toHaveLength(1);
      expect(TRIGGER_TYPES.has(roots[0].type as NodeType)).toBe(true);
    },
  );
});
