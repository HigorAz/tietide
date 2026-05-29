import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  ConnectorMisconfiguredError,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { slackSearchMessagesConfigSchema, type SlackOAuth2Config } from '@tietide/shared';
import { SlackClientFactory } from './slack-client.factory';

export const SLACK_SEARCH_MESSAGES_TYPE = 'slack-search-messages';

interface SlackSearchMatch {
  ts?: string;
  text?: string;
  user?: string;
  username?: string;
  permalink?: string;
  channel?: { id?: string; name?: string };
}

interface SlackSearchResponse {
  ok?: boolean;
  messages?: { total?: number; matches?: SlackSearchMatch[] };
}

@Injectable()
export class SlackSearchMessagesAction extends BaseConnectorAction<SlackOAuth2Config> {
  readonly type = SLACK_SEARCH_MESSAGES_TYPE;
  readonly name = 'Slack: Search Messages';
  readonly description = 'Search Slack messages (requires a user token with search:read)';
  readonly requiredConnectionType = 'slack';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly client: SlackClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<SlackOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = slackSearchMessagesConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveSearched: { query: params.query } },
        metadata: { mocked: true },
      };
    }

    // search.messages requires a user token (xoxp). The bot token returns
    // not_allowed_token_type — surface a clear reconnect hint instead.
    if (!connection.config.userAccessToken) {
      throw new ConnectorMisconfiguredError(
        'Slack search needs a user token — reconnect this Slack connection with the "search:read" scope enabled',
        this.type,
      );
    }

    const search = new URLSearchParams({ query: params.query });
    if (params.count) search.set('count', String(params.count));
    if (params.sort) search.set('sort', params.sort);

    const response = await this.client.call<SlackSearchResponse>(
      connection,
      `/search.messages?${search.toString()}`,
      { method: 'GET', useUserToken: true },
    );

    const matches = response.data.messages?.matches ?? [];
    return {
      data: {
        total: response.data.messages?.total ?? matches.length,
        matches: matches.map((m) => ({
          ts: m.ts ?? null,
          text: m.text ?? null,
          user: m.user ?? null,
          username: m.username ?? null,
          channelId: m.channel?.id ?? null,
          channelName: m.channel?.name ?? null,
          permalink: m.permalink ?? null,
        })),
      },
      metadata: { statusCode: response.status },
    };
  }
}
