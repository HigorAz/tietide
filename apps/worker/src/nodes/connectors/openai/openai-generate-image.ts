import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { openaiGenerateImageConfigSchema, type OpenAIApiKeyConfig } from '@tietide/shared';
import { OpenaiClientFactory } from './openai-client.factory';

export const OPENAI_GENERATE_IMAGE_TYPE = 'openai-generate-image';

@Injectable()
export class OpenaiGenerateImageAction extends BaseConnectorAction<OpenAIApiKeyConfig> {
  readonly type = OPENAI_GENERATE_IMAGE_TYPE;
  readonly name = 'OpenAI: Generate Image';
  readonly description = 'Generate an image from a text prompt (DALL·E)';
  readonly requiredConnectionType = 'openai';

  constructor(private readonly client: OpenaiClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<OpenAIApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = openaiGenerateImageConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, images: [], model: params.model },
        metadata: { mocked: true },
      };
    }

    const response = await this.client.createImage(connection, {
      model: params.model,
      prompt: params.prompt,
      size: params.size,
      count: params.count,
    });

    return {
      data: {
        images: response.images,
        count: response.images.length,
        model: response.model,
      },
      metadata: { statusCode: 200 },
    };
  }
}
