import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { docsGetConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const DOCS_GET_TYPE = 'docs-get';

interface ParagraphElement {
  textRun?: { content?: string | null };
}
interface StructuralElement {
  paragraph?: { elements?: ParagraphElement[] };
}

// Flatten the document body into plain text by concatenating every paragraph's
// textRun content. Tables/other structural elements are left to `content`.
const extractPlainText = (content: StructuralElement[]): string => {
  let text = '';
  for (const element of content) {
    for (const el of element.paragraph?.elements ?? []) {
      if (el.textRun?.content) text += el.textRun.content;
    }
  }
  return text;
};

@Injectable()
export class DocsGetAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = DOCS_GET_TYPE;
  readonly name = 'Docs: Get Document';
  readonly description = 'Read a Google Doc — title, plain text, and structural content';
  readonly requiredConnectionType = 'google';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

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
    const params = docsGetConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveFetched: { documentId: params.documentId } },
        metadata: { mocked: true },
      };
    }

    const docs = this.clients.docs({ auth: this.authService.buildClient(connection) });
    const response = await docs.documents.get({ documentId: params.documentId });

    const content = (response.data.body?.content ?? []) as StructuralElement[];

    return {
      data: {
        documentId: response.data.documentId ?? params.documentId,
        title: response.data.title ?? null,
        plainText: extractPlainText(content),
        content,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
