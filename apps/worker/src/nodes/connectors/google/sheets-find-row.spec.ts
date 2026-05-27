import { ConnectionAuthError } from '@tietide/sdk';
import { SheetsFindRowAction } from './sheets-find-row';
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

const sheet = {
  values: [
    ['name', 'email', 'status'],
    ['Alice', 'alice@x.com', 'active'],
    ['Bob', 'bob@x.com', 'inactive'],
    ['Carol', 'alice@x.com', 'active'],
  ],
};

describe('SheetsFindRowAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let get: jest.Mock;
  let action: SheetsFindRowAction;

  beforeEach(() => {
    auth = makeAuthService();
    get = jest.fn().mockResolvedValue({ status: 200, data: sheet });
    action = new SheetsFindRowAction(
      auth as unknown as GoogleAuthService,
      makeClients({ sheets: { spreadsheets: { values: { get } } } }),
    );
  });

  const baseParams = {
    spreadsheetId: 'sheet-1',
    range: 'Sheet1!A:C',
    hasHeaderRow: true,
  };

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('sheets-find-row');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('matching by header name', () => {
    it('returns a single match with a 1-based row number', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ ...baseParams, column: 'status', value: 'inactive' }),
        ctx,
      );
      expect(result.data.matchCount).toBe(1);
      expect(result.data.matches).toEqual([
        { rowNumber: 3, values: ['Bob', 'bob@x.com', 'inactive'] },
      ]);
    });

    it('returns an empty result when no row matches', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ ...baseParams, column: 'email', value: 'nobody@x.com' }),
        ctx,
      );
      expect(result.data.matchCount).toBe(0);
      expect(result.data.matches).toEqual([]);
    });

    it('returns every match when multiple rows match', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ ...baseParams, column: 'email', value: 'alice@x.com' }),
        ctx,
      );
      expect(result.data.matchCount).toBe(2);
      expect((result.data.matches as { rowNumber: number }[]).map((m) => m.rowNumber)).toEqual([
        2, 4,
      ]);
    });

    it('honors firstMatchOnly', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ ...baseParams, column: 'email', value: 'alice@x.com', firstMatchOnly: true }),
        ctx,
      );
      expect(result.data.matchCount).toBe(1);
      expect((result.data.matches as { rowNumber: number }[])[0].rowNumber).toBe(2);
    });

    it('throws when a named column is not in the header row', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ ...baseParams, column: 'missing', value: 'x' }), ctx),
      ).rejects.toThrow(/column/i);
    });
  });

  describe('matching by numeric index', () => {
    it('matches a 0-based column index without a header', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ spreadsheetId: 's', range: 'A:C', column: 0, value: 'Bob' }),
        ctx,
      );
      expect(result.data.matchCount).toBe(1);
      expect((result.data.matches as { rowNumber: number }[])[0].rowNumber).toBe(3);
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      get.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ ...baseParams, column: 'email', value: 'x' }), ctx),
      ).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      get.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ ...baseParams, column: 'email', value: 'x' }), ctx),
      ).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      get.mockRejectedValue(userError(404, 'Range not found'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ ...baseParams, column: 'email', value: 'x' }), ctx),
      ).rejects.toThrow('Range not found');
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a missing column before the SDK is touched', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(
        action.execute(makeInput({ spreadsheetId: 's', range: 'A:C', value: 'x' }), ctx),
      ).rejects.toThrow();
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call the SDK when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(
        makeInput({ ...baseParams, column: 'email', value: 'x', mockOnDryRun: true }),
        ctx,
      );
      expect(get).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
