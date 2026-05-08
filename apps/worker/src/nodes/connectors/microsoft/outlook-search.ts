import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { outlookSearchConfigSchema, type MicrosoftOAuth2Config } from '@tietide/shared';
import { MicrosoftAuthService } from './microsoft-auth';

export const OUTLOOK_SEARCH_TYPE = 'outlook-search';
const DEFAULT_MAX_RESULTS = 10;
const SELECT_FIELDS = 'id,subject,from,receivedDateTime,bodyPreview';

interface OutlookMessage {
  id?: string;
  subject?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  receivedDateTime?: string;
  bodyPreview?: string;
}

@Injectable()
export class OutlookSearchAction extends BaseConnectorAction<MicrosoftOAuth2Config> {
  readonly type = OUTLOOK_SEARCH_TYPE;
  readonly name = 'Outlook: Search Inbox';
  readonly description = 'Search Outlook messages with Microsoft Search syntax';
  readonly requiredConnectionType = 'microsoft';

  constructor(private readonly authService: MicrosoftAuthService) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<MicrosoftOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = outlookSearchConfigSchema.parse(input.params);
    const top = params.maxResults ?? DEFAULT_MAX_RESULTS;

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveSearched: { query: params.query, maxResults: top },
          messages: [],
          count: 0,
        },
        metadata: { mocked: true },
      };
    }

    const search = encodeURIComponent(`"${params.query}"`);
    const select = encodeURIComponent(SELECT_FIELDS);
    const path = `/v1.0/me/messages?%24search=${search}&%24top=${top}&%24select=${select}`;

    const response = await this.authService.graphFetch<{ value?: OutlookMessage[] }>(
      connection,
      path,
    );
    const value = response.data?.value ?? [];

    return {
      data: {
        messages: value,
        count: value.length,
      },
      metadata: { statusCode: response.status },
    };
  }
}
