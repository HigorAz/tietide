import { createHmac } from 'crypto';
import { GithubPrOpenedTrigger } from './github-pr-opened.trigger';
import type { SignatureInput } from '@tietide/sdk';

const SECRET = 'whsec_github_pr_1234567890';
const CALLBACK = 'https://api.example.com/v1/provider-webhooks/github/sub-2';

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(Buffer.from(body)).digest('hex');
}

function input(overrides: Partial<SignatureInput> = {}): SignatureInput {
  return {
    rawBody: new TextEncoder().encode('{}'),
    headers: {},
    signingSecret: SECRET,
    ...overrides,
  };
}

describe('GithubPrOpenedTrigger', () => {
  let trigger: GithubPrOpenedTrigger;

  beforeEach(() => {
    trigger = new GithubPrOpenedTrigger();
  });

  it('declares the github-pr-opened type', () => {
    expect(trigger.type).toBe('github-pr-opened');
  });

  describe('verifySignature (X-Hub-Signature-256)', () => {
    it('accepts a valid HMAC-SHA256 signature', () => {
      const body = '{"action":"opened","pull_request":{"number":12}}';
      expect(
        trigger.verifySignature(
          input({
            rawBody: new TextEncoder().encode(body),
            headers: { 'x-hub-signature-256': sign(body) },
          }),
        ),
      ).toBe(true);
    });

    it('rejects a tampered body', () => {
      const sig = sign('{"action":"opened"}');
      expect(
        trigger.verifySignature(
          input({
            rawBody: new TextEncoder().encode('{"action":"synchronize"}'),
            headers: { 'x-hub-signature-256': sig },
          }),
        ),
      ).toBe(false);
    });
  });

  describe('lifecycle', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch');
    });
    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('onActivate subscribes to the pull_request event', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ id: 11122 }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await trigger.onActivate({
        workflowId: 'wf-1',
        nodeId: 'node-1',
        callbackUrl: CALLBACK,
        connection: {
          id: 'c1',
          type: 'OAUTH2',
          provider: 'github',
          config: { accessToken: 'gho_t' },
        },
        config: { owner: 'octocat', repo: 'hello-world' },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });

      const [, init] = fetchSpy.mock.calls[0];
      expect(JSON.parse(init.body as string).events).toEqual(['pull_request']);
      expect(result.providerSubId).toBe('11122');
    });
  });
});
