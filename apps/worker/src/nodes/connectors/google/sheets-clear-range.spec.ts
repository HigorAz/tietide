import { ConnectionAuthError } from '@tietide/sdk';
import { SheetsClearRangeAction } from './sheets-clear-range';
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

interface ClearArg {
  spreadsheetId: string;
  range: string;
}

describe('SheetsClearRangeAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let clear: jest.Mock;
  let action: SheetsClearRangeAction;

  beforeEach(() => {
    auth = makeAuthService();
    clear = jest.fn().mockResolvedValue({
      status: 200,
      data: { spreadsheetId: 'sheet-1', clearedRange: 'Sheet1!A2:C10' },
    });
    action = new SheetsClearRangeAction(
      auth as unknown as GoogleAuthService,
      makeClients({ sheets: { spreadsheets: { values: { clear } } } }),
    );
  });

  const baseParams = { spreadsheetId: 'sheet-1', range: 'Sheet1!A2:C10' };

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('sheets-clear-range');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('clears the range and returns the cleared range', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(makeInput(baseParams), ctx);

      const arg = clear.mock.calls[0][0] as ClearArg;
      expect(arg.spreadsheetId).toBe('sheet-1');
      expect(arg.range).toBe('Sheet1!A2:C10');
      expect(result.data).toMatchObject({ clearedRange: 'Sheet1!A2:C10' });
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      clear.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      clear.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      clear.mockRejectedValue(userError(404, 'Range not found'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(baseParams), ctx)).rejects.toThrow('Range not found');
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a missing range before the SDK is touched', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ spreadsheetId: 'sheet-1' }), ctx)).rejects.toThrow();
      expect(clear).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call the SDK when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ ...baseParams, mockOnDryRun: true }), ctx);
      expect(clear).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
