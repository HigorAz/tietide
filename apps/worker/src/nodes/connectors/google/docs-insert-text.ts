import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { docsInsertTextConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const DOCS_INSERT_TEXT_TYPE = 'docs-insert-text';

@Injectable()
export class DocsInsertTextAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = DOCS_INSERT_TEXT_TYPE;
  readonly name = 'Docs: Insert Text';
  readonly description = 'Insert text at an index in a Google Doc, or append to the end';
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
    const params = docsInsertTextConfigSchema.parse(input.params);
    const atIndex = params.index !== undefined;

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveInserted: {
            documentId: params.documentId,
            mode: atIndex ? 'at-index' : 'append',
          },
        },
        metadata: { mocked: true },
      };
    }

    // A location targets a specific index; endOfSegmentLocation appends to the
    // body (before its trailing newline).
    const insertText = atIndex
      ? { location: { index: params.index }, text: params.text }
      : { endOfSegmentLocation: {}, text: params.text };

    const docs = this.clients.docs({ auth: this.authService.buildClient(connection) });
    const response = await docs.documents.batchUpdate({
      documentId: params.documentId,
      requestBody: { requests: [{ insertText }] },
    });

    return {
      data: {
        documentId: response.data.documentId ?? params.documentId,
        mode: atIndex ? 'at-index' : 'append',
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
