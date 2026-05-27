import { Logger } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import {
  BasePushTrigger,
  type ActivationContext,
  type ActivationResult,
  type DeactivationContext,
  type SignatureInput,
} from '@tietide/sdk';

interface GitHubOAuth2Config {
  accessToken: string;
}

interface GitHubWebhookNodeConfig {
  owner?: string;
  repo?: string;
}

const DEFAULT_GITHUB_API_URL = 'https://api.github.com';

/**
 * Shared logic for GitHub repository webhook triggers. GitHub differs from
 * providers like Stripe: it does NOT return a signing secret — the caller
 * supplies one when creating the hook — so onActivate generates a random secret
 * and returns it for encrypted storage. Deliveries are signed with
 * HMAC-SHA256 over the raw body, surfaced in the `X-Hub-Signature-256` header.
 *
 * Subclasses pick the GitHub event to subscribe to (`issues`, `pull_request`).
 */
export abstract class GithubRepoWebhookBaseTrigger extends BasePushTrigger {
  protected abstract readonly event: string;

  private readonly githubLog = new Logger(GithubRepoWebhookBaseTrigger.name);

  verifySignature(input: SignatureInput): boolean {
    const header = this.headerOf(input.headers, 'x-hub-signature-256');
    if (!header || !header.startsWith('sha256=')) return false;

    const expectedHex = createHmac('sha256', input.signingSecret)
      .update(Buffer.from(input.rawBody))
      .digest('hex');

    let provided: Buffer;
    let expected: Buffer;
    try {
      provided = Buffer.from(header.slice('sha256='.length), 'hex');
      expected = Buffer.from(expectedHex, 'hex');
    } catch {
      return false;
    }
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  }

  async onActivate(ctx: ActivationContext): Promise<ActivationResult> {
    const cfg = ctx.connection.config as unknown as GitHubOAuth2Config;
    const node = (ctx.config ?? {}) as GitHubWebhookNodeConfig;
    if (!node.owner || !node.repo) {
      throw new Error('GitHub trigger requires owner and repo in node config');
    }

    // GitHub never returns a secret — we generate one and hand it over at hook
    // creation, then return it so the platform stores it for HMAC verification.
    const secret = randomBytes(32).toString('hex');
    const url = `${this.baseUrl()}/repos/${encodeURIComponent(node.owner)}/${encodeURIComponent(
      node.repo,
    )}/hooks`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.authHeaders(cfg.accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: [this.event],
        config: { url: ctx.callbackUrl, content_type: 'json', secret },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub webhook create failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as { id?: number };
    if (json.id === undefined || json.id === null) {
      throw new Error('GitHub webhook create did not return an id');
    }

    return { providerSubId: String(json.id), signingSecret: secret };
  }

  async onDeactivate(ctx: DeactivationContext): Promise<void> {
    const cfg = ctx.connection.config as unknown as GitHubOAuth2Config;
    const node = (ctx.config ?? {}) as GitHubWebhookNodeConfig;
    if (!node.owner || !node.repo) return;

    const url = `${this.baseUrl()}/repos/${encodeURIComponent(node.owner)}/${encodeURIComponent(
      node.repo,
    )}/hooks/${encodeURIComponent(ctx.providerSubId)}`;

    const res = await fetch(url, { method: 'DELETE', headers: this.authHeaders(cfg.accessToken) });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      this.githubLog.warn(
        { providerSubId: ctx.providerSubId, status: res.status, body: text },
        'GitHub webhook delete failed',
      );
    }
  }

  private baseUrl(): string {
    const override = process.env.GITHUB_API_URL;
    return override && override.length > 0 ? override.replace(/\/+$/, '') : DEFAULT_GITHUB_API_URL;
  }

  private authHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private headerOf(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | null {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== lower) continue;
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
    }
    return null;
  }
}
