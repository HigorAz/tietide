import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { calendlyListInviteesConfigSchema, type CalendlyApiKeyConfig } from '@tietide/shared';
import { CalendlyClientFactory } from './calendly-client.factory';

export const CALENDLY_LIST_INVITEES_TYPE = 'calendly-list-invitees';

interface CalendlyInviteesResponse {
  collection?: Array<Record<string, unknown>>;
  pagination?: { next_page?: string | null };
}

@Injectable()
export class CalendlyListInviteesAction extends BaseConnectorAction<CalendlyApiKeyConfig> {
  readonly type = CALENDLY_LIST_INVITEES_TYPE;
  readonly name = 'Calendly: List Invitees';
  readonly description = 'List invitees for a Calendly scheduled event';
  readonly requiredConnectionType = 'calendly';

  constructor(private readonly client: CalendlyClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<CalendlyApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = calendlyListInviteesConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return { data: { mocked: true, invitees: [], count: 0 }, metadata: { mocked: true } };
    }

    const query: Record<string, string> = { count: String(params.count) };
    if (params.status) query.status = params.status;

    const response = await this.client.call<CalendlyInviteesResponse>(
      connection,
      `/scheduled_events/${encodeURIComponent(params.eventUuid)}/invitees`,
      { method: 'GET', query },
    );

    return {
      data: {
        invitees: response.data.collection ?? [],
        count: response.data.collection?.length ?? 0,
        nextPage: response.data.pagination?.next_page ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
