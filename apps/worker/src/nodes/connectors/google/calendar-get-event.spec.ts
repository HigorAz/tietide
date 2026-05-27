import { ConnectionAuthError } from '@tietide/sdk';
import { CalendarGetEventAction } from './calendar-get-event';
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

const event = {
  id: 'evt-1',
  summary: 'Sprint review',
  description: 'Review the sprint',
  status: 'confirmed',
  start: { dateTime: '2026-05-26T10:00:00Z' },
  end: { dateTime: '2026-05-26T11:00:00Z' },
  attendees: [{ email: 'a@x.com' }],
  htmlLink: 'https://calendar.google.com/event?eid=abc',
};

interface GetArg {
  calendarId: string;
  eventId: string;
}

describe('CalendarGetEventAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let get: jest.Mock;
  let action: CalendarGetEventAction;

  beforeEach(() => {
    auth = makeAuthService();
    get = jest.fn().mockResolvedValue({ status: 200, data: event });
    action = new CalendarGetEventAction(
      auth as unknown as GoogleAuthService,
      makeClients({ calendar: { events: { get } } }),
    );
  });

  it('declares correct type, name, and required connection type', () => {
    expect(action.type).toBe('calendar-get-event');
    expect(action.requiredConnectionType).toBe('google');
    expect(action.category).toBe('action');
  });

  describe('happy path', () => {
    it('fetches the event and surfaces key fields', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      const result = await action.execute(
        makeInput({ calendarId: 'team@x.com', eventId: 'evt-1' }),
        ctx,
      );

      const arg = get.mock.calls[0][0] as GetArg;
      expect(arg).toMatchObject({ calendarId: 'team@x.com', eventId: 'evt-1' });
      expect(result.data).toMatchObject({
        id: 'evt-1',
        summary: 'Sprint review',
        status: 'confirmed',
      });
      expect(result.data.event).toEqual(event);
    });

    it('defaults calendarId to primary when omitted', async () => {
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await action.execute(makeInput({ eventId: 'evt-1' }), ctx);
      expect((get.mock.calls[0][0] as GetArg).calendarId).toBe('primary');
    });
  });

  describe('auth and error handling', () => {
    it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
      get.mockRejectedValue(authError(401));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ eventId: 'e' }), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('throws ConnectionAuthError on 403 and marks for refresh', async () => {
      get.mockRejectedValue(authError(403));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ eventId: 'e' }), ctx)).rejects.toBeInstanceOf(
        ConnectionAuthError,
      );
      expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
    });

    it('rethrows non-auth errors verbatim and does NOT mark for refresh', async () => {
      get.mockRejectedValue(userError(404, 'Event not found'));
      const ctx = makeContext({ getConnection: jest.fn().mockResolvedValue(makeConnection()) });
      await expect(action.execute(makeInput({ eventId: 'e' }), ctx)).rejects.toThrow(
        'Event not found',
      );
      expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
    });
  });

  describe('schema rejection', () => {
    it('rejects a missing eventId before the SDK is touched', async () => {
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
      const result = await action.execute(makeInput({ eventId: 'e', mockOnDryRun: true }), ctx);
      expect(get).not.toHaveBeenCalled();
      expect(result.data.mocked).toBe(true);
      expect(result.metadata?.mocked).toBe(true);
    });
  });
});
