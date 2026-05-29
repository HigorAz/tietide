import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { calendarGetEventConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const CALENDAR_GET_EVENT_TYPE = 'calendar-get-event';

interface CalendarEvent {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  status?: string | null;
  start?: unknown;
  end?: unknown;
  attendees?: unknown;
  htmlLink?: string | null;
}

@Injectable()
export class CalendarGetEventAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = CALENDAR_GET_EVENT_TYPE;
  readonly name = 'Calendar: Get Event';
  readonly description = 'Fetch a single Google Calendar event by ID';
  readonly requiredConnectionType = 'google';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(
    private readonly authService: GoogleAuthService,
    @Inject(GOOGLE_CLIENTS) private readonly clients: GoogleClientFactories,
  ) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<GoogleOAuth2Config>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = calendarGetEventConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveFetched: { calendarId: params.calendarId, eventId: params.eventId },
        },
        metadata: { mocked: true },
      };
    }

    const calendar = this.clients.calendar({ auth: this.authService.buildClient(connection) });
    const response = await calendar.events.get({
      calendarId: params.calendarId,
      eventId: params.eventId,
    });

    const event = (response.data ?? {}) as CalendarEvent;

    return {
      data: {
        id: event.id ?? params.eventId,
        summary: event.summary ?? null,
        description: event.description ?? null,
        status: event.status ?? null,
        start: event.start ?? null,
        end: event.end ?? null,
        attendees: event.attendees ?? [],
        htmlLink: event.htmlLink ?? null,
        event,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
