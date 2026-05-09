import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { aiNodeOutputSchema, ollamaGenerateConfigSchema, type OllamaConfig } from '@tietide/shared';
import { OllamaClientFactory } from './ollama-client.factory';

export const OLLAMA_GENERATE_TYPE = 'ollama-generate';

@Injectable()
export class OllamaGenerateAction extends BaseConnectorAction<OllamaConfig> {
  readonly type = OLLAMA_GENERATE_TYPE;
  readonly name = 'Ollama: Generate';
  readonly description =
    'Generate text from a self-hosted Ollama server (per-workspace connection)';
  readonly requiredConnectionType = 'ollama';
  readonly outputSchema = aiNodeOutputSchema;

  constructor(private readonly client: OllamaClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<OllamaConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = ollamaGenerateConfigSchema.parse(input.params);
    // Node-level model override falls back to the connection-level default.
    const model = params.model ?? connection.config.model;

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          text: '',
          usage: { inputTokens: 0, outputTokens: 0 },
          model,
          finishReason: null,
        },
        metadata: { mocked: true },
      };
    }

    const result = await this.client.generate(connection, {
      model,
      prompt: params.prompt,
    });

    return {
      data: {
        text: result.text,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
        model: result.model,
        finishReason: result.finishReason,
      },
      metadata: { statusCode: 200 },
    };
  }
}
