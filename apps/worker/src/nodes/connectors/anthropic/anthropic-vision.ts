import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import {
  anthropicVisionConfigSchema,
  aiNodeOutputSchema,
  type AnthropicApiKeyConfig,
} from '@tietide/shared';
import { ClaudeClientFactory } from './claude-client.factory';

export const ANTHROPIC_VISION_TYPE = 'anthropic-vision';

@Injectable()
export class AnthropicVisionAction extends BaseConnectorAction<AnthropicApiKeyConfig> {
  readonly type = ANTHROPIC_VISION_TYPE;
  readonly name = 'Claude: Vision';
  readonly description = 'Analyze an image (URL or base64) with a Claude vision prompt';
  readonly requiredConnectionType = 'anthropic';
  readonly outputSchema = aiNodeOutputSchema;

  constructor(private readonly client: ClaudeClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<AnthropicApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = anthropicVisionConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          text: '',
          usage: { inputTokens: 0, outputTokens: 0 },
          model: params.model,
          finishReason: null,
        },
        metadata: { mocked: true },
      };
    }

    const response = await this.client.createVisionMessage(connection, {
      model: params.model,
      prompt: params.prompt,
      maxTokens: params.maxTokens,
      imageUrl: params.imageUrl,
      imageBase64: params.imageBase64,
      mediaType: params.mediaType,
    });

    return {
      data: {
        text: response.text,
        usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens },
        model: response.model,
        finishReason: response.stopReason,
      },
      metadata: { statusCode: 200 },
    };
  }
}
