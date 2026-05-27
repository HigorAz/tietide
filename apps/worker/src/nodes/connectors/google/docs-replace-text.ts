import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { docsReplaceTextConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const DOCS_REPLACE_TEXT_TYPE = 'docs-replace-text';

interface ReplaceReply {
  replaceAllText?: { occurrencesChanged?: number | null };
}

@Injectable()
export class DocsReplaceTextAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = DOCS_REPLACE_TEXT_TYPE;
  readonly name = 'Docs: Replace Text';
  readonly description = 'Find and replace text tokens in a Google Doc (template fill)';
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
    const params = docsReplaceTextConfigSchema.parse(input.params);
    const tokens = Object.keys(params.replacements);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveReplaced: { documentId: params.documentId, tokens } },
        metadata: { mocked: true },
      };
    }

    const requests = tokens.map((token) => ({
      replaceAllText: {
        containsText: { text: token, matchCase: params.matchCase ?? false },
        replaceText: params.replacements[token],
      },
    }));

    const docs = this.clients.docs({ auth: this.authService.buildClient(connection) });
    const response = await docs.documents.batchUpdate({
      documentId: params.documentId,
      requestBody: { requests },
    });

    // Replies are returned in request order; a token with no match reports 0.
    const replies = (response.data.replies ?? []) as ReplaceReply[];
    const replacements: Record<string, number> = {};
    tokens.forEach((token, i) => {
      replacements[token] = replies[i]?.replaceAllText?.occurrencesChanged ?? 0;
    });

    return {
      data: {
        documentId: response.data.documentId ?? params.documentId,
        replacements,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
