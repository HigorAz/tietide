import { ConnectionAuthError } from '@tietide/sdk';
import { CalendarEventCreatedTrigger } from './calendar-event-created';

describe('CalendarEventCreatedTrigger', () => {
  let trigger: CalendarEventCreatedTrigger;
  let authService: { buildClient: jest.Mock };
  let clients: { calendar: jest.Mock };
  let calendarClient: { events: { list: jest.Mock } };

  beforeEach(() => {
    calendarClient = { events: { list: jest.fn() } };
    clients = { calendar: jest.fn(() => calendarClient) };
    authService = { buildClient: jest.fn(() => ({ auth: 'fake-oauth-client' })) };
    trigger = new CalendarEventCreatedTrigger(authService as never, clients as never);
    jest.useFakeTimers().setSystemTime(new Date('2026-05-08T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const makeCtx = (cursor: string | null, config: Record<string, unknown> = {}) =>
    ({
      workflowId: 'wf-1',
      nodeId: 'trigger-1',
      cursor,
      config: { calendarId: 'primary', ...config },
      connection: {
        id: 'conn-1',
        type: 'OAUTH2',
        provider: 'google',
        config: {
          accessToken: 'tok',
          refreshToken: 'rtok',
          scope: 'https://www.googleapis.com/auth/calendar.readonly',
          tokenType: 'Bearer',
        },
        refreshToken: 'rtok',
      },
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }) as never;

  it('exposes a 5-minute default interval', () => {
    expect(trigger.defaultIntervalSeconds).toBe(300);
  });

  it('seeds the cursor on the first run to "now" without emitting any events', async () => {
    const result = await trigger.poll(makeCtx(null));
    expect(calendarClient.events.list).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('2026-05-08T12:00:00.000Z');
  });

  it('emits one item per new event whose created > cursor', async () => {
    calendarClient.events.list.mockResolvedValue({
      data: {
        items: [
          {
            id: 'evt-A',
            created: '2026-05-08T12:00:30.000Z',
            updated: '2026-05-08T12:00:30.000Z',
            summary: 'Daily standup',
          },
          {
            id: 'evt-B',
            created: '2026-05-08T12:01:00.000Z',
            updated: '2026-05-08T12:01:00.000Z',
            summary: 'Design review',
          },
        ],
      },
    });

    const result = await trigger.poll(makeCtx('2026-05-08T12:00:00.000Z'));

    expect(calendarClient.events.list).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        updatedMin: '2026-05-08T12:00:00.000Z',
        singleEvents: true,
        orderBy: 'updated',
      }),
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ id: 'evt-A', summary: 'Daily standup' });
    expect(result.newCursor).toBe('2026-05-08T12:01:00.000Z');
  });

  it('rejects updates to existing events whose created is older than cursor', async () => {
    calendarClient.events.list.mockResolvedValue({
      data: {
        items: [
          {
            id: 'evt-old',
            created: '2026-05-08T11:00:00.000Z',
            updated: '2026-05-08T12:30:00.000Z',
            summary: 'Old event, just edited',
          },
          {
            id: 'evt-new',
            created: '2026-05-08T12:15:00.000Z',
            updated: '2026-05-08T12:30:00.000Z',
            summary: 'Brand new',
          },
        ],
      },
    });

    const result = await trigger.poll(makeCtx('2026-05-08T12:00:00.000Z'));

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as { id: string }).id).toBe('evt-new');
  });

  it('keeps the cursor moving forward to updatedMin watermark when no items match', async () => {
    calendarClient.events.list.mockResolvedValue({
      data: {
        items: [
          {
            id: 'evt-old',
            created: '2026-05-08T11:00:00.000Z',
            updated: '2026-05-08T12:30:00.000Z',
            summary: 'Just edited, not new',
          },
        ],
      },
    });

    const result = await trigger.poll(makeCtx('2026-05-08T12:00:00.000Z'));

    expect(result.items).toEqual([]);
    // Cursor should advance to "now" so we don't refetch the same window forever
    expect(new Date(result.newCursor).getTime()).toBeGreaterThanOrEqual(
      new Date('2026-05-08T12:00:00.000Z').getTime(),
    );
  });

  it('throws ConnectionAuthError on 401 (will be picked up by PollProcessor)', async () => {
    const err = Object.assign(new Error('Token expired'), { response: { status: 401 } });
    calendarClient.events.list.mockRejectedValue(err);

    await expect(trigger.poll(makeCtx('2026-05-08T12:00:00.000Z'))).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
  });

  it('throws ConnectionAuthError on 403', async () => {
    const err = Object.assign(new Error('Insufficient scope'), { response: { status: 403 } });
    calendarClient.events.list.mockRejectedValue(err);

    await expect(trigger.poll(makeCtx('2026-05-08T12:00:00.000Z'))).rejects.toBeInstanceOf(
      ConnectionAuthError,
    );
  });

  it('rethrows non-auth errors as-is', async () => {
    const err = Object.assign(new Error('boom'), { response: { status: 500 } });
    calendarClient.events.list.mockRejectedValue(err);

    await expect(trigger.poll(makeCtx('2026-05-08T12:00:00.000Z'))).rejects.toThrow('boom');
  });

  it('throws when calendarId is missing', async () => {
    await expect(
      trigger.poll(makeCtx('2026-05-08T12:00:00.000Z', { calendarId: '' })),
    ).rejects.toThrow(/calendarId/);
  });
});
