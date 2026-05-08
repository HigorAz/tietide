import { Inject, Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { calendarCreateConfigSchema, type GoogleOAuth2Config } from '@tietide/shared';
import { GOOGLE_CLIENTS, GoogleAuthService, type GoogleClientFactories } from './google-auth';

export const CALENDAR_CREATE_TYPE = 'calendar-create';

@Injectable()
export class CalendarCreateAction extends BaseConnectorAction<GoogleOAuth2Config> {
  readonly type = CALENDAR_CREATE_TYPE;
  readonly name = 'Calendar: Create Event';
  readonly description = 'Create a Google Calendar event';
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
    const params = calendarCreateConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: {
            calendarId: params.calendarId,
            summary: params.summary,
            start: params.start,
            end: params.end,
            attendeeCount: params.attendees?.length ?? 0,
          },
        },
        metadata: { mocked: true },
      };
    }

    const calendar = this.clients.calendar({ auth: this.authService.buildClient(connection) });
    const response = await calendar.events.insert({
      calendarId: params.calendarId,
      requestBody: {
        summary: params.summary,
        description: params.description,
        start: { dateTime: params.start },
        end: { dateTime: params.end },
        attendees: params.attendees?.map((email) => ({ email })),
      },
    });

    return {
      data: {
        eventId: response.data.id ?? null,
        htmlLink: response.data.htmlLink ?? null,
        status: response.data.status ?? null,
      },
      metadata: { statusCode: response.status ?? 200 },
    };
  }
}
