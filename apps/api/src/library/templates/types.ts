import type { WorkflowDefinition } from '@tietide/shared';

/**
 * When set on a template, instantiation provisions a Webhook record so the
 * forked workflow has a callable inbound URL. The suffix is combined with a
 * random component per instantiation to keep the global webhook path unique.
 */
export interface LibraryWebhookConfig {
  pathSuffix: string;
}

/**
 * A curated, real-world workflow template surfaced on the /library gallery
 * (issue #286). Unlike demo-seed fixtures (`DEMO_WORKFLOWS`), library templates
 * are NOT seeded automatically and carry no `activate` flag — library
 * instantiation always forks an INACTIVE workflow the user reviews before
 * enabling. Connector nodes ship with an empty `connectionId` so the user binds
 * their own connection after "Use template".
 */
export interface LibraryTemplate {
  /** Stable identifier used to address a template at /v1/library/templates/:slug/instantiate. */
  slug: string;
  name: string;
  description: string;
  /** Department the template belongs to (e.g. "Sales"); surfaced as the /library section. */
  category: string;
  /** When set, instantiation provisions a Webhook for the forked workflow. */
  webhook?: LibraryWebhookConfig;
  definition: WorkflowDefinition;
}
