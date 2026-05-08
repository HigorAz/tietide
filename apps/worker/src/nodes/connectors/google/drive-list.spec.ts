import { ConnectionAuthError } from '@tietide/sdk';
import { DriveListAction } from './drive-list';
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

describe('DriveListAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let list: jest.Mock;
  let action: DriveListAction;

  beforeEach(() => {
    auth = makeAuthService();
    list = jest.fn();
    action = new DriveListAction(
      auth as unknown as GoogleAuthService,
      makeClients({ drive: { files: { list } } }),
    );
  });

  it('lists files in a folder on happy path', async () => {
    list.mockResolvedValue({
      status: 200,
      data: { files: [{ id: 'f1', name: 'a' }], nextPageToken: 'tok' },
    });
    const result = await action.execute(
      makeInput({ folderId: 'parent-1', maxResults: 50 }),
      makeContext(),
    );
    expect(list).toHaveBeenCalledTimes(1);
    const arg = list.mock.calls[0][0];
    expect(arg.q).toContain("'parent-1' in parents");
    expect(arg.pageSize).toBe(50);
    expect(result.data.files).toEqual([{ id: 'f1', name: 'a' }]);
    expect(result.data.nextPageToken).toBe('tok');
  });

  it('combines folderId with the user-supplied query', async () => {
    list.mockResolvedValue({ status: 200, data: { files: [] } });
    await action.execute(
      makeInput({ folderId: 'p', query: "name contains 'report'" }),
      makeContext(),
    );
    const arg = list.mock.calls[0][0];
    expect(arg.q).toBe("'p' in parents and (name contains 'report')");
  });

  it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
    list.mockRejectedValue(authError(401));
    const ctx = makeContext();
    await expect(action.execute(makeInput({ folderId: 'p' }), ctx)).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
    expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
  });

  it('rethrows 400 without marking for refresh', async () => {
    list.mockRejectedValue(userError(400, 'Bad query'));
    const ctx = makeContext();
    await expect(action.execute(makeInput({ folderId: 'p' }), ctx)).rejects.toThrow('Bad query');
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('returns mocked output without calling SDK on dry-run', async () => {
    const ctx = makeContext({ isDryRun: true });
    const result = await action.execute(makeInput({ folderId: 'p', mockOnDryRun: true }), ctx);
    expect(list).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
