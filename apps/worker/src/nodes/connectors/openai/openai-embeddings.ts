import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { openaiEmbeddingsConfigSchema, type OpenAIApiKeyConfig } from '@tietide/shared';
import { OpenaiClientFactory } from './openai-client.factory';

export const OPENAI_EMBEDDINGS_TYPE = 'openai-embeddings';

@Injectable()
export class OpenaiEmbeddingsAction extends BaseConnectorAction<OpenAIApiKeyConfig> {
  readonly type = OPENAI_EMBEDDINGS_TYPE;
  readonly name = 'OpenAI: Embeddings';
  readonly description = 'Generate an embedding vector for a text input';
  readonly requiredConnectionType = 'openai';

  constructor(private readonly client: OpenaiClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<OpenAIApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = openaiEmbeddingsConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, embedding: [], dimensions: 0, model: params.model },
        metadata: { mocked: true },
      };
    }

    const response = await this.client.createEmbeddings(connection, {
      model: params.model,
      input: params.input,
    });

    return {
      data: {
        embedding: response.embedding,
        dimensions: response.dimensions,
        model: response.model,
        usage: { inputTokens: response.inputTokens },
      },
      metadata: { statusCode: 200 },
    };
  }
}
