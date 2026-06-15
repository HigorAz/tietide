import { InstagramCommentAddedTrigger } from './instagram-comment-added';
import { MetaGraphClientFactory } from '../../connectors/meta/meta-graph-client.factory';
import type { PollContext } from '@tietide/sdk';

const connection = { provider: 'instagram', config: { accessToken: 'tok' } } as never;

const ctx = (over: Partial<PollContext>): PollContext =>
  ({
    workflowId: 'w',
    nodeId: 'n',
    connection,
    config: { mediaId: 'media-1' },
    cursor: null,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    ...over,
  }) as PollContext;

describe('InstagramCommentAddedTrigger', () => {
  it('replays nothing and records a watermark on the first tick', async () => {
    const client = { call: jest.fn() } as unknown as MetaGraphClientFactory;
    const trigger = new InstagramCommentAddedTrigger(client);

    const result = await trigger.poll(ctx({ cursor: null }));

    expect(client.call).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
    expect(typeof result.newCursor).toBe('string');
  });

  it('returns only comments newer than the cursor and advances it', async () => {
    const client = {
      call: jest.fn().mockResolvedValue({
        status: 200,
        data: {
          data: [
            { id: 'c1', text: 'old', username: 'a', timestamp: '2026-01-01T00:00:00+0000' },
            { id: 'c2', text: 'new', username: 'b', timestamp: '2026-02-01T00:00:00+0000' },
          ],
        },
      }),
    } as unknown as MetaGraphClientFactory;
    const trigger = new InstagramCommentAddedTrigger(client);

    const result = await trigger.poll(ctx({ cursor: '2026-01-15T00:00:00+0000' }));

    expect(client.call).toHaveBeenCalledWith(connection, '/media-1/comments', {
      searchParams: { fields: 'id,text,username,timestamp', limit: '50' },
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('c2');
    expect(result.newCursor).toBe('2026-02-01T00:00:00+0000');
  });

  it('throws when mediaId is missing', async () => {
    const client = { call: jest.fn() } as unknown as MetaGraphClientFactory;
    const trigger = new InstagramCommentAddedTrigger(client);

    await expect(trigger.poll(ctx({ cursor: 'x', config: {} }))).rejects.toThrow(/mediaId/);
  });
});
