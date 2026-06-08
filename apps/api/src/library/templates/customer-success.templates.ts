import { NodeType } from '@tietide/shared';
import type { LibraryTemplate } from './types';

/**
 * Customer Success templates. The triage node uses Claude to classify an
 * inbound ticket; urgent tickets fan out to Linear + Slack, everything else
 * gets an automated Gmail acknowledgement.
 */
export const CUSTOMER_SUCCESS_TEMPLATES: readonly LibraryTemplate[] = [
  {
    slug: 'ai-support-ticket-triage',
    name: 'AI support-ticket triage',
    description:
      'Inbound support ticket is classified by Claude (priority + category). Urgent tickets open a Linear issue and ping Slack; the rest get an instant Gmail auto-acknowledgement.',
    category: 'Customer Success',
    webhook: { pathSuffix: 'support-triage' },
    definition: {
      nodes: [
        {
          id: 'trigger',
          type: NodeType.WEBHOOK_TRIGGER,
          name: 'New support ticket',
          position: { x: 80, y: 220 },
          config: {},
        },
        {
          id: 'classify',
          type: NodeType.CLAUDE_MESSAGES,
          name: 'Claude: classify ticket',
          alias: 'classify',
          position: { x: 340, y: 220 },
          config: {
            connectionId: '',
            model: 'claude-sonnet-4-6',
            system:
              'You triage support tickets. Reply with ONLY compact JSON: {"priority":"URGENT|NORMAL|LOW","category":"billing|bug|how-to|other"}.',
            prompt: 'Classify this ticket:\n\n{{ trigger.body.message }}',
            maxTokens: 128,
            enablePromptCaching: true,
          },
        },
        {
          id: 'triage',
          type: NodeType.CODE,
          name: 'Parse classification',
          alias: 'triage',
          position: { x: 600, y: 220 },
          config: {
            language: 'javascript',
            inputs: { raw: '{{ steps.classify.text }}' },
            code: [
              'let parsed = { priority: "NORMAL", category: "other" };',
              'try { parsed = { ...parsed, ...JSON.parse(raw) }; } catch (_) {}',
              'return parsed;',
            ].join('\n'),
          },
        },
        {
          id: 'gate',
          type: NodeType.CONDITIONAL,
          name: 'Urgent?',
          position: { x: 860, y: 220 },
          config: { condition: '"{{ steps.triage.priority }}" === "URGENT"' },
        },
        {
          id: 'issue',
          type: NodeType.LINEAR_CREATE_ISSUE,
          name: 'Linear: open issue',
          alias: 'issue',
          position: { x: 1120, y: 120 },
          config: {
            connectionId: '',
            teamId: '',
            title: 'Urgent ({{ steps.triage.category }}): {{ trigger.body.subject }}',
            description: '{{ trigger.body.message }}',
            priority: 1,
          },
        },
        {
          id: 'alert',
          type: NodeType.SLACK_POST_MESSAGE,
          name: 'Slack: alert #support',
          alias: 'alert',
          position: { x: 1120, y: 260 },
          config: {
            connectionId: '',
            channel: '#support',
            text: '🚨 Urgent {{ steps.triage.category }} ticket from {{ trigger.body.email }}',
          },
        },
        {
          id: 'ack',
          type: NodeType.GMAIL_SEND,
          name: 'Gmail: auto-acknowledge',
          alias: 'ack',
          position: { x: 1120, y: 400 },
          config: {
            connectionId: '',
            to: '{{ trigger.body.email }}',
            subject: 'We received your request',
            body: 'Thanks for reaching out — our team has your ticket and will follow up shortly.',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'classify' },
        { id: 'e2', source: 'classify', target: 'triage' },
        { id: 'e3', source: 'triage', target: 'gate' },
        { id: 'e4', source: 'gate', target: 'issue', sourceHandle: 'true' },
        { id: 'e5', source: 'gate', target: 'alert', sourceHandle: 'true' },
        { id: 'e6', source: 'gate', target: 'ack', sourceHandle: 'false' },
      ],
    },
  },
];
