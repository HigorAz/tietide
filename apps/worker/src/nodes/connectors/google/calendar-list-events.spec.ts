import { ConnectionAuthError } from '@tietide/sdk';
import { CalendarListEventsAction } from './calendar-list-events';
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

interface ListArg {
  calendarId: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  q?: string;
  singleEvents?: boolean;
}

describe('CalendarListEventsAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let list: jest.Mock;
  let action: CalendarListEventsAction;

  beforeEach(() => {
    auth = makeAuthService();
    list = jest.fn().mockResolvedValue({
      status: 200,
      data: { items: [{ id: 'e1' }, { id: 'e2' }], nextPageToken: 'tok' },
    });
    action = new CalendarListEventsAction(
      auth as unknown as GoogleAuthService,
      makeClients({ calendar: { events: { list } } }),
    );
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('calendar-list-events');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('lists events in the window and returns items + nextPageToken', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({
          calendarId: 'team@x.com',
          timeMin: '2026-05-01T00:00:00Z',
          timeMax: '2026-05-31T23:59:59Z',
        }),
        ctx,
      );

      const arg = list.mock.calls[0][0] as ListArg;
      expect(arg.calendarId).toBe('team@x.com');
      expect(arg.timeMin).toBe('2026-05-01T00:00:00Z');
      expect(arg.timeMax).toBe('2026-05-31T23:59:59Z');
      expect(arg.singleEvents).toBe(true);
      expect(result.data.events).toEqual([{ id: 'e1' }, { id: 'e2' }]);
      expect(result.data.nextPageToken).toBe('tok');
    });

    it('defaults calendarId to primary when omitted', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput(), ctx);
      expect((list.mock.calls[0][0] as ListArg).calendarId).toBe('primary');
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      list.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      list.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toBeInstanceOf(ConnectionAuthError);
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      list.mockRejectedValue(userError(404, 'Calendar not found'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput(), ctx)).rejects.toThrow('Calendar not found');
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects an invalid timeMin datetime before the SDK is touched', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ timeMin: 'not-a-date' }), ctx)).rejects.toThrow();
      expect(list).not.toHaveBeenCalled();
    });
  });

  describe('mockOnDryRun', () => {
    it('returns synthetic data and does NOT call the SDK when dry-run + flag set', async () => {
      const ctx = makeContext({
        isDryRun: true,
        getConnection: jest.fn().mockResolvedValue(makeConnection()),
      });
      const result = await action.execute(makeInput({ mockOnDryRun: true }), ctx);
      expect(list).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
