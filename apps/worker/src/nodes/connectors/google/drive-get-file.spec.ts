import { ConnectionAuthError } from '@tietide/sdk';
import { DriveGetFileAction } from './drive-get-file';
import type { GoogleAuthService } from './google-auth';
import {
  VALID_CONNECTION_ID,
  authError,
  makeAuthService,
  makeClients,
  makeConnection,
  makeContext,
  makeInput,
  userError,
} from './__test__/fixtures';

jest.setTimeout(15000);

const metadata = {
  id: 'file-1',
  name: 'report.pdf',
  mimeType: 'application/pdf',
  size: '2048',
  modifiedTime: '2026-05-26T10:00:00Z',
};

interface GetArg {
  fileId: string;
  fields?: string;
  alt?: string;
}

describe('DriveGetFileAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let get: jest.Mock;
  let action: DriveGetFileAction;

  beforeEach(() => {
    auth = makeAuthService();
    get = jest
      .fn()
      .mockImplementation((args: GetArg) =>
        args.alt === 'media'
          ? Promise.resolve({ status: 200, data: Buffer.from('PDFDATA', 'utf8') })
          : Promise.resolve({ status: 200, data: metadata }),
      );
    action = new DriveGetFileAction(
      auth as unknown as GoogleAuthService,
      makeClients({ drive: { files: { get } } }),
    );
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('drive-get-file');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('returns metadata only (no content) by default', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput({ fileId: 'file-1' }), ctx);

      expect(get).toHaveBeenCalledTimes(1);
      expect((get.mock.calls[0][0] as GetArg).alt).toBeUndefined();
      expect(result.data).toMatchObject({
        id: 'file-1',
        name: 'report.pdf',
        mimeType: 'application/pdf',
        size: '2048',
      });
      expect(result.data.contentBase64).toBeUndefined();
    });

    it('downloads content as base64 when downloadContent is true', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ fileId: 'file-1', downloadContent: true }),
        ctx,
      );

      expect(get).toHaveBeenCalledTimes(2);
      const mediaCall = get.mock.calls.find((c) => (c[0] as GetArg).alt === 'media');
      expect(mediaCall).toBeDefined();
      expect(Buffer.from(result.data.contentBase64 as string, 'base64').toString('utf8')).toBe(
        'PDFDATA',
      );
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      get.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ fileId: 'f' }), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      get.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ fileId: 'f' }), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      get.mockRejectedValue(userError(404, 'File not found'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ fileId: 'f' }), ctx)).rejects.toThrow(
        'File not found',
      );
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a missing fileId before the SDK is touched', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toThrow();
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call the SDK when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ fileId: 'f', mockOnDryRun: true }), ctx);
      expect(get).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
