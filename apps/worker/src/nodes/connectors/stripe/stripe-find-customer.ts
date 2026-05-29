import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { stripeFindCustomerConfigSchema, type StripeApiKeyConfig } from '@tietide/shared';
import { StripeClientFactory } from './stripe-client.factory';

export const STRIPE_FIND_CUSTOMER_TYPE = 'stripe-find-customer';

interface StripeCustomerSearchResponse {
  data?: Array<Record<string, unknown>>;
  has_more?: boolean;
}

@Injectable()
export class StripeFindCustomerAction extends BaseConnectorAction<StripeApiKeyConfig> {
  readonly type = STRIPE_FIND_CUSTOMER_TYPE;
  readonly name = 'Stripe: Find Customer';
  readonly description = 'Find a Stripe customer by email address (search API)';
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
    const params = stripeFindCustomerConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, found: false, customer: null, customers: [] },
        metadata: { mocked: true },
      };
    }

    // Stripe search query DSL: email:'jane@example.com'. The single-quotes are
    // required by Stripe; the email is schema-validated so it cannot inject.
    const response = await this.client.call<StripeCustomerSearchResponse>(
      connection,
      '/v1/customers/search',
      {
        method: 'GET',
        query: { query: `email:'${params.email}'`, limit: String(params.limit) },
      },
    );

    const customers = response.data.data ?? [];
    return {
      data: {
        found: customers.length > 0,
        customer: customers[0] ?? null,
        customers,
        count: customers.length,
      },
      metadata: { statusCode: response.status },
    };
  }
}
