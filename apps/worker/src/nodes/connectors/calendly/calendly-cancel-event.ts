import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { calendlyCancelEventConfigSchema, type CalendlyApiKeyConfig } from '@tietide/shared';
import { CalendlyClientFactory } from './calendly-client.factory';

export const CALENDLY_CANCEL_EVENT_TYPE = 'calendly-cancel-event';

interface CalendlyCancellationResponse {
  resource?: Record<string, unknown>;
}

@Injectable()
export class CalendlyCancelEventAction extends BaseConnectorAction<CalendlyApiKeyConfig> {
  readonly type = CALENDLY_CANCEL_EVENT_TYPE;
  readonly name = 'Calendly: Cancel Event';
  readonly description = 'Cancel a Calendly scheduled event by UUID';
  readonly requiredConnectionType = 'calendly';

  constructor(private readonly client: CalendlyClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<CalendlyApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = calendlyCancelEventConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, wouldHaveCancelled: { eventUuid: params.eventUuid } },
        metadata: { mocked: true },
      };
    }

    const body = JSON.stringify(params.reason ? { reason: params.reason } : {});
    const response = await this.client.call<CalendlyCancellationResponse>(
      connection,
      `/scheduled_events/${encodeURIComponent(params.eventUuid)}/cancellation`,
      { method: 'POST', body },
    );

    return {
      data: { cancelled: true, cancellation: response.data.resource ?? null },
      metadata: { statusCode: response.status },
    };
  }
}
