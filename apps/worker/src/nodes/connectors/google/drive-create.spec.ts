import { ConnectionAuthError } from '@tietide/sdk';
import { DriveCreateAction } from './drive-create';
import type { GoogleAuthService } from './google-auth';
import {
  authError,
  makeAuthService,
  makeClients,
  makeContext,
  makeInput,
  userError,
  VALID_CONNECTION_ID,
} from './__test__/fixtures';

jest.setTimeout(15000);

describe('DriveCreateAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let create: jest.Mock;
  let action: DriveCreateAction;

  const baseParams = {
    name: 'report.txt',
    mimeType: 'text/plain',
    content: 'hello world',
  };

  beforeEach(() => {
    auth = makeAuthService();
    create = jest.fn();
    action = new DriveCreateAction(
      auth as unknown as GoogleAuthService,
      makeClients({ drive: { files: { create } } }),
    );
  });

  it('creates a file and returns the new fileId on happy path', async () => {
    create.mockResolvedValue({
      status: 200,
      data: { id: 'file-1', name: 'report.txt', mimeType: 'text/plain', webViewLink: 'https://x' },
    });
    const result = await action.execute(
      makeInput({ ...baseParams, parentFolderId: 'folder-1' }),
      makeContext(),
    );
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0];
    expect(arg.requestBody.name).toBe('report.txt');
    expect(arg.requestBody.parents).toEqual(['folder-1']);
    expect(result.data.fileId).toBe('file-1');
    expect(result.data.webViewLink).toBe('https://x');
  });

  it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
    create.mockRejectedValue(authError(401));
    const ctx = makeContext();
    await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
    expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
  });

  it('rethrows 4xx without marking for refresh', async () => {
    create.mockRejectedValue(userError(403, 'Insufficient permissions'));
    const ctx = makeContext();
    await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
    // 403 also triggers refresh per BaseConnectorAction.isAuthError; that's
    // intentional. Use 400 for the non-auth path.
    create.mockRejectedValue(userError(400, 'Bad mimeType'));
    const ctx2 = makeContext();
    await expect(action.execute(makeInput(baseParams), ctx2)).rejects.toThrow('Bad mimeType');
    expect(ctx2.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('returns mocked output without calling SDK on dry-run', async () => {
    const ctx = makeContext({ isDryRun: true });
    const result = await action.execute(makeInput({ ...baseParams, mockOnDryRun: true }), ctx);
    expect(create).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
