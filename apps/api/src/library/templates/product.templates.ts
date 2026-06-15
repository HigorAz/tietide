import { NodeType } from '@tietide/shared';
import type { LibraryTemplate } from './types';

/**
 * Product templates. Replace the placeholder Notion database id with your own
 * after binding the Notion connection.
 */
export const PRODUCT_TEMPLATES: readonly LibraryTemplate[] = [
  {
    slug: 'feedback-to-notion-linear',
    name: 'Product feedback → Notion + Linear',
    description:
      'Inbound product feedback is categorized and sentiment-scored by a local Ollama model, logged to a Notion database, and — when it looks like a bug — turned into a Linear issue with a Slack heads-up.',
    category: 'Product',
    webhook: { pathSuffix: 'product-feedback' },
    definition: {
      nodes: [
        {
          id: 'trigger',
          type: NodeType.WEBHOOK_TRIGGER,
          name: 'New feedback',
          position: { x: 80, y: 220 },
          config: {},
        },
        {
          id: 'analyze',
          type: NodeType.OLLAMA_GENERATE,
          name: 'Ollama: categorize + sentiment',
          alias: 'analyze',
          position: { x: 340, y: 220 },
          config: {
            connectionId: '',
            model: 'llama3.1:8b',
            prompt:
              'You analyze product feedback. Reply with ONLY compact JSON: {"category":"bug|feature|praise|other","sentiment":"positive|neutral|negative"}.\n\n{{ trigger.body.message }}',
          },
        },
        {
          id: 'parse',
          type: NodeType.CODE,
          name: 'Parse analysis',
          alias: 'parse',
          position: { x: 600, y: 220 },
          config: {
            language: 'javascript',
            inputs: { raw: '{{ steps.analyze.text }}' },
            code: [
              'let out = { category: "other", sentiment: "neutral" };',
              'try { out = { ...out, ...JSON.parse(raw) }; } catch (_) {}',
              'return out;',
            ].join('\n'),
          },
        },
        {
          id: 'page',
          type: NodeType.NOTION_CREATE_PAGE,
          name: 'Notion: log feedback',
          alias: 'page',
          position: { x: 860, y: 220 },
          config: {
            connectionId: '',
            parentDatabaseId: '00000000000000000000000000000000',
            properties: {
              Name: { title: [{ text: { content: '{{ trigger.body.subject }}' } }] },
            },
          },
        },
        {
          id: 'gate',
          type: NodeType.CONDITIONAL,
          name: 'Is it a bug?',
          position: { x: 1120, y: 220 },
          config: { condition: '"{{ steps.parse.category }}" === "bug"' },
        },
        {
          id: 'issue',
          type: NodeType.LINEAR_CREATE_ISSUE,
          name: 'Linear: file bug',
          alias: 'issue',
          position: { x: 1380, y: 220 },
          config: {
            connectionId: '',
            teamId: '',
            title: 'Feedback bug: {{ trigger.body.subject }}',
            description: '{{ trigger.body.message }}',
          },
        },
        {
          id: 'notify',
          type: NodeType.SLACK_POST_MESSAGE,
          name: 'Slack: notify #product',
          alias: 'notify',
          position: { x: 1640, y: 220 },
          config: {
            connectionId: '',
            channel: '#product',
            text: '🐛 New bug from feedback: {{ trigger.body.subject }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'analyze' },
        { id: 'e2', source: 'analyze', target: 'parse' },
        { id: 'e3', source: 'parse', target: 'page' },
        { id: 'e4', source: 'page', target: 'gate' },
        { id: 'e5', source: 'gate', target: 'issue', sourceHandle: 'true' },
        { id: 'e6', source: 'issue', target: 'notify' },
      ],
    },
  },
];
