import { ConnectionAuthError } from '@tietide/sdk';
import { SheetsAppendAction } from './sheets-append';
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

describe('SheetsAppendAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let append: jest.Mock;
  let action: SheetsAppendAction;

  const baseParams = {
    spreadsheetId: 'sid',
    sheet: 'Sheet1',
    values: [
      ['a', 1],
      ['b', 2],
    ],
  };

  beforeEach(() => {
    auth = makeAuthService();
    append = jest.fn();
    action = new SheetsAppendAction(
      auth as unknown as GoogleAuthService,
      makeClients({ sheets: { spreadsheets: { values: { append } } } }),
    );
  });

  it('appends rows on happy path', async () => {
    append.mockResolvedValue({
      status: 200,
      data: {
        spreadsheetId: 'sid',
        updates: {
          updatedRange: 'Sheet1!A2:B3',
          updatedRows: 2,
          updatedColumns: 2,
          updatedCells: 4,
        },
      },
    });
    const result = await action.execute(makeInput(baseParams), makeContext());
    expect(append).toHaveBeenCalledTimes(1);
    const arg = append.mock.calls[0][0];
    expect(arg.spreadsheetId).toBe('sid');
    expect(arg.range).toBe('Sheet1');
    expect(arg.requestBody.values).toEqual(baseParams.values);
    expect(result.data.updatedRows).toBe(2);
  });

  it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
    append.mockRejectedValue(authError(401));
    const ctx = makeContext();
    await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
    expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
  });

  it('rethrows 400 without marking for refresh', async () => {
    append.mockRejectedValue(userError(400, 'Range parse failure'));
    const ctx = makeContext();
    await expect(action.execute(makeInput(baseParams), ctx)).rejects.toThrow('Range parse failure');
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('returns mocked output without calling SDK on dry-run', async () => {
    const ctx = makeContext({ isDryRun: true });
    const result = await action.execute(makeInput({ ...baseParams, mockOnDryRun: true }), ctx);
    expect(append).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });

  it('rejects schema violations (empty values)', async () => {
    await expect(
      action.execute(makeInput({ ...baseParams, values: [] }), makeContext()),
    ).rejects.toThrow();
    expect(append).not.toHaveBeenCalled();
  });
});
