import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  ConnectorMisconfiguredError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import {
  DISCORD_WEBHOOK_URL_REGEX,
  discordPostWebhookConfigSchema,
  type DiscordWebhookConfig,
} from '@tietide/shared';

export const DISCORD_POST_WEBHOOK_TYPE = 'discord-post-webhook';

export class DiscordHttpError extends Error {
  readonly response: { status: number; body: unknown };

  constructor(status: number, body: unknown) {
    super(`Discord webhook request failed with status ${status}`);
    this.response = { status, body };
  }
}

@Injectable()
export class DiscordPostWebhookAction extends BaseConnectorAction<DiscordWebhookConfig> {
  readonly type = DISCORD_POST_WEBHOOK_TYPE;
  readonly name = 'Discord: Post via Webhook';
  readonly description = 'Send a message to a Discord channel via its incoming webhook URL';
  readonly requiredConnectionType = 'discord';

  // Inject fetch for testability without monkey-patching globals.
  constructor(private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<DiscordWebhookConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = discordPostWebhookConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSent: { content: params.content, embedCount: params.embeds?.length ?? 0 },
        },
        metadata: { mocked: true },
      };
    }

    // Defense in depth: re-validate the URL on the connection at runtime in case
    // it was mutated externally and bypassed schema validation at boundary.
    if (!DISCORD_WEBHOOK_URL_REGEX.test(connection.config.webhookUrl)) {
      throw new ConnectorMisconfiguredError(
        'Discord connection webhookUrl is not a valid Discord webhook URL',
        this.type,
      );
    }

    const payload: Record<string, unknown> = { content: params.content };
    if (params.username) payload.username = params.username;
    if (params.avatarUrl) payload.avatar_url = params.avatarUrl;
    if (params.embeds) payload.embeds = params.embeds;

    // wait=true makes Discord echo back the created message so we can return its id.
    const url = `${connection.config.webhookUrl}?wait=true`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (res.status >= 400) {
      throw new DiscordHttpError(res.status, body);
    }

    const messageId = (body as { id?: unknown } | null)?.id;
    return {
      data: {
        ok: true,
        messageId: typeof messageId === 'string' ? messageId : null,
      },
      metadata: { statusCode: res.status },
    };
  }
}
