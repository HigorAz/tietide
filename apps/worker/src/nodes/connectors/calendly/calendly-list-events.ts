import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { calendlyListEventsConfigSchema, type CalendlyApiKeyConfig } from '@tietide/shared';
import { CalendlyClientFactory } from './calendly-client.factory';

export const CALENDLY_LIST_EVENTS_TYPE = 'calendly-list-events';

interface CalendlyEventsListResponse {
  collection?: Array<Record<string, unknown>>;
  pagination?: { next_page?: string | null; count?: number };
}

@Injectable()
export class CalendlyListEventsAction extends BaseConnectorAction<CalendlyApiKeyConfig> {
  readonly type = CALENDLY_LIST_EVENTS_TYPE;
  readonly name = 'Calendly: List Scheduled Events';
  readonly description = 'List Calendly events for a user, optionally within a time range';
  readonly requiredConnectionType = 'calendly';

  constructor(private readonly client: CalendlyClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<CalendlyApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = calendlyListEventsConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, events: [], count: 0 },
        metadata: { mocked: true },
      };
    }

    const query: Record<string, string> = {
      user: params.userUri,
      count: String(params.count),
    };
    if (params.minStartTime) query.min_start_time = params.minStartTime;
    if (params.maxStartTime) query.max_start_time = params.maxStartTime;
    if (params.status) query.status = params.status;

    const response = await this.client.call<CalendlyEventsListResponse>(
      connection,
      '/scheduled_events',
      { method: 'GET', query },
    );

    return {
      data: {
        events: response.data.collection ?? [],
        count: response.data.collection?.length ?? 0,
        nextPage: response.data.pagination?.next_page ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
