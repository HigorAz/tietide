import { NodeType } from '@tietide/shared';
import type { LibraryTemplate } from './types';

/**
 * Social & messaging templates built on the free, self-hostable stack: Ollama for
 * text, Pollinations (keyless) for images, and the Meta connectors for Instagram
 * + WhatsApp. Bind the connections (and fill the per-account ids) and run.
 */
export const SOCIAL_TEMPLATES: readonly LibraryTemplate[] = [
  {
    slug: 'instagram-ai-daily-post',
    name: 'Instagram AI daily post',
    description:
      'Every morning, an Ollama model writes a caption and Pollinations generates a matching image (free, keyless) — then it’s published to your Instagram Business account.',
    category: 'Marketing',
    definition: {
      nodes: [
        {
          id: 'cron',
          type: NodeType.CRON_TRIGGER,
          name: 'Every day 09:00',
          position: { x: 80, y: 200 },
          config: { expression: '0 9 * * *' },
        },
        {
          id: 'caption',
          type: NodeType.OLLAMA_GENERATE,
          name: 'Ollama: write caption',
          alias: 'caption',
          position: { x: 340, y: 200 },
          config: {
            connectionId: '',
            model: 'llama3.1:8b',
            prompt:
              'Write a short, upbeat Instagram caption (max 2 sentences, a few relevant hashtags) about the theme of the day: small daily wins.',
          },
        },
        {
          id: 'image',
          type: NodeType.AI_GENERATE_IMAGE,
          name: 'AI: generate image',
          alias: 'image',
          position: { x: 600, y: 200 },
          config: {
            provider: 'pollinations',
            prompt: 'a bright, minimal flat-lay illustration celebrating small daily wins',
            width: 1024,
            height: 1024,
          },
        },
        {
          id: 'publish',
          type: NodeType.INSTAGRAM_PUBLISH_PHOTO,
          name: 'Instagram: publish photo',
          alias: 'publish',
          position: { x: 860, y: 200 },
          config: {
            connectionId: '',
            igUserId: '',
            imageUrl: '{{ steps.image.imageUrl }}',
            caption: '{{ steps.caption.text }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'cron', target: 'caption' },
        { id: 'e2', source: 'caption', target: 'image' },
        { id: 'e3', source: 'image', target: 'publish' },
      ],
    },
  },
  {
    slug: 'ai-product-photo-to-ig',
    name: 'AI product promo → Instagram',
    description:
      'On demand, an Ollama model writes marketing copy and Pollinations creates a promo image, then publishes the post to Instagram. Run it manually whenever you want fresh creative.',
    category: 'Marketing',
    definition: {
      nodes: [
        {
          id: 'trigger',
          type: NodeType.MANUAL_TRIGGER,
          name: 'Run manually',
          position: { x: 80, y: 200 },
          config: {},
        },
        {
          id: 'copy',
          type: NodeType.OLLAMA_GENERATE,
          name: 'Ollama: marketing copy',
          alias: 'copy',
          position: { x: 340, y: 200 },
          config: {
            connectionId: '',
            model: 'llama3.1:8b',
            prompt:
              'Write a punchy one-line Instagram promo caption for a new product launch, with 3 hashtags.',
          },
        },
        {
          id: 'image',
          type: NodeType.AI_GENERATE_IMAGE,
          name: 'AI: generate image',
          alias: 'image',
          position: { x: 600, y: 200 },
          config: {
            provider: 'pollinations',
            prompt: 'a sleek studio product shot on a gradient background, soft shadows',
            width: 1024,
            height: 1024,
          },
        },
        {
          id: 'publish',
          type: NodeType.INSTAGRAM_PUBLISH_PHOTO,
          name: 'Instagram: publish photo',
          alias: 'publish',
          position: { x: 860, y: 200 },
          config: {
            connectionId: '',
            igUserId: '',
            imageUrl: '{{ steps.image.imageUrl }}',
            caption: '{{ steps.copy.text }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'copy' },
        { id: 'e2', source: 'copy', target: 'image' },
        { id: 'e3', source: 'image', target: 'publish' },
      ],
    },
  },
  {
    slug: 'instagram-comment-triage',
    name: 'Instagram comment triage',
    description:
      'When a new comment lands on a watched post, an Ollama model scores its sentiment and negative comments are flagged to Slack so the team can respond fast.',
    category: 'Marketing',
    definition: {
      nodes: [
        {
          id: 'trigger',
          type: NodeType.INSTAGRAM_COMMENT_ADDED,
          name: 'Instagram: comment added',
          position: { x: 80, y: 200 },
          config: { connectionId: '', mediaId: '' },
        },
        {
          id: 'classify',
          type: NodeType.OLLAMA_GENERATE,
          name: 'Ollama: sentiment',
          alias: 'classify',
          position: { x: 340, y: 200 },
          config: {
            connectionId: '',
            model: 'llama3.1:8b',
            prompt:
              'Reply with ONLY compact JSON: {"sentiment":"positive|neutral|negative"}.\n\nComment: {{ trigger.text }}',
          },
        },
        {
          id: 'parse',
          type: NodeType.CODE,
          name: 'Parse sentiment',
          alias: 'parse',
          position: { x: 600, y: 200 },
          config: {
            language: 'javascript',
            inputs: { raw: '{{ steps.classify.text }}' },
            code: [
              'let out = { sentiment: "neutral" };',
              'try { out = { ...out, ...JSON.parse(raw) }; } catch (_) {}',
              'return out;',
            ].join('\n'),
          },
        },
        {
          id: 'gate',
          type: NodeType.CONDITIONAL,
          name: 'Negative?',
          position: { x: 860, y: 200 },
          config: { condition: '"{{ steps.parse.sentiment }}" === "negative"' },
        },
        {
          id: 'alert',
          type: NodeType.SLACK_POST_MESSAGE,
          name: 'Slack: flag #social',
          alias: 'alert',
          position: { x: 1120, y: 120 },
          config: {
            connectionId: '',
            channel: '#social',
            text: '⚠️ Negative IG comment from {{ trigger.username }}: {{ trigger.text }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'classify' },
        { id: 'e2', source: 'classify', target: 'parse' },
        { id: 'e3', source: 'parse', target: 'gate' },
        { id: 'e4', source: 'gate', target: 'alert', sourceHandle: 'true' },
      ],
    },
  },
  {
    slug: 'whatsapp-support-autoreply',
    name: 'WhatsApp support auto-reply',
    description:
      'When a customer messages your WhatsApp Business number, an Ollama model drafts a helpful reply and sends it back automatically — first-response in seconds.',
    category: 'Customer Success',
    definition: {
      nodes: [
        {
          id: 'trigger',
          type: NodeType.WHATSAPP_MESSAGE_RECEIVED,
          name: 'WhatsApp: message received',
          position: { x: 80, y: 200 },
          config: { connectionId: '' },
        },
        {
          id: 'reply',
          type: NodeType.OLLAMA_GENERATE,
          name: 'Ollama: draft reply',
          alias: 'reply',
          position: { x: 340, y: 200 },
          config: {
            connectionId: '',
            model: 'llama3.1:8b',
            prompt:
              'You are a friendly support agent. Write a concise, helpful WhatsApp reply to this message:\n\n{{ trigger.body.entry[0].changes[0].value.messages[0].text.body }}',
          },
        },
        {
          id: 'send',
          type: NodeType.WHATSAPP_SEND_MESSAGE,
          name: 'WhatsApp: send reply',
          alias: 'send',
          position: { x: 600, y: 200 },
          config: {
            connectionId: '',
            phoneNumberId: '',
            to: '{{ trigger.body.entry[0].changes[0].value.messages[0].from }}',
            message: '{{ steps.reply.text }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'reply' },
        { id: 'e2', source: 'reply', target: 'send' },
      ],
    },
  },
  {
    slug: 'lead-to-whatsapp-welcome',
    name: 'New lead → WhatsApp welcome',
    description:
      'A new Mailchimp subscriber gets an instant WhatsApp welcome via a pre-approved template — meet new leads where they already are.',
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
          id: 'build',
          type: NodeType.CODE,
          name: 'Build recipient',
          alias: 'build',
          position: { x: 340, y: 200 },
          config: {
            language: 'javascript',
            inputs: { sub: '{{ trigger.body }}' },
            code: [
              'const phone = (sub.merges && sub.merges.PHONE) || "";',
              'return { phone: String(phone).replace(/[^0-9]/g, "") };',
            ].join('\n'),
          },
        },
        {
          id: 'welcome',
          type: NodeType.WHATSAPP_SEND_TEMPLATE,
          name: 'WhatsApp: welcome template',
          alias: 'welcome',
          position: { x: 600, y: 200 },
          config: {
            connectionId: '',
            phoneNumberId: '',
            to: '{{ steps.build.phone }}',
            templateName: 'hello_world',
            languageCode: 'en_US',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'build' },
        { id: 'e2', source: 'build', target: 'welcome' },
      ],
    },
  },
  {
    slug: 'daily-weather-ig-post',
    name: 'Daily weather Instagram post',
    description:
      'Every morning, pull the local forecast from the public Open-Meteo API, have Ollama turn it into a friendly caption, generate a matching image, and publish to Instagram.',
    category: 'Operations & Finance',
    definition: {
      nodes: [
        {
          id: 'cron',
          type: NodeType.CRON_TRIGGER,
          name: 'Every day 07:00',
          position: { x: 80, y: 200 },
          config: { expression: '0 7 * * *' },
        },
        {
          id: 'forecast',
          type: NodeType.HTTP_REQUEST,
          name: 'Open-Meteo: forecast',
          alias: 'forecast',
          position: { x: 340, y: 200 },
          config: {
            method: 'GET',
            url: 'https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&daily=temperature_2m_max,temperature_2m_min&timezone=auto',
            timeout: 10000,
          },
        },
        {
          id: 'caption',
          type: NodeType.OLLAMA_GENERATE,
          name: 'Ollama: weather caption',
          alias: 'caption',
          position: { x: 600, y: 200 },
          config: {
            connectionId: '',
            model: 'llama3.1:8b',
            prompt:
              'Write a one-sentence friendly weather post caption from this forecast JSON:\n\n{{ steps.forecast.body.daily }}',
          },
        },
        {
          id: 'image',
          type: NodeType.AI_GENERATE_IMAGE,
          name: 'AI: generate image',
          alias: 'image',
          position: { x: 860, y: 200 },
          config: {
            provider: 'pollinations',
            prompt: 'a cheerful minimal weather illustration, sky and clouds, flat design',
            width: 1024,
            height: 1024,
          },
        },
        {
          id: 'publish',
          type: NodeType.INSTAGRAM_PUBLISH_PHOTO,
          name: 'Instagram: publish photo',
          alias: 'publish',
          position: { x: 1120, y: 200 },
          config: {
            connectionId: '',
            igUserId: '',
            imageUrl: '{{ steps.image.imageUrl }}',
            caption: '{{ steps.caption.text }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'cron', target: 'forecast' },
        { id: 'e2', source: 'forecast', target: 'caption' },
        { id: 'e3', source: 'caption', target: 'image' },
        { id: 'e4', source: 'image', target: 'publish' },
      ],
    },
  },
];
