import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import {
  aiNodeOutputSchema,
  openaiChatCompletionConfigSchema,
  type OpenAIApiKeyConfig,
} from '@tietide/shared';
import { OpenaiClientFactory } from './openai-client.factory';

export const OPENAI_CHAT_COMPLETION_TYPE = 'openai-chat-completion';

@Injectable()
export class OpenaiChatCompletionAction extends BaseConnectorAction<OpenAIApiKeyConfig> {
  readonly type = OPENAI_CHAT_COMPLETION_TYPE;
  readonly name = 'OpenAI: Chat Completion';
  readonly description = 'Send a chat completion request to OpenAI (gpt-4o, gpt-4-turbo, etc.)';
  readonly requiredConnectionType = 'openai';
  readonly outputSchema = aiNodeOutputSchema;

  constructor(private readonly client: OpenaiClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<OpenAIApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = openaiChatCompletionConfigSchema.parse(input.params);

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

    const response = await this.client.createChatCompletion(connection, {
      model: params.model,
      prompt: params.prompt,
      system: params.system,
      maxTokens: params.maxTokens,
    });

    return {
      data: {
        text: response.text,
        usage: {
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        },
        model: response.model,
        finishReason: response.finishReason,
      },
      metadata: { statusCode: 200 },
    };
  }
}
