import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { stripeListChargesConfigSchema, type StripeApiKeyConfig } from '@tietide/shared';
import { StripeClientFactory } from './stripe-client.factory';

export const STRIPE_LIST_CHARGES_TYPE = 'stripe-list-charges';

interface StripeChargeListResponse {
  data?: Array<Record<string, unknown>>;
  has_more?: boolean;
  url?: string;
}

@Injectable()
export class StripeListChargesAction extends BaseConnectorAction<StripeApiKeyConfig> {
  readonly type = STRIPE_LIST_CHARGES_TYPE;
  readonly name = 'Stripe: List Charges';
  readonly description = 'List recent Stripe charges, optionally filtered by customer';
  readonly requiredConnectionType = 'stripe';
  // Read-only: still executes during a dry-run (no external mutation).
  protected readonly sideEffect = false;

  constructor(private readonly client: StripeClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<StripeApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = stripeListChargesConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, charges: [], hasMore: false },
        metadata: { mocked: true },
      };
    }

    const query: Record<string, string> = { limit: String(params.limit) };
    if (params.customerId) query.customer = params.customerId;
    if (params.startingAfter) query.starting_after = params.startingAfter;

    const response = await this.client.call<StripeChargeListResponse>(connection, '/v1/charges', {
      method: 'GET',
      query,
    });

    return {
      data: {
        charges: response.data.data ?? [],
        hasMore: response.data.has_more ?? false,
        count: response.data.data?.length ?? 0,
      },
      metadata: { statusCode: response.status },
    };
  }
}
