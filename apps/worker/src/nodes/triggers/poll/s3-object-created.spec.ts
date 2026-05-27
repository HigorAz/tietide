import type { PollContext } from '@tietide/sdk';
import { S3ObjectCreatedTrigger } from './s3-object-created';
import type { S3ClientFactory } from '../../connectors/s3/s3-client.factory';

jest.setTimeout(15000);

const makeClient = (listObjects: jest.Mock = jest.fn()) =>
  ({ listObjects, buildClient: jest.fn() }) as unknown as S3ClientFactory;

const makeCtx = (cursor: string | null, config: Record<string, unknown> = {}): PollContext =>
  ({
    workflowId: 'wf-1',
    nodeId: 'node-1',
    connection: {
      id: 'c1',
      type: 'CUSTOM',
      provider: 's3',
      config: { accessKeyId: 'AKIA', secretAccessKey: 'secret', region: 'us-east-1' },
    },
    config: { bucket: 'my-bucket', ...config },
    cursor,
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  }) as unknown as PollContext;

describe('S3ObjectCreatedTrigger', () => {
  let listObjects: jest.Mock;
  let trigger: S3ObjectCreatedTrigger;

  beforeEach(() => {
    listObjects = jest.fn();
    trigger = new S3ObjectCreatedTrigger(makeClient(listObjects));
  });

  it('declares correct type and connection type', () => {
    expect(trigger.type).toBe('s3-object-created');
    expect(trigger.requiredConnectionType).toBe('s3');
  });

  it('first run (null cursor) emits nothing and records the watermark', async () => {
    listObjects.mockResolvedValue({
      objects: [
        { key: 'a.txt', size: 1, lastModified: '2026-05-01T00:00:00.000Z', etag: '"a"' },
        { key: 'b.txt', size: 2, lastModified: '2026-05-02T00:00:00.000Z', etag: '"b"' },
      ],
      isTruncated: false,
      nextCursor: null,
      keyCount: 2,
    });

    const result = await trigger.poll(makeCtx(null));
    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('2026-05-02T00:00:00.000Z');
  });

  it('emits only objects newer than the cursor watermark', async () => {
    listObjects.mockResolvedValue({
      objects: [
        { key: 'old.txt', size: 1, lastModified: '2026-05-01T00:00:00.000Z', etag: '"o"' },
        { key: 'new.txt', size: 2, lastModified: '2026-05-03T00:00:00.000Z', etag: '"n"' },
      ],
      isTruncated: false,
      nextCursor: null,
      keyCount: 2,
    });

    const result = await trigger.poll(makeCtx('2026-05-02T00:00:00.000Z'));
    expect(result.items).toHaveLength(1);
    expect((result.items[0] as { key: string }).key).toBe('new.txt');
    expect(result.newCursor).toBe('2026-05-03T00:00:00.000Z');
  });

  it('keeps the watermark and emits nothing when no new objects appear', async () => {
    listObjects.mockResolvedValue({
      objects: [{ key: 'old.txt', size: 1, lastModified: '2026-05-01T00:00:00.000Z', etag: '"o"' }],
      isTruncated: false,
      nextCursor: null,
      keyCount: 1,
    });

    const result = await trigger.poll(makeCtx('2026-05-02T00:00:00.000Z'));
    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('2026-05-02T00:00:00.000Z');
  });

  it('throws when bucket is missing from config', async () => {
    await expect(trigger.poll(makeCtx('2026-05-02T00:00:00.000Z', { bucket: '' }))).rejects.toThrow(
      'requires config.bucket',
    );
  });
});
