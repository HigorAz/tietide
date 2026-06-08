import { NodeType } from '@tietide/shared';
import type { LibraryTemplate } from './types';

/**
 * Operations & Finance templates. `weather-ops-alert` calls the public, no-auth
 * Open-Meteo forecast API so it runs out-of-box except for the Telegram binding.
 */
export const OPERATIONS_TEMPLATES: readonly LibraryTemplate[] = [
  {
    slug: 'stripe-payment-ops',
    name: 'Stripe payment ops',
    description:
      'When a Stripe invoice is paid, log the revenue to a Google Sheet, attach a HubSpot note, ping the finance channel, and email the customer a thank-you.',
    category: 'Operations & Finance',
    definition: {
      nodes: [
        {
          id: 'trigger',
          type: NodeType.STRIPE_INVOICE_PAID,
          name: 'Stripe: invoice paid',
          position: { x: 80, y: 220 },
          config: { connectionId: '' },
        },
        {
          id: 'extract',
          type: NodeType.CODE,
          name: 'Extract customer + amount',
          alias: 'extract',
          position: { x: 340, y: 220 },
          config: {
            language: 'javascript',
            inputs: { invoice: '{{ trigger.body.data.object }}' },
            code: [
              'const amount = (invoice.amount_paid || 0) / 100;',
              'return {',
              '  customer: invoice.customer_email || invoice.customer || "unknown",',
              '  amount,',
              '  currency: (invoice.currency || "usd").toUpperCase(),',
              '};',
            ].join('\n'),
          },
        },
        {
          id: 'log',
          type: NodeType.SHEETS_APPEND,
          name: 'Sheets: revenue log',
          alias: 'log',
          position: { x: 600, y: 220 },
          config: {
            connectionId: '',
            spreadsheetId: '',
            sheet: 'Revenue',
            values: [
              [
                '{{ steps.extract.customer }}',
                '{{ steps.extract.amount }}',
                '{{ steps.extract.currency }}',
              ],
            ],
          },
        },
        {
          id: 'note',
          type: NodeType.HUBSPOT_CREATE_NOTE,
          name: 'HubSpot: log note',
          alias: 'note',
          position: { x: 860, y: 220 },
          config: {
            connectionId: '',
            body: 'Invoice paid: {{ steps.extract.amount }} {{ steps.extract.currency }} from {{ steps.extract.customer }}.',
          },
        },
        {
          id: 'notify',
          type: NodeType.SLACK_POST_MESSAGE,
          name: 'Slack: notify #finance',
          alias: 'notify',
          position: { x: 1120, y: 220 },
          config: {
            connectionId: '',
            channel: '#finance',
            text: '💰 {{ steps.extract.amount }} {{ steps.extract.currency }} paid by {{ steps.extract.customer }}',
          },
        },
        {
          id: 'thanks',
          type: NodeType.GMAIL_SEND,
          name: 'Gmail: thank-you',
          alias: 'thanks',
          position: { x: 1380, y: 220 },
          config: {
            connectionId: '',
            to: '{{ steps.extract.customer }}',
            subject: 'Thank you for your payment',
            body: 'We received your payment of {{ steps.extract.amount }} {{ steps.extract.currency }}. Thank you!',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'extract' },
        { id: 'e2', source: 'extract', target: 'log' },
        { id: 'e3', source: 'log', target: 'note' },
        { id: 'e4', source: 'note', target: 'notify' },
        { id: 'e5', source: 'notify', target: 'thanks' },
      ],
    },
  },
  {
    slug: 'weather-ops-alert',
    name: 'Weather ops alert',
    description:
      'A scheduled check pulls the daily forecast from the public Open-Meteo API and sends a Telegram alert when heavy rain or high winds are expected.',
    category: 'Operations & Finance',
    definition: {
      nodes: [
        {
          id: 'cron',
          type: NodeType.CRON_TRIGGER,
          name: 'Every day 06:00',
          position: { x: 80, y: 200 },
          config: { expression: '0 6 * * *' },
        },
        {
          id: 'weather',
          type: NodeType.HTTP_REQUEST,
          name: 'Open-Meteo: forecast',
          alias: 'weather',
          position: { x: 340, y: 200 },
          config: {
            method: 'GET',
            url: 'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&daily=precipitation_sum,wind_speed_10m_max&timezone=auto',
            timeout: 10000,
          },
        },
        {
          id: 'decide',
          type: NodeType.CODE,
          name: 'Decide alert',
          alias: 'decide',
          position: { x: 600, y: 200 },
          config: {
            language: 'javascript',
            inputs: { forecast: '{{ steps.weather.body }}' },
            code: [
              'const daily = forecast.daily || {};',
              'const rain = (daily.precipitation_sum || [0])[0];',
              'const wind = (daily.wind_speed_10m_max || [0])[0];',
              'const alert = rain > 10 || wind > 40;',
              'return { alert, rain, wind, message: `Rain ${rain}mm, wind ${wind}km/h` };',
            ].join('\n'),
          },
        },
        {
          id: 'gate',
          type: NodeType.CONDITIONAL,
          name: 'Severe weather?',
          position: { x: 860, y: 200 },
          config: { condition: '{{ steps.decide.alert }} === true' },
        },
        {
          id: 'notify',
          type: NodeType.TELEGRAM_SEND_MESSAGE,
          name: 'Telegram: send alert',
          alias: 'notify',
          position: { x: 1120, y: 120 },
          config: {
            connectionId: '',
            chatId: '',
            text: '🌧️ Weather alert — {{ steps.decide.message }}',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'cron', target: 'weather' },
        { id: 'e2', source: 'weather', target: 'decide' },
        { id: 'e3', source: 'decide', target: 'gate' },
        { id: 'e4', source: 'gate', target: 'notify', sourceHandle: 'true' },
      ],
    },
  },
];
