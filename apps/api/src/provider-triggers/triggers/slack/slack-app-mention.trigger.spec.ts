import { createHmac } from 'crypto';
import type { ActivationContext, SignatureInput } from '@tietide/sdk';
import { SlackAppMentionTrigger } from './slack-app-mention.trigger';

jest.setTimeout(15000);

const SIGNING_SECRET = 'slack-signing-secret';
const TEAM_ID = 'T123';

function signedHeaders(
  rawBody: Buffer,
  ts?: number,
  secret = SIGNING_SECRET,
): Record<string, string> {
  const timestamp = String(ts ?? Math.floor(Date.now() / 1000));
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
      scope: 'app_mentions:read',
      signingSecret,
    },
  } as unknown as ActivationContext['connection'];
}

describe('SlackAppMentionTrigger', () => {
  let trigger: SlackAppMentionTrigger;

  beforeEach(() => {
    trigger = new SlackAppMentionTrigger();
  });

  it('exposes the slack-app-mention type', () => {
    expect(trigger.type).toBe('slack-app-mention');
    expect(trigger.name).toMatch(/app mention/i);
  });

  it('accepts a valid Slack v0 signature', () => {
    const rawBody = Buffer.from(JSON.stringify({ event: { type: 'app_mention' } }));
    const input: SignatureInput = {
      rawBody,
      headers: signedHeaders(rawBody),
      signingSecret: SIGNING_SECRET,
    };
    expect(trigger.verifySignature(input)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const rawBody = Buffer.from(JSON.stringify({ event: { type: 'app_mention' } }));
    const headers = signedHeaders(rawBody);
    const tampered = Buffer.from(JSON.stringify({ event: { type: 'app_mention', evil: true } }));
    expect(
      trigger.verifySignature({ rawBody: tampered, headers, signingSecret: SIGNING_SECRET }),
    ).toBe(false);
  });

  it('answers the url_verification handshake', () => {
    const rawBody = Buffer.from(JSON.stringify({ type: 'url_verification', challenge: 'abc' }));
    expect(trigger.handleValidation({ query: {}, headers: {}, rawBody })).toEqual({
      body: 'abc',
      contentType: 'text/plain',
    });
  });

  it('onActivate returns the signing secret and a stable providerSubId', async () => {
    const result = await trigger.onActivate({
      workflowId: 'wf-1',
      nodeId: 'node-1',
      callbackUrl: 'https://api.example/v1/provider-webhooks/slack/sub-1',
      connection: baseConn(SIGNING_SECRET),
      config: {},
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    } as unknown as ActivationContext);
    expect(result.signingSecret).toBe(SIGNING_SECRET);
    expect(result.providerSubId).toBe(`slack-events:${TEAM_ID}:slack-app-mention`);
  });

  it('onActivate throws when the connection lacks a signing secret', async () => {
    await expect(
      trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: 'https://api.example/cb',
        connection: baseConn(undefined),
        config: {},
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      } as unknown as ActivationContext),
    ).rejects.toThrow(/signingSecret/i);
  });
});
