import { ConnectionAuthError } from '@tietide/sdk';
import { CalendarCreateAction } from './calendar-create';
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

describe('CalendarCreateAction', () => {
  let auth: jest.Mocked<Pick<GoogleAuthService, 'buildClient'>>;
  let insert: jest.Mock;
  let action: CalendarCreateAction;

  const baseParams = {
    calendarId: 'primary',
    summary: 'Standup',
    start: '2026-06-01T09:00:00Z',
    end: '2026-06-01T09:30:00Z',
    attendees: ['a@example.com', 'b@example.com'],
  };

  beforeEach(() => {
    auth = makeAuthService();
    insert = jest.fn();
    action = new CalendarCreateAction(
      auth as unknown as GoogleAuthService,
      makeClients({ calendar: { events: { insert } } }),
    );
  });

  it('creates an event on happy path', async () => {
    insert.mockResolvedValue({
      status: 200,
      data: { id: 'evt-1', htmlLink: 'https://cal/x', status: 'confirmed' },
    });
    const result = await action.execute(makeInput(baseParams), makeContext());
    expect(insert).toHaveBeenCalledTimes(1);
    const arg = insert.mock.calls[0][0];
    expect(arg.calendarId).toBe('primary');
    expect(arg.requestBody.summary).toBe('Standup');
    expect(arg.requestBody.attendees).toEqual([
      { email: 'a@example.com' },
      { email: 'b@example.com' },
    ]);
    expect(result.data.eventId).toBe('evt-1');
  });

  it('throws ConnectionAuthError on 401 and marks for refresh', async () => {
    insert.mockRejectedValue(authError(401));
    const ctx = makeContext();
    await expect(action.execute(makeInput(baseParams), ctx)).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
    expect(ctx.markConnectionForRefresh).toHaveBeenCalledWith(VALID_CONNECTION_ID);
  });

  it('rethrows 400 without marking for refresh', async () => {
    insert.mockRejectedValue(userError(400, 'Bad attendees'));
    const ctx = makeContext();
    await expect(action.execute(makeInput(baseParams), ctx)).rejects.toThrow('Bad attendees');
    expect(ctx.markConnectionForRefresh).not.toHaveBeenCalled();
  });

  it('returns mocked output without calling SDK on dry-run', async () => {
    const ctx = makeContext({ isDryRun: true });
    const result = await action.execute(makeInput({ ...baseParams, mockOnDryRun: true }), ctx);
    expect(insert).not.toHaveBeenCalled();
    expect(result.data.mocked).toBe(true);
  });

  it('rejects schema violations (end before start)', async () => {
    await expect(
      action.execute(
        makeInput({ ...baseParams, start: '2026-06-01T10:00:00Z', end: '2026-06-01T09:00:00Z' }),
        makeContext(),
      ),
    ).rejects.toThrow();
    expect(insert).not.toHaveBeenCalled();
  });
});
