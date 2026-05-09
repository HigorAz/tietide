import type { DecryptedConnection } from '@tietide/sdk';
import type { OpenAIApiKeyConfig } from '@tietide/shared';
import { OpenaiClientFactory } from './openai-client.factory';

jest.setTimeout(15000);

interface OpenaiCreateRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
}

const makeConnection = (
  overrides: Partial<OpenAIApiKeyConfig> = {},
): DecryptedConnection<OpenAIApiKeyConfig> => ({
  id: '22222222-2222-4222-8222-222222222222',
  type: 'API_KEY',
  provider: 'openai',
  config: { apiKey: 'sk-test', ...overrides },
  refreshToken: undefined,
});

describe('OpenaiClientFactory', () => {
  let factory: OpenaiClientFactory;
  let create: jest.Mock;

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Paris.' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 18, completion_tokens: 2, total_tokens: 20 },
      model: 'gpt-4o-2024-08-06',
    });
    factory = new OpenaiClientFactory();
    factory.buildClient = jest.fn().mockReturnValue({
      chat: { completions: { create } },
    } as unknown as ReturnType<OpenaiClientFactory['buildClient']>);
  });

  describe('createChatCompletion', () => {
    it('sends a user message and remaps prompt_tokens/completion_tokens to camelCase', async () => {
      const result = await factory.createChatCompletion(makeConnection(), {
        model: 'gpt-4o',
        prompt: 'What is the capital of France?',
      });

      expect(create).toHaveBeenCalledTimes(1);
      const req = create.mock.calls[0][0] as OpenaiCreateRequest;
      expect(req.model).toBe('gpt-4o');
      expect(req.messages).toEqual([{ role: 'user', content: 'What is the capital of France?' }]);
      expect(req.max_tokens).toBeUndefined();

      expect(result).toEqual({
        text: 'Paris.',
        inputTokens: 18,
        outputTokens: 2,
        model: 'gpt-4o-2024-08-06',
        finishReason: 'stop',
      });
    });

    it('prepends a system message when provided', async () => {
      await factory.createChatCompletion(makeConnection(), {
        model: 'gpt-4o',
        prompt: 'hi',
        system: 'You are a concise assistant.',
      });
      const req = create.mock.calls[0][0] as OpenaiCreateRequest;
      expect(req.messages).toEqual([
        { role: 'system', content: 'You are a concise assistant.' },
        { role: 'user', content: 'hi' },
      ]);
    });

    it('forwards maxTokens as max_tokens when provided', async () => {
      await factory.createChatCompletion(makeConnection(), {
        model: 'gpt-4o',
        prompt: 'hi',
        maxTokens: 256,
      });
      const req = create.mock.calls[0][0] as OpenaiCreateRequest;
      expect(req.max_tokens).toBe(256);
    });

    it('returns empty text when OpenAI returns no choices', async () => {
      create.mockResolvedValue({
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
        model: 'gpt-4o',
      });
      const result = await factory.createChatCompletion(makeConnection(), {
        model: 'gpt-4o',
        prompt: 'hi',
      });
      expect(result.text).toBe('');
      expect(result.finishReason).toBeNull();
    });

    it('coerces missing usage to zeros (defensive)', async () => {
      create.mockResolvedValue({
        choices: [{ message: { content: 'x' }, finish_reason: 'stop' }],
        model: 'gpt-4o',
      });
      const result = await factory.createChatCompletion(makeConnection(), {
        model: 'gpt-4o',
        prompt: 'hi',
      });
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
    });
  });
});
