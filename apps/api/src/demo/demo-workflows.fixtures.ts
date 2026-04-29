import type { WorkflowDefinition } from '@tietide/shared';
import { NodeType } from '@tietide/shared';

export interface DemoWebhookConfig {
  /** Path suffix appended after a per-user prefix to keep the path globally unique. */
  pathSuffix: string;
}

export interface DemoWorkflowFixture {
  /** Stable identifier used to detect existing demo workflows on re-seed. */
  slug: string;
  name: string;
  description: string;
  /** Whether the seeded workflow should be marked active. */
  activate: boolean;
  /** When set, a Webhook record will be provisioned for this workflow. */
  webhook?: DemoWebhookConfig;
  definition: WorkflowDefinition;
}

const PUBLIC_ECHO_URL = 'https://httpbin.org/post';
const PUBLIC_NOTIFY_URL = 'https://httpbin.org/anything/notification';
const PUBLIC_FETCH_URL = 'https://httpbin.org/json';
const PUBLIC_ARCHIVE_URL = 'https://httpbin.org/anything/archive';
const UNREACHABLE_URL = 'http://demo-failure-host.invalid:9/will-never-resolve';

export const DEMO_WORKFLOWS: readonly DemoWorkflowFixture[] = [
  {
    slug: 'webhook-conditional-notification',
    name: 'Demo: Webhook → Enrich → IF → Notify',
    description:
      'Inbound webhook payload is enriched via HTTP, then a conditional routes successful responses to a notification call.',
    activate: true,
    webhook: { pathSuffix: 'webhook-demo' },
    definition: {
      nodes: [
        {
          id: 'trigger',
          type: NodeType.WEBHOOK_TRIGGER,
          name: 'Inbound Webhook',
          position: { x: 80, y: 160 },
          config: {},
        },
        {
          id: 'enrich',
          type: NodeType.HTTP_REQUEST,
          name: 'Enrich Payload',
          position: { x: 320, y: 160 },
          config: {
            method: 'POST',
            url: PUBLIC_ECHO_URL,
            headers: { 'content-type': 'application/json' },
            body: { source: 'tietide-demo', kind: 'enrichment' },
            timeout: 10000,
          },
        },
        {
          id: 'gate',
          type: NodeType.CONDITIONAL,
          name: 'Status OK?',
          position: { x: 560, y: 160 },
          config: { condition: '{{statusCode}} === 200' },
        },
        {
          id: 'notify',
          type: NodeType.HTTP_REQUEST,
          name: 'Send Notification',
          position: { x: 800, y: 80 },
          config: {
            method: 'POST',
            url: PUBLIC_NOTIFY_URL,
            headers: { 'content-type': 'application/json' },
            body: { channel: 'demo', text: 'Webhook processed successfully.' },
            timeout: 10000,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'enrich' },
        { id: 'e2', source: 'enrich', target: 'gate' },
        { id: 'e3', source: 'gate', target: 'notify', sourceHandle: 'true' },
      ],
    },
  },
  {
    slug: 'cron-fetch-process',
    name: 'Demo: Cron → Fetch → Archive',
    description:
      'Hourly cron pulls fresh data from a public endpoint and forwards the response to an archive sink.',
    activate: false,
    definition: {
      nodes: [
        {
          id: 'cron',
          type: NodeType.CRON_TRIGGER,
          name: 'Hourly',
          position: { x: 80, y: 160 },
          config: { expression: '0 * * * *' },
        },
        {
          id: 'fetch',
          type: NodeType.HTTP_REQUEST,
          name: 'Fetch Data',
          position: { x: 320, y: 160 },
          config: {
            method: 'GET',
            url: PUBLIC_FETCH_URL,
            timeout: 10000,
          },
        },
        {
          id: 'archive',
          type: NodeType.HTTP_REQUEST,
          name: 'Archive',
          position: { x: 560, y: 160 },
          config: {
            method: 'POST',
            url: PUBLIC_ARCHIVE_URL,
            headers: { 'content-type': 'application/json' },
            body: { source: 'demo-cron', payloadFromUpstream: true },
            timeout: 10000,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'cron', target: 'fetch' },
        { id: 'e2', source: 'fetch', target: 'archive' },
      ],
    },
  },
  {
    slug: 'manual-ai-docs-showcase',
    name: 'Demo: Manual → Multi-step (AI Docs Showcase)',
    description:
      'Manual trigger drives a multi-step pipeline rich enough for the AI documentation generator to produce a meaningful explanation.',
    activate: false,
    definition: {
      nodes: [
        {
          id: 'start',
          type: NodeType.MANUAL_TRIGGER,
          name: 'Start',
          position: { x: 80, y: 160 },
          config: {},
        },
        {
          id: 'load',
          type: NodeType.HTTP_REQUEST,
          name: 'Load Reference Data',
          position: { x: 320, y: 160 },
          config: {
            method: 'GET',
            url: PUBLIC_FETCH_URL,
            timeout: 10000,
          },
        },
        {
          id: 'check',
          type: NodeType.CONDITIONAL,
          name: 'Has Data?',
          position: { x: 560, y: 160 },
          config: { condition: '{{statusCode}} === 200' },
        },
        {
          id: 'publish',
          type: NodeType.HTTP_REQUEST,
          name: 'Publish Result',
          position: { x: 800, y: 80 },
          config: {
            method: 'POST',
            url: PUBLIC_ECHO_URL,
            headers: { 'content-type': 'application/json' },
            body: { stage: 'publish', source: 'demo-ai-docs' },
            timeout: 10000,
          },
        },
        {
          id: 'archive',
          type: NodeType.HTTP_REQUEST,
          name: 'Archive Result',
          position: { x: 1040, y: 80 },
          config: {
            method: 'POST',
            url: PUBLIC_ARCHIVE_URL,
            headers: { 'content-type': 'application/json' },
            body: { stage: 'archive', source: 'demo-ai-docs' },
            timeout: 10000,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'load' },
        { id: 'e2', source: 'load', target: 'check' },
        { id: 'e3', source: 'check', target: 'publish', sourceHandle: 'true' },
        { id: 'e4', source: 'publish', target: 'archive' },
      ],
    },
  },
  {
    slug: 'manual-failure-dlq',
    name: 'Demo: Manual → Failure (DLQ Showcase)',
    description:
      'Targets an unreachable host so executions exhaust the retry budget and land on the dead-letter queue — useful for demoing resilience.',
    activate: false,
    definition: {
      nodes: [
        {
          id: 'start',
          type: NodeType.MANUAL_TRIGGER,
          name: 'Start',
          position: { x: 80, y: 160 },
          config: {},
        },
        {
          id: 'broken',
          type: NodeType.HTTP_REQUEST,
          name: 'Call Unreachable Host',
          position: { x: 320, y: 160 },
          config: {
            method: 'GET',
            url: UNREACHABLE_URL,
            timeout: 2000,
          },
        },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'broken' }],
    },
  },
];

export const DEMO_WORKFLOW_SLUGS = DEMO_WORKFLOWS.map((w) => w.slug);
