import { Injectable, Optional } from '@nestjs/common';
import { BaseAction, type ExecutionContext, type NodeInput } from '@tietide/sdk';
import { discordReplyToCommandConfigSchema } from '@tietide/shared';
import { DiscordHttpError } from './discord-post-webhook';

export const DISCORD_REPLY_TO_COMMAND_TYPE = 'discord-reply-to-command';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

@Injectable()
export class DiscordReplyToCommandAction extends BaseAction {
  readonly type = DISCORD_REPLY_TO_COMMAND_TYPE;
  readonly name = 'Discord: Reply to Slash Command';
  readonly description =
    'Reply to the Discord slash command that triggered this workflow with a message';

  // Inject fetch for testability (see DiscordPostWebhookAction for why @Optional()).
  constructor(@Optional() private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)) {
    super();
  }

  protected async run(
    input: NodeInput,
    context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const params = discordReplyToCommandConfigSchema.parse(input.params);

    // The interaction token + application id flow in from the trigger node's
    // output (input.data). Explicit config (data-pill overrides) wins when set.
    const token = params.interactionToken ?? asString(input.data?.token);
    const applicationId = params.applicationId ?? asString(input.data?.application_id);

    if (!token || !applicationId) {
      throw new Error(
        'Discord reply needs the interaction token and application id. Place this action ' +
          'downstream of a Discord slash-command trigger, or set interactionToken/applicationId.',
      );
    }

    if (context.isDryRun && params.mockOnDryRun) {
      return { mocked: true, wouldHaveReplied: { content: params.content } };
    }

    // Edit the deferred ("thinking…") response the webhook already sent.
    // The interaction token authorizes this call — no bot token needed. Valid 15 min.
    const url = `${DISCORD_API_BASE}/webhooks/${applicationId}/${token}/messages/@original`;
    const res = await this.fetchImpl(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: params.content }),
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
    return { ok: true, messageId: typeof messageId === 'string' ? messageId : null };
  }
}
