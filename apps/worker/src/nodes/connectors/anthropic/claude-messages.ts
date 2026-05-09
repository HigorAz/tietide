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
  claudeMessagesConfigSchema,
  type AnthropicApiKeyConfig,
} from '@tietide/shared';
import { ClaudeClientFactory } from './claude-client.factory';

export const CLAUDE_MESSAGES_TYPE = 'claude-messages';

@Injectable()
export class ClaudeMessagesAction extends BaseConnectorAction<AnthropicApiKeyConfig> {
  readonly type = CLAUDE_MESSAGES_TYPE;
  readonly name = 'Claude: Messages';
  readonly description = 'Send a prompt to the Anthropic Messages API and capture the response';
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
    const params = claudeMessagesConfigSchema.parse(input.params);

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

    const response = await this.client.createMessage(connection, {
      model: params.model,
      prompt: params.prompt,
      system: params.system,
      maxTokens: params.maxTokens,
      enablePromptCaching: params.enablePromptCaching,
    });

    return {
      data: {
        text: response.text,
        usage: {
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        },
        model: response.model,
        finishReason: response.stopReason,
      },
      metadata: { statusCode: 200 },
    };
  }
}
