import type { DecryptedConnection } from '@tietide/sdk';
import type { S3CustomConfig } from '@tietide/shared';
import { S3ClientFactory } from './s3-client.factory';
import { SsrfBlockedError, type LookupFn } from '../../actions/ssrf-guard';

jest.setTimeout(15000);

const makeConnection = (endpoint?: string): DecryptedConnection<S3CustomConfig> => ({
  id: '11111111-1111-4111-8111-111111111111',
  type: 'CUSTOM',
  provider: 's3',
  config: {
    accessKeyId: 'AKIA',
    secretAccessKey: 'secret',
    region: 'us-east-1',
    ...(endpoint ? { endpoint } : {}),
  },
  refreshToken: undefined,
});

const resolveToLoopback: LookupFn = async () => [{ address: '127.0.0.1', family: 4 }];
const resolveToPublic: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }];

describe('S3ClientFactory SSRF guard', () => {
  it('rejects a literal private-range endpoint before issuing any request', async () => {
    const factory = new S3ClientFactory(resolveToPublic);
    await expect(
      factory.putObject({
        connection: makeConnection('http://10.0.0.5:9000'),
        bucket: 'b',
        key: 'k',
        body: Buffer.from('x'),
        contentType: 'text/plain',
      }),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('rejects an endpoint hostname that resolves to loopback', async () => {
    const factory = new S3ClientFactory(resolveToLoopback);
    await expect(
      factory.listObjects({ connection: makeConnection('http://minio.internal'), bucket: 'b' }),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('rejects the metadata endpoint on getObject', async () => {
    const factory = new S3ClientFactory(resolveToPublic);
    await expect(
      factory.getObject({
        connection: makeConnection('http://169.254.169.254'),
        bucket: 'b',
        key: 'k',
      }),
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('allows a connection with no custom endpoint (real AWS) without resolving', async () => {
    const lookup = jest.fn();
    const factory = new S3ClientFactory(lookup as unknown as LookupFn);
    // No endpoint => no SSRF lookup; buildClient must succeed synchronously.
    const client = factory.buildClient(makeConnection());
    expect(client).toBeDefined();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('allows a public custom endpoint (R2/MinIO on a public host)', async () => {
    const factory = new S3ClientFactory(resolveToPublic);
    await expect(
      factory.assertEndpointAllowed(makeConnection('https://storage.example.com')),
    ).resolves.toBeUndefined();
  });
});
