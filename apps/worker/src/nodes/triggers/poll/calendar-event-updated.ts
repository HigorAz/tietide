import { Inject, Injectable } from '@nestjs/common';
import { BasePollTrigger, type PollContext, type PollResult } from '@tietide/sdk';
import type { GoogleOAuth2Config } from '@tietide/shared';
import {
  GOOGLE_CLIENTS,
  GoogleAuthService,
  type GoogleClientFactories,
} from '../../connectors/google/google-auth';
import { isGoogleAuthError, wrapGoogleAuthError } from '../../connectors/google/google-error';

export const CALENDAR_EVENT_UPDATED_TYPE = 'calendar-event-updated';

interface CalendarEventUpdatedConfig {
  calendarId?: unknown;
}

interface CalendarEvent {
  id?: string | null;
  status?: string | null;
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
export class CalendarEventUpdatedTrigger extends BasePollTrigger {
  readonly type = CALENDAR_EVENT_UPDATED_TYPE;
  readonly name = 'Calendar: Event Updated';
  readonly description =
    'Fires once per Google Calendar event changed or cancelled since the last poll (cursor = ISO updated watermark)';
  readonly defaultIntervalSeconds = 300;

  constructor(
    private readonly authService: GoogleAuthService,
    @Inject(GOOGLE_CLIENTS) private readonly clients: GoogleClientFactories,
  ) {
    super();
  }

  async poll(ctx: PollContext): Promise<PollResult> {
    const cfg = ctx.config as unknown as CalendarEventUpdatedConfig;
    const calendarId = cfg.calendarId;
    if (typeof calendarId !== 'string' || calendarId.length === 0) {
      throw new Error('calendar-event-updated requires config.calendarId');
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
        showDeleted: true,
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
    let maxUpdatedMs = cursorMs;
    for (const evt of events) {
      if (typeof evt.updated !== 'string') continue;
      const updatedMs = new Date(evt.updated).getTime();
      // updatedMin is inclusive, so drop the event sitting exactly on the
      // cursor — it was already emitted on the previous tick.
      if (!Number.isFinite(updatedMs) || updatedMs <= cursorMs) continue;
      items.push({
        id: evt.id,
        status: evt.status,
        cancelled: evt.status === 'cancelled',
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
      if (updatedMs > maxUpdatedMs) maxUpdatedMs = updatedMs;
    }

    // Advance the cursor to the latest emitted event's `updated`. If nothing
    // was emitted, advance to "now" so we don't refetch the same updatedMin
    // window forever.
    const newCursor =
      items.length > 0 ? new Date(maxUpdatedMs).toISOString() : new Date().toISOString();

    return { items, newCursor };
  }
}
