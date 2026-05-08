import { ConnectionAuthError } from '@tietide/sdk';
import { SheetsReadAction } from './sheets-read';
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

describe('SheetsReadAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let get: jest.Mock;
  let action: SheetsReadAction;

  const baseParams = { spreadsheetId: 'sid', range: 'Sheet1!A1:B5' };

  beforeEach(() => {
    auth = makeAuthService();
    get = jest.fn();
    action = new SheetsReadAction(
      auth as unknown as GoogleAuthService,
      makeClients({ sheets: { spreadsheets: { values: { get } } } }),
    );
  });

  it('reads a range on happy path', async () => {
    get.mockResolvedValue({
      status: 200,
      data: {
        range: 'Sheet1!A1:B5',
        majorDimension: 'ROWS',
        values: [
          ['a', 1],
          ['b', 2],
        ],
      },
    });
    const result = await action.execute(makeInput(baseParams), makeContext());
    expect(get).toHaveBeenCalledWith({ spreadsheetId: 'sid', range: 'Sheet1!A1:B5' });
    expect(result.data.values).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
    get.mockRejectedValue(authError(401));
    const ctx = makeContext();
    await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
    expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
  });

  it('rethrows 400 without marking for refresh', async () => {
    get.mockRejectedValue(userError(400, 'Bad range'));
    const ctx = makeContext();
    await expect(action.execute(makeInput(baseParams), ctx)).rejects.toThrow('Bad range');
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('returns mocked output without calling SDK on dry-run', async () => {
    const ctx = makeContext({ isDryRun: true });
    const result = await action.execute(makeInput({ ...baseParams, mockOnDryRun: true }), ctx);
    expect(get).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });
});
