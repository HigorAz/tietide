import { Inject, Injectable } from '@nestjs/common';
import { BasePollTrigger, type PollContext, type PollResult } from '@tietide/sdk';
import type { GoogleOAuth2Config } from '@tietide/shared';
import {
  GOOGLE_CLIENTS,
  GoogleAuthService,
  type GoogleClientFactories,
} from '../../connectors/google/google-auth';
import { isGoogleAuthError, wrapGoogleAuthError } from '../../connectors/google/google-error';

export const CALENDAR_EVENT_CREATED_TYPE = 'calendar-event-created';

// On an empty poll the cursor advances to a watermark captured BEFORE the request,
// minus this overlap, so an event created while the request is in flight (or not yet
// visible to Google's index) is re-covered by the next poll rather than skipped. The
// poll-processor's idempotencyKey dedups any event the overlapping window re-emits.
const WATERMARK_OVERLAP_MS = 30_000;

interface CalendarEventCreatedConfig {
  calendarId?: unknown;
}

interface CalendarEvent {
  id?: string | null;
  created?: string | null;
  updated?: string | null;
  summary?: string | null;
  description?: string | null;
  htmlLink?: string | null;
  start?: unknown;
  end?: unknown;
  attendees?: unknown;
}

@Injectable()
export class CalendarEventCreatedTrigger extends BasePollTrigger {
  readonly type = CALENDAR_EVENT_CREATED_TYPE;
  readonly name = 'Calendar: Event Created';
  readonly description =
    'Fires once per new event created in a Google Calendar (cursor = ISO timestamp via updatedMin)';
  readonly defaultIntervalSeconds = 300;

  constructor(
    private readonly authService: GoogleAuthService,
    @Inject(GOOGLE_CLIENTS) private readonly clients: GoogleClientFactories,
  ) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const cfg = ctx.config as unknown as CalendarEventCreatedConfig;
    const calendarId = cfg.calendarId;
    if (typeof calendarId !== 'string' || calendarId.length === 0) {
      throw new Error('calendar-event-created requires config.calendarId');
    }

    if (ctx.cursor === null) {
      return { items: [], newCursor: new Date().toISOString() };
    }

    const conn = ctx.connection as unknown as {
      id: string;
      type: string;
      provider: string;
      config: GoogleOAuth2Config;
      refreshToken?: string;
    };

    // Capture the empty-poll watermark BEFORE issuing the request (see W3.15): if
    // we instead used "now" after the response, an event created during the
    // in-flight window would be skipped forever.
    const watermarkMs = Date.now() - WATERMARK_OVERLAP_MS;

    const calendar = this.clients.calendar({
      auth: this.authService.buildClient(conn),
    });

    let response;
    try {
      response = await calendar.events.list({
        calendarId,
        updatedMin: ctx.cursor,
        singleEvents: true,
        orderBy: 'updated',
        showDeleted: false,
      });
    } catch (err) {
      if (isGoogleAuthError(err)) {
        throw wrapGoogleAuthError(err, { connectionId: conn.id, provider: conn.provider });
      }
      throw err;
    }

    const events = (response.data.items ?? []) as CalendarEvent[];
    const cursorMs = new Date(ctx.cursor).getTime();

    const items: Record<string, unknown>[] = [];
    let maxCreatedMs = cursorMs;
    for (const evt of events) {
      if (typeof evt.created !== 'string') continue;
      const createdMs = new Date(evt.created).getTime();
      if (!Number.isFinite(createdMs) || createdMs <= cursorMs) continue;
      items.push({
        id: evt.id,
        summary: evt.summary,
        description: evt.description,
        htmlLink: evt.htmlLink,
        start: evt.start,
        end: evt.end,
        attendees: evt.attendees,
        created: evt.created,
        updated: evt.updated,
        calendarId,
      });
      if (createdMs > maxCreatedMs) maxCreatedMs = createdMs;
    }

    // Advance the cursor to the latest emitted event's `created`. If nothing was
    // emitted, advance to the pre-request watermark (clamped so it never regresses
    // below the current cursor) instead of "now" — that closes the in-flight race
    // while still moving forward so we don't refetch the same window forever.
    const newCursor =
      items.length > 0
        ? new Date(maxCreatedMs).toISOString()
        : new Date(Math.max(cursorMs, watermarkMs)).toISOString();

    return { items, newCursor };
  }
}
