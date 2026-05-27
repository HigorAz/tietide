import { ConnectionAuthError } from '@tietide/sdk';
import { CalendarEventUpdatedTrigger } from './calendar-event-updated';

describe('CalendarEventUpdatedTrigger', () => {
  let trigger: CalendarEventUpdatedTrigger;
  let authService: { buildClient: jest.Mock };
  let clients: { calendar: jest.Mock };
  let calendarClient: { events: { list: jest.Mock } };

  beforeEach(() => {
    calendarClient = { events: { list: jest.fn() } };
    clients = { calendar: jest.fn(() => calendarClient) };
    authService = { buildClient: jest.fn(() => ({ auth: 'fake-oauth-client' })) };
    trigger = new CalendarEventUpdatedTrigger(authService as never, clients as never);
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

  it('lists with updatedMin/showDeleted and emits one item per event updated after the cursor', async () => {
    calendarClient.events.list.mockResolvedValue({
      data: {
        items: [
          {
            id: 'evt-old',
            created: '2026-05-01T09:00:00.000Z',
            updated: '2026-05-08T12:05:00.000Z',
            status: 'confirmed',
            summary: 'Edited long-standing event',
          },
          {
            id: 'evt-new',
            created: '2026-05-08T12:10:00.000Z',
            updated: '2026-05-08T12:10:00.000Z',
            status: 'confirmed',
            summary: 'New event',
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
        showDeleted: true,
      }),
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ id: 'evt-old', summary: 'Edited long-standing event' });
    // Cursor advances to the latest `updated` watermark.
    expect(result.newCursor).toBe('2026-05-08T12:10:00.000Z');
  });

  it('surfaces a cancellation with cancelled=true', async () => {
    calendarClient.events.list.mockResolvedValue({
      data: {
        items: [
          {
            id: 'evt-cancelled',
            created: '2026-05-01T09:00:00.000Z',
            updated: '2026-05-08T12:03:00.000Z',
            status: 'cancelled',
            summary: 'Cancelled meeting',
          },
        ],
      },
    });

    const result = await trigger.poll(makeCtx('2026-05-08T12:00:00.000Z'));

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'evt-cancelled',
      status: 'cancelled',
      cancelled: true,
    });
  });

  it('rejects events whose updated is at or before the cursor (updatedMin is inclusive)', async () => {
    calendarClient.events.list.mockResolvedValue({
      data: {
        items: [
          {
            id: 'evt-boundary',
            created: '2026-05-01T09:00:00.000Z',
            updated: '2026-05-08T12:00:00.000Z',
            status: 'confirmed',
            summary: 'Exactly at cursor',
          },
          {
            id: 'evt-after',
            created: '2026-05-01T09:00:00.000Z',
            updated: '2026-05-08T12:02:00.000Z',
            status: 'confirmed',
            summary: 'After cursor',
          },
        ],
      },
    });

    const result = await trigger.poll(makeCtx('2026-05-08T12:00:00.000Z'));

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as { id: string }).id).toBe('evt-after');
  });

  it('keeps the cursor moving forward to "now" when no events match', async () => {
    calendarClient.events.list.mockResolvedValue({ data: { items: [] } });

    const result = await trigger.poll(makeCtx('2026-05-08T11:00:00.000Z'));

    expect(result.items).toEqual([]);
    expect(result.newCursor).toBe('2026-05-08T12:00:00.000Z');
  });

  it('throws ConnectionAuthError on 401 (picked up by PollProcessor)', async () => {
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
