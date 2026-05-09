import type { DecryptedConnection } from '@tietide/sdk';
import type { AnthropicApiKeyConfig } from '@tietide/shared';
import { ClaudeClientFactory } from './claude-client.factory';

jest.setTimeout(15000);

const VALID_CONNECTION_ID = '11111111-1111-4111-8111-111111111111';

const makeConnection = (): DecryptedConnection<AnthropicApiKeyConfig> => ({
  id: VALID_CONNECTION_ID,
  type: 'API_KEY',
  provider: 'anthropic',
  config: { apiKey: 'sk-ant-test' },
  refreshToken: undefined,
});

interface AnthropicCreateRequest {
  model: string;
  max_tokens: number;
  system?: unknown;
  messages: Array<{ role: string; content: string }>;
}

describe('ClaudeClientFactory', () => {
  let factory: ClaudeClientFactory;
  let create: jest.Mock;

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'A summary.' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
    });
    factory = new ClaudeClientFactory();
    // Stub buildClient so we control the SDK without touching the network.
    factory.buildClient = jest.fn().mockReturnValue({
      messages: { create },
    } as unknown as ReturnType<ClaudeClientFactory['buildClient']>);
  });

  describe('createMessage', () => {
    it('sends the user prompt verbatim and maps usage/model/stop_reason', async () => {
      const result = await factory.createMessage(makeConnection(), {
        model: 'claude-sonnet-4-6',
        prompt: 'Hello world',
        maxTokens: 256,
        enablePromptCaching: false,
      });

      expect(create).toHaveBeenCalledTimes(1);
      const req = create.mock.calls[0][0] as AnthropicCreateRequest;
      expect(req.model).toBe('claude-sonnet-4-6');
      expect(req.max_tokens).toBe(256);
      expect(req.messages).toEqual([{ role: 'user', content: 'Hello world' }]);
      expect(req.system).toBeUndefined();

      expect(result).toEqual({
        text: 'A summary.',
        inputTokens: 10,
        outputTokens: 5,
        model: 'claude-sonnet-4-6',
        stopReason: 'end_turn',
      });
    });

    it('omits the system field entirely when no system prompt provided', async () => {
      await factory.createMessage(makeConnection(), {
        model: 'claude-sonnet-4-6',
        prompt: 'hi',
        maxTokens: 128,
        enablePromptCaching: false,
      });
      const req = create.mock.calls[0][0] as AnthropicCreateRequest;
      expect('system' in req).toBe(false);
    });

    it('sends system as a plain string when caching is disabled', async () => {
      await factory.createMessage(makeConnection(), {
        model: 'claude-sonnet-4-6',
        prompt: 'hi',
        system: 'You are concise.',
        maxTokens: 128,
        enablePromptCaching: false,
      });
      const req = create.mock.calls[0][0] as AnthropicCreateRequest;
      expect(req.system).toBe('You are concise.');
    });

    it('wraps system in a content-block array with cache_control when caching is enabled', async () => {
      await factory.createMessage(makeConnection(), {
        model: 'claude-sonnet-4-6',
        prompt: 'hi',
        system: 'You are concise.',
        maxTokens: 128,
        enablePromptCaching: true,
      });
      const req = create.mock.calls[0][0] as AnthropicCreateRequest;
      expect(req.system).toEqual([
        {
          type: 'text',
          text: 'You are concise.',
          cache_control: { type: 'ephemeral' },
        },
      ]);
    });

    it('returns empty text when Anthropic responds with non-text content blocks', async () => {
      create.mockResolvedValue({
        content: [{ type: 'tool_use', id: 't1', name: 'foo', input: {} }],
        usage: { input_tokens: 1, output_tokens: 2 },
        model: 'claude-sonnet-4-6',
        stop_reason: 'tool_use',
      });
      const result = await factory.createMessage(makeConnection(), {
        model: 'claude-sonnet-4-6',
        prompt: 'hi',
        maxTokens: 128,
        enablePromptCaching: false,
      });
      expect(result.text).toBe('');
      expect(result.stopReason).toBe('tool_use');
    });

    it('coerces stop_reason=null to null', async () => {
      create.mockResolvedValue({
        content: [{ type: 'text', text: 'x' }],
        usage: { input_tokens: 1, output_tokens: 1 },
        model: 'claude-sonnet-4-6',
        stop_reason: null,
      });
      const result = await factory.createMessage(makeConnection(), {
        model: 'claude-sonnet-4-6',
        prompt: 'hi',
        maxTokens: 64,
        enablePromptCaching: false,
      });
      expect(result.stopReason).toBeNull();
    });
  });
});
