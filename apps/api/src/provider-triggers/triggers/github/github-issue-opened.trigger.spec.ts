import { createHmac } from 'crypto';
import { GithubIssueOpenedTrigger } from './github-issue-opened.trigger';
import type { SignatureInput } from '@tietide/sdk';

const SECRET = 'whsec_github_1234567890';
const CALLBACK = 'https://api.example.com/v1/provider-webhooks/github/sub-1';

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

describe('GithubIssueOpenedTrigger', () => {
  let trigger: GithubIssueOpenedTrigger;

  beforeEach(() => {
    trigger = new GithubIssueOpenedTrigger();
  });

  it('declares the github-issue-opened type', () => {
    expect(trigger.type).toBe('github-issue-opened');
  });

  describe('verifySignature (X-Hub-Signature-256)', () => {
    it('accepts a valid HMAC-SHA256 signature', () => {
      const body = '{"action":"opened","issue":{"number":7}}';
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
            rawBody: new TextEncoder().encode('{"action":"closed"}'),
            headers: { 'x-hub-signature-256': sig },
          }),
        ),
      ).toBe(false);
    });

    it('rejects when the signature header is missing', () => {
      expect(trigger.verifySignature(input({ headers: {} }))).toBe(false);
    });

    it('rejects a header without the sha256= prefix', () => {
      expect(
        trigger.verifySignature(input({ headers: { 'x-hub-signature-256': 'deadbeef' } })),
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

    it('onActivate creates an issues webhook with a generated secret', async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ id: 98765 }), {
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
          config: { accessToken: 'gho_token' },
        },
        config: { owner: 'octocat', repo: 'hello-world' },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      });

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toContain('/repos/octocat/hello-world/hooks');
      expect(init.method).toBe('POST');
      const payload = JSON.parse(init.body as string);
      expect(payload.events).toEqual(['issues']);
      expect(payload.config.url).toBe(CALLBACK);
      expect(typeof payload.config.secret).toBe('string');
      expect(result.providerSubId).toBe('98765');
      // The secret returned for storage is the one sent to GitHub.
      expect(result.signingSecret).toBe(payload.config.secret);
    });

    it('throws when owner/repo are missing', async () => {
      await expect(
        trigger.onActivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          callbackUrl: CALLBACK,
          connection: {
            id: 'c1',
            type: 'OAUTH2',
            provider: 'github',
            config: { accessToken: 't' },
          },
          config: {},
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).rejects.toThrow(/owner and repo/);
    });

    it('onDeactivate DELETEs the hook and tolerates 404', async () => {
      fetchSpy.mockResolvedValue(new Response('', { status: 404 }));
      await expect(
        trigger.onDeactivate({
          workflowId: 'wf-1',
          nodeId: 'node-1',
          providerSubId: '98765',
          connection: {
            id: 'c1',
            type: 'OAUTH2',
            provider: 'github',
            config: { accessToken: 't' },
          },
          config: { owner: 'octocat', repo: 'hello-world' },
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        }),
      ).resolves.toBeUndefined();
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toContain('/repos/octocat/hello-world/hooks/98765');
      expect(init.method).toBe('DELETE');
    });
  });
});
