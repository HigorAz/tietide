import { NodeType } from '@tietide/shared';
import type { LibraryTemplate } from './types';

/**
 * Sales department templates. Connector nodes carry an empty connectionId — the
 * user binds their own HubSpot + Slack connections on "Use template".
 */
export const SALES_TEMPLATES: readonly LibraryTemplate[] = [
  {
    slug: 'lead-capture-to-crm',
    name: 'Lead capture → CRM → hot-lead alert',
    description:
      'Inbound web-form lead is normalized, pushed to HubSpot as a contact + deal, then a Slack alert fires when the lead scores hot.',
    category: 'Sales',
    webhook: { pathSuffix: 'lead-capture' },
    definition: {
      nodes: [
        {
          id: 'trigger',
          type: NodeType.WEBHOOK_TRIGGER,
          name: 'New lead (web form)',
          position: { x: 80, y: 200 },
          config: {},
        },
        {
          id: 'normalize',
          type: NodeType.CODE,
          name: 'Normalize lead',
          alias: 'normalize',
          position: { x: 340, y: 200 },
          config: {
            language: 'javascript',
            inputs: { body: '{{ trigger.body }}' },
            code: [
              'const name = (body.name || "").trim();',
              'const [firstName, ...rest] = name.split(" ");',
              'const score = Number(body.score ?? body.budget ?? 0);',
              'return {',
              '  email: body.email,',
              '  firstName: firstName || "",',
              '  lastName: rest.join(" "),',
              '  company: body.company || "Unknown",',
              '  score,',
              '};',
            ].join('\n'),
          },
        },
        {
          id: 'contact',
          type: NodeType.HUBSPOT_CREATE_CONTACT,
          name: 'HubSpot: create contact',
          alias: 'contact',
          position: { x: 600, y: 200 },
          config: {
            connectionId: '',
            email: '{{ steps.normalize.email }}',
            firstName: '{{ steps.normalize.firstName }}',
            lastName: '{{ steps.normalize.lastName }}',
          },
        },
        {
          id: 'deal',
          type: NodeType.HUBSPOT_CREATE_DEAL,
          name: 'HubSpot: create deal',
          alias: 'deal',
          position: { x: 860, y: 200 },
          config: {
            connectionId: '',
            name: '{{ steps.normalize.company }} — inbound lead',
          },
        },
        {
          id: 'gate',
          type: NodeType.CONDITIONAL,
          name: 'Hot lead?',
          position: { x: 1120, y: 200 },
          config: { condition: '{{ steps.normalize.score }} >= 50' },
        },
        {
          id: 'notify',
          type: NodeType.SLACK_POST_MESSAGE,
          name: 'Slack: alert #sales',
          alias: 'notify',
          position: { x: 1380, y: 120 },
          config: {
            connectionId: '',
            channel: '#sales',
            text: '🔥 Hot lead: {{ steps.normalize.firstName }} from {{ steps.normalize.company }} (score {{ steps.normalize.score }})',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'normalize' },
        { id: 'e2', source: 'normalize', target: 'contact' },
        { id: 'e3', source: 'contact', target: 'deal' },
        { id: 'e4', source: 'deal', target: 'gate' },
        { id: 'e5', source: 'gate', target: 'notify', sourceHandle: 'true' },
      ],
    },
  },
];
