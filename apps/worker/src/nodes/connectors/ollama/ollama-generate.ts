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

// Best-effort: when the model returns a JSON object/array (optionally wrapped in a
// ```json fence), parse it so downstream nodes can data-pill its fields directly.
// Returns undefined for prose / primitives / malformed JSON so `json` stays absent.
function tryParseJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  if (candidate[0] !== '{' && candidate[0] !== '[') return undefined;
  try {
    const value = JSON.parse(candidate);
    return value !== null && typeof value === 'object' ? value : undefined;
  } catch {
    return undefined;
  }
}

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

    const data: Record<string, unknown> = {
      text: result.text,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
      model: result.model,
      finishReason: result.finishReason,
    };
    const json = tryParseJson(result.text);
    if (json !== undefined) data.json = json;

    return {
      data,
      metadata: { statusCode: 200 },
    };
  }
}
