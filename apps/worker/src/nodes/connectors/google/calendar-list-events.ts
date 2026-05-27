import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { calendarListEventsConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const CALENDAR_LIST_EVENTS_TYPE = 'calendar-list-events';

@Injectable()
export class CalendarListEventsAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = CALENDAR_LIST_EVENTS_TYPE;
  readonly name = 'Calendar: List Events';
  readonly description = 'List Google Calendar events in a time window';
  readonly requiredConnectionType = 'google';

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
    const params = calendarListEventsConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveListed: { calendarId: params.calendarId },
          events: [],
        },
        metadata: { mocked: true },
      };
    }

    const calendar = this.clients.calendar({ auth: this.authService.buildClient(connection) });
    const response = await calendar.events.list({
      calendarId: params.calendarId,
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      maxResults: params.maxResults,
      q: params.query,
      // Expand recurring events and order by start so the window is meaningful.
      singleEvents: true,
      orderBy: 'startTime',
    });

    return {
      data: {
        events: response.data.items ?? [],
        nextPageToken: response.data.nextPageToken ?? null,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
