import { createHmac } from 'crypto';
import type { ActivationContext, SignatureInput } from '@tietide/sdk';
import { SlackChannelCreatedTrigger } from './slack-channel-created.trigger';

jest.setTimeout(15000);

const SIGNING_SECRET = 'slack-signing-secret';
const TEAM_ID = 'T123';

function signedHeaders(rawBody: Buffer, secret = SIGNING_SECRET): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig =
    'v0=' +
    createHmac('sha256', secret)
      .update(`v0:${timestamp}:${rawBody.toString('utf8')}`)
      .digest('hex');
  return { 'x-slack-request-timestamp': timestamp, 'x-slack-signature': sig };
}

function baseConn(signingSecret?: string): ActivationContext['connection'] {
  return {
    id: 'conn-1',
    provider: 'slack',
    config: {
      accessToken: 'xoxb',
      teamId: TEAM_ID,
      botUserId: 'U1',
      scope: 'channels:read',
      signingSecret,
    },
  } as unknown as ActivationContext['connection'];
}

describe('SlackChannelCreatedTrigger', () => {
  let trigger: SlackChannelCreatedTrigger;

  beforeEach(() => {
    trigger = new SlackChannelCreatedTrigger();
  });

  it('exposes the slack-channel-created type', () => {
    expect(trigger.type).toBe('slack-channel-created');
    expect(trigger.name).toMatch(/channel created/i);
  });

  it('accepts a valid Slack v0 signature', () => {
    const rawBody = Buffer.from(JSON.stringify({ event: { type: 'channel_created' } }));
    const input: SignatureInput = {
      rawBody,
      headers: signedHeaders(rawBody),
      signingSecret: SIGNING_SECRET,
    };
    expect(trigger.verifySignature(input)).toBe(true);
  });

  it('rejects when signed with the wrong secret', () => {
    const rawBody = Buffer.from(JSON.stringify({ event: { type: 'channel_created' } }));
    const headers = signedHeaders(rawBody, 'wrong-secret');
    expect(trigger.verifySignature({ rawBody, headers, signingSecret: SIGNING_SECRET })).toBe(
      false,
    );
  });

  it('answers the url_verification handshake', () => {
    const rawBody = Buffer.from(JSON.stringify({ type: 'url_verification', challenge: 'xyz' }));
    expect(trigger.handleValidation({ query: {}, headers: {}, rawBody })).toEqual({
      body: 'xyz',
      contentType: 'text/plain',
    });
  });

  it('onActivate returns the signing secret and a stable providerSubId', async () => {
    const result = await trigger.onActivate({
      workflowId: 'wf-1',
      nodeId: 'node-1',
      callbackUrl: 'https://api.example/cb',
      connection: baseConn(SIGNING_SECRET),
      config: {},
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    } as unknown as ActivationContext);
    expect(result.signingSecret).toBe(SIGNING_SECRET);
    expect(result.providerSubId).toBe(`slack-events:${TEAM_ID}:slack-channel-created`);
  });
});
