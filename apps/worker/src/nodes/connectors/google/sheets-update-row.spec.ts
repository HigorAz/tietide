import { ConnectionAuthError } from '@tietide/sdk';
import { SheetsUpdateRowAction } from './sheets-update-row';
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

interface UpdateArg {
  spreadsheetId: string;
  range: string;
  valueInputOption: string;
  requestBody: { values: unknown[][] };
}

describe('SheetsUpdateRowAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let update: jest.Mock;
  let action: SheetsUpdateRowAction;

  beforeEach(() => {
    auth = makeAuthService();
    update = jest.fn().mockResolvedValue({
      status: 200,
      data: { updatedRange: 'Sheet1!A5:C5', updatedCells: 3, updatedRows: 1, updatedColumns: 3 },
    });
    action = new SheetsUpdateRowAction(
      auth as unknown as GoogleAuthService,
      makeClients({ sheets: { spreadsheets: { values: { update } } } }),
    );
  });

  const baseParams = {
    spreadsheetId: 'sheet-1',
    sheet: 'Sheet1',
    rowNumber: 5,
    values: ['Alice', 'alice@x.com', 'active'],
  };

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('sheets-update-row');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('updates the row at A{rowNumber} with USER_ENTERED and returns the summary', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(baseParams), ctx);

      const arg = update.mock.calls[0][0] as UpdateArg;
      expect(arg.spreadsheetId).toBe('sheet-1');
      expect(arg.range).toBe('Sheet1!A5');
      expect(arg.valueInputOption).toBe('USER_ENTERED');
      expect(arg.requestBody.values).toEqual([['Alice', 'alice@x.com', 'active']]);
      expect(result.data).toMatchObject({ updatedRange: 'Sheet1!A5:C5', updatedCells: 3 });
    });

    it('quotes a sheet name that contains spaces', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ ...baseParams, sheet: 'My Tab', rowNumber: 2 }), ctx);
      const arg = update.mock.calls[0][0] as UpdateArg;
      expect(arg.range).toBe("'My Tab'!A2");
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      update.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      update.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      update.mockRejectedValue(userError(400, 'Invalid range'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toThrow('Invalid range');
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a non-positive rowNumber before the SDK is touched', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ ...baseParams, rowNumber: 0 }), ctx),
      ).rejects.toThrow();
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects an empty values array', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ ...baseParams, values: [] }), ctx)).rejects.toThrow();
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call the SDK when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ ...baseParams, mockOnDryRun: true }), ctx);
      expect(update).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
