import { NodeType } from '@tietide/shared';
import type { LibraryTemplate } from './types';

/**
 * Marketing templates. `daily-hn-ai-digest` calls the public, no-auth Hacker
 * News Firebase API so it runs out-of-box except for the Claude + Slack bindings.
 */
export const MARKETING_TEMPLATES: readonly LibraryTemplate[] = [
  {
    slug: 'new-subscriber-welcome',
    name: 'New subscriber welcome series',
    description:
      'A new Mailchimp subscriber gets a personalized welcome email, is mirrored into HubSpot as a contact, and the growth team is notified in Slack.',
    category: 'Marketing',
    definition: {
      nodes: [
        {
          id: 'trigger',
          type: NodeType.MAILCHIMP_SUBSCRIBER_ADDED,
          name: 'Mailchimp: subscriber added',
          position: { x: 80, y: 200 },
          config: { connectionId: '', listId: '' },
        },
        {
          id: 'welcome',
          type: NodeType.CODE,
          name: 'Build welcome payload',
          alias: 'welcome',
          position: { x: 340, y: 200 },
          config: {
            language: 'javascript',
            inputs: { sub: '{{ trigger.body }}' },
            code: [
              'const email = sub.email || sub["email"];',
              'const first = sub.merges?.FNAME || "there";',
              'return {',
              '  email,',
              '  firstName: first,',
              '  subject: `Welcome aboard, ${first}!`,',
              '  body: `Hi ${first}, thanks for subscribing — here is what to expect from us.`,',
              '};',
            ].join('\n'),
          },
        },
        {
          id: 'email',
          type: NodeType.GMAIL_SEND,
          name: 'Gmail: send welcome',
          alias: 'email',
          position: { x: 600, y: 200 },
          config: {
            connectionId: '',
            to: '{{ steps.welcome.email }}',
            subject: '{{ steps.welcome.subject }}',
            body: '{{ steps.welcome.body }}',
          },
        },
        {
          id: 'contact',
          type: NodeType.HUBSPOT_CREATE_CONTACT,
          name: 'HubSpot: mirror contact',
          alias: 'contact',
          position: { x: 860, y: 200 },
          config: {
            connectionId: '',
            email: '{{ steps.welcome.email }}',
            firstName: '{{ steps.welcome.firstName }}',
          },
        },
        {
          id: 'notify',
          type: NodeType.SLACK_POST_MESSAGE,
          name: 'Slack: notify #marketing',
          alias: 'notify',
          position: { x: 1120, y: 200 },
          config: {
            connectionId: '',
            channel: '#marketing',
            text: '📥 New subscriber: {{ steps.welcome.email }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'welcome' },
        { id: 'e2', source: 'welcome', target: 'email' },
        { id: 'e3', source: 'email', target: 'contact' },
        { id: 'e4', source: 'contact', target: 'notify' },
      ],
    },
  },
  {
    slug: 'daily-hn-ai-digest',
    name: 'Daily Hacker News AI digest',
    description:
      'Every morning, pull the top Hacker News stories (public API), summarize the top 5 with Claude, and post a digest to Slack.',
    category: 'Marketing',
    definition: {
      nodes: [
        {
          id: 'cron',
          type: NodeType.CRON_TRIGGER,
          name: 'Every day 09:00',
          position: { x: 80, y: 220 },
          config: { expression: '0 9 * * *' },
        },
        {
          id: 'top',
          type: NodeType.HTTP_REQUEST,
          name: 'HN: top stories',
          alias: 'top',
          position: { x: 340, y: 220 },
          config: {
            method: 'GET',
            url: 'https://hacker-news.firebaseio.com/v0/topstories.json',
            timeout: 10000,
          },
        },
        {
          id: 'pick',
          type: NodeType.CODE,
          name: 'Take top 5 ids',
          alias: 'pick',
          position: { x: 600, y: 220 },
          config: {
            language: 'javascript',
            inputs: { ids: '{{ steps.top.body }}' },
            code: ['return { ids: (Array.isArray(ids) ? ids : []).slice(0, 5) };'].join('\n'),
          },
        },
        {
          id: 'loop',
          type: NodeType.ITERATOR,
          name: 'For each story',
          alias: 'loop',
          position: { x: 860, y: 220 },
          config: { arrayPath: '{{ steps.pick.ids }}' },
        },
        {
          id: 'item',
          type: NodeType.HTTP_REQUEST,
          name: 'HN: fetch story',
          alias: 'item',
          position: { x: 1120, y: 220 },
          config: {
            method: 'GET',
            url: 'https://hacker-news.firebaseio.com/v0/item/{{ steps.loop.item }}.json',
            timeout: 10000,
          },
        },
        {
          id: 'summarize',
          type: NodeType.CLAUDE_MESSAGES,
          name: 'Claude: summarize',
          alias: 'summarize',
          position: { x: 1380, y: 220 },
          config: {
            connectionId: '',
            model: 'claude-sonnet-4-6',
            system: 'You write one-sentence, punchy tech-news summaries.',
            prompt:
              'Summarize this Hacker News story in one sentence:\n\n{{ steps.item.body.title }}',
            maxTokens: 120,
            enablePromptCaching: true,
          },
        },
        {
          id: 'post',
          type: NodeType.SLACK_POST_MESSAGE,
          name: 'Slack: post digest',
          alias: 'post',
          position: { x: 1640, y: 220 },
          config: {
            connectionId: '',
            channel: '#ai-digest',
            text: '📰 {{ steps.summarize.text }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'cron', target: 'top' },
        { id: 'e2', source: 'top', target: 'pick' },
        { id: 'e3', source: 'pick', target: 'loop' },
        { id: 'e4', source: 'loop', target: 'item' },
        { id: 'e5', source: 'item', target: 'summarize' },
        { id: 'e6', source: 'summarize', target: 'post' },
      ],
    },
  },
];
