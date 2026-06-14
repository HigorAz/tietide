import { InstagramPublishPhotoAction } from './instagram-publish-photo';
import { MetaGraphClientFactory } from '../meta/meta-graph-client.factory';
import type { DecryptedConnection, ExecutionContext, NodeInput } from '@tietide/sdk';

const connection = {
  id: 'c1',
  provider: 'instagram',
  config: { accessToken: 'tok' },
} as unknown as DecryptedConnection<{ accessToken: string }>;

const ctx = { isDryRun: false } as ExecutionContext;

const input = (params: Record<string, unknown>): NodeInput => ({
  data: {},
  params,
  connectionId: 'c1',
});

describe('InstagramPublishPhotoAction', () => {
  it('creates a media container then publishes it', async () => {
    const client = {
      call: jest
        .fn()
        .mockResolvedValueOnce({ status: 200, data: { id: 'creation-123' } })
        .mockResolvedValueOnce({ status: 200, data: { id: 'media-999' } }),
    } as unknown as MetaGraphClientFactory;
    const action = new InstagramPublishPhotoAction(client);

    const out = await action['run'](
      input({
        connectionId: '11111111-1111-4111-8111-111111111111',
        igUserId: '178414',
        imageUrl: 'https://image.pollinations.ai/prompt/cat',
        caption: 'hello',
      }),
      connection,
      ctx,
    );

    expect((client.call as jest.Mock).mock.calls[0][1]).toBe('/178414/media');
    expect((client.call as jest.Mock).mock.calls[0][2].searchParams).toEqual({
      image_url: 'https://image.pollinations.ai/prompt/cat',
      caption: 'hello',
    });
    expect((client.call as jest.Mock).mock.calls[1][1]).toBe('/178414/media_publish');
    expect((client.call as jest.Mock).mock.calls[1][2].searchParams).toEqual({
      creation_id: 'creation-123',
    });
    expect(out.data.mediaId).toBe('media-999');
    expect(out.data.creationId).toBe('creation-123');
  });

  it('throws when the container creation returns no id', async () => {
    const client = {
      call: jest.fn().mockResolvedValueOnce({ status: 200, data: {} }),
    } as unknown as MetaGraphClientFactory;
    const action = new InstagramPublishPhotoAction(client);

    await expect(
      action['run'](
        input({
          connectionId: '11111111-1111-4111-8111-111111111111',
          igUserId: '178414',
          imageUrl: 'https://x/y.jpg',
        }),
        connection,
        ctx,
      ),
    ).rejects.toThrow(/no id/i);
  });

  it('skips the publish on a dry-run (side-effecting action)', async () => {
    const client = { call: jest.fn() } as unknown as MetaGraphClientFactory;
    const action = new InstagramPublishPhotoAction(client);

    const out = await action.execute(
      input({
        connectionId: '11111111-1111-4111-8111-111111111111',
        igUserId: '178414',
        imageUrl: 'https://x/y.jpg',
      }),
      { isDryRun: true } as ExecutionContext,
    );

    expect(client.call).not.toHaveBeenCalled();
    expect(out.metadata?.dryRun).toBe(true);
  });
});
