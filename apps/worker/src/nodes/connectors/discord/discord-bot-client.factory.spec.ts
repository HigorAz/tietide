import { ConfigService } from '@nestjs/config';
import { DiscordBotClientFactory, DiscordBotHttpError } from './discord-bot-client.factory';

jest.setTimeout(15000);

function makeConfig(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService;
}

describe('DiscordBotClientFactory', () => {
  let factory: DiscordBotClientFactory;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    factory = new DiscordBotClientFactory(makeConfig());
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the Bot Authorization header and JSON body', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: '1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const res = await factory.call('bot-token', 'POST', '/channels/9/messages', { content: 'x' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/channels/9/messages');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bot bot-token');
    expect(init?.body).toBe(JSON.stringify({ content: 'x' }));
    expect(res.data).toEqual({ id: '1' });
  });

  it('returns null data for a 204 No Content response', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await factory.call('bot-token', 'PUT', '/guilds/1/members/2/roles/3');
    expect(res.status).toBe(204);
    expect(res.data).toBeNull();
  });

  it('throws DiscordBotHttpError on a 4xx with the status under response.status', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: '401: Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(factory.call('bot-token', 'GET', '/channels/9/messages')).rejects.toMatchObject({
      response: { status: 401 },
    });
    await expect(factory.call('bot-token', 'GET', '/channels/9/messages')).rejects.toBeInstanceOf(
      DiscordBotHttpError,
    );
  });
});
