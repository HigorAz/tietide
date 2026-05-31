import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { calendlyGetEventConfigSchema, type CalendlyApiKeyConfig } from '@tietide/shared';
import { CalendlyClientFactory } from './calendly-client.factory';

export const CALENDLY_GET_EVENT_TYPE = 'calendly-get-event';

interface CalendlyEventResponse {
  resource?: Record<string, unknown>;
}

@Injectable()
export class CalendlyGetEventAction extends BaseConnectorAction<CalendlyApiKeyConfig> {
  readonly type = CALENDLY_GET_EVENT_TYPE;
  readonly name = 'Calendly: Get Event';
  readonly description = 'Fetch a Calendly scheduled event by UUID';
  readonly requiredConnectionType = 'calendly';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly client: CalendlyClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<CalendlyApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = calendlyGetEventConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return { data: { mocked: true, event: null }, metadata: { mocked: true } };
    }

    const response = await this.client.call<CalendlyEventResponse>(
      connection,
      `/scheduled_events/${encodeURIComponent(params.eventUuid)}`,
      { method: 'GET' },
    );

    return {
      data: { event: response.data.resource ?? null },
      metadata: { statusCode: response.status },
    };
  }
}
