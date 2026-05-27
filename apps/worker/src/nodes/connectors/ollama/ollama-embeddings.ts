import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { ollamaEmbeddingsConfigSchema, type OllamaConfig } from '@tietide/shared';
import { OllamaClientFactory } from './ollama-client.factory';

export const OLLAMA_EMBEDDINGS_TYPE = 'ollama-embeddings';

@Injectable()
export class OllamaEmbeddingsAction extends BaseConnectorAction<OllamaConfig> {
  readonly type = OLLAMA_EMBEDDINGS_TYPE;
  readonly name = 'Ollama: Embeddings';
  readonly description = 'Generate an embedding vector from a self-hosted Ollama model';
  readonly requiredConnectionType = 'ollama';

  constructor(private readonly client: OllamaClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<OllamaConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = ollamaEmbeddingsConfigSchema.parse(input.params);
    // Node-level model override falls back to the connection-level default.
    const model = params.model ?? connection.config.model;

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, embedding: [], dimensions: 0, model },
        metadata: { mocked: true },
      };
    }

    const result = await this.client.embeddings(connection, { model, prompt: params.prompt });

    return {
      data: {
        embedding: result.embedding,
        dimensions: result.dimensions,
        model: result.model,
      },
      metadata: { statusCode: 200 },
    };
  }
}
