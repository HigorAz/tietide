import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { gmailSearchConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const GMAIL_SEARCH_TYPE = 'gmail-search';

@Injectable()
export class GmailSearchAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = GMAIL_SEARCH_TYPE;
  readonly name = 'Gmail: Search Messages';
  readonly description = 'Search Gmail messages with Gmail search syntax';
  readonly requiredConnectionType = 'google';

  constructor(
    private readonly authService: GoogleAuthService,
    @Inject(GOOGLE_CLIENTS) private readonly clients: GoogleClientFactories,
  ) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<GoogleOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = gmailSearchConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSearched: { query: params.query, maxResults: params.maxResults ?? null },
          messages: [],
          resultSizeEstimate: 0,
        },
        metadata: { mocked: true },
      };
    }

    const client = this.clients.gmail({ auth: this.authService.buildClient(connection) });
    const response = await client.users.messages.list({
      userId: 'me',
      q: params.query,
      maxResults: params.maxResults,
    });

    return {
      data: {
        messages: response.data.messages ?? [],
        nextPageToken: response.data.nextPageToken ?? null,
        resultSizeEstimate: response.data.resultSizeEstimate ?? 0,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
