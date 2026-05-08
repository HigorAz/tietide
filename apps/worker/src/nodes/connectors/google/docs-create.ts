import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { docsCreateConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const DOCS_CREATE_TYPE = 'docs-create';

@Injectable()
export class DocsCreateAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = DOCS_CREATE_TYPE;
  readonly name = 'Docs: Create From Template';
  readonly description = 'Copy a Google Doc template and apply text replacements';
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
    const params = docsCreateConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: {
            templateId: params.templateId,
            replacementCount: Object.keys(params.replacements).length,
          },
        },
        metadata: { mocked: true },
      };
    }

    const auth = this.authService.buildClient(connection);
    const drive = this.clients.drive({ auth });
    const docs = this.clients.docs({ auth });

    // Step 1: copy the template via Drive (drive.file scope).
    const copy = await drive.files.copy({
      fileId: params.templateId,
      requestBody: { name: `Generated from ${params.templateId}` },
      fields: 'id, name, webViewLink',
    });
    const documentId = copy.data.id;
    if (typeof documentId !== 'string') {
      throw new Error('Docs: copy did not return a document id');
    }

    // Step 2: apply replacements via Docs batchUpdate (documents scope). Note:
    // failure here leaves an empty copy in the user's Drive — acceptable for
    // MVP, documented in the node description.
    const requests = Object.entries(params.replacements).map(([key, value]) => ({
      replaceAllText: {
        containsText: { text: `{{${key}}}`, matchCase: true },
        replaceText: value,
      },
    }));
    if (requests.length > 0) {
      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });
    }

    return {
      data: {
        documentId,
        name: copy.data.name ?? null,
        webViewLink: copy.data.webViewLink ?? null,
        replacementsApplied: requests.length,
      },
      metadata: { statusCode: copy.status ?? 200 },
    };
  }
}
