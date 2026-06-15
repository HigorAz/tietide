import { WhatsappSendMessageAction } from './whatsapp-send-message';
import { WhatsappSendTemplateAction } from './whatsapp-send-template';
import { MetaGraphClientFactory } from '../meta/meta-graph-client.factory';
import type { DecryptedConnection, ExecutionContext, NodeInput } from '@tietide/sdk';

const connection = {
  id: 'c1',
  provider: 'whatsapp',
  config: { accessToken: 'tok' },
} as unknown as DecryptedConnection<{ accessToken: string }>;

const ctx = { isDryRun: false } as ExecutionContext;
const connId = '11111111-1111-4111-8111-111111111111';

const input = (params: Record<string, unknown>): NodeInput => ({
  data: {},
  params,
  connectionId: 'c1',
});

describe('WhatsappSendMessageAction', () => {
  it('POSTs a text message to /{phoneNumberId}/messages', async () => {
    const client = {
      call: jest.fn().mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.1' }] } }),
    } as unknown as MetaGraphClientFactory;
    const action = new WhatsappSendMessageAction(client);

    const out = await action['run'](
      input({ connectionId: connId, phoneNumberId: '5511', to: '15551230000', message: 'hi' }),
      connection,
      ctx,
    );

    const [, path, init] = (client.call as jest.Mock).mock.calls[0];
    expect(path).toBe('/5511/messages');
    expect(init.method).toBe('POST');
    expect(init.body).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '15551230000',
      type: 'text',
      text: { body: 'hi', preview_url: false },
    });
    expect(out.data.messageId).toBe('wamid.1');
  });
});

describe('WhatsappSendTemplateAction', () => {
  it('POSTs a template with body parameters', async () => {
    const client = {
      call: jest.fn().mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.2' }] } }),
    } as unknown as MetaGraphClientFactory;
    const action = new WhatsappSendTemplateAction(client);

    const out = await action['run'](
      input({
        connectionId: connId,
        phoneNumberId: '5511',
        to: '15551230000',
        templateName: 'order_update',
        languageCode: 'en_US',
        bodyParams: ['Ada', '#42'],
      }),
      connection,
      ctx,
    );

    const [, , init] = (client.call as jest.Mock).mock.calls[0];
    expect(init.body.type).toBe('template');
    expect(init.body.template).toEqual({
      name: 'order_update',
      language: { code: 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Ada' },
            { type: 'text', text: '#42' },
          ],
        },
      ],
    });
    expect(out.data.messageId).toBe('wamid.2');
  });

  it('omits components when there are no body params', async () => {
    const client = {
      call: jest.fn().mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.3' }] } }),
    } as unknown as MetaGraphClientFactory;
    const action = new WhatsappSendTemplateAction(client);

    await action['run'](
      input({
        connectionId: connId,
        phoneNumberId: '5511',
        to: '15551230000',
        templateName: 'hello_world',
        languageCode: 'en_US',
      }),
      connection,
      ctx,
    );

    const [, , init] = (client.call as jest.Mock).mock.calls[0];
    expect(init.body.template.components).toBeUndefined();
  });
});
