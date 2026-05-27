import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { stripeGetCustomerConfigSchema, type StripeApiKeyConfig } from '@tietide/shared';
import { StripeClientFactory } from './stripe-client.factory';

export const STRIPE_GET_CUSTOMER_TYPE = 'stripe-get-customer';

interface StripeCustomerResponse {
  id?: string;
  email?: string;
  name?: string;
  deleted?: boolean;
}

@Injectable()
export class StripeGetCustomerAction extends BaseConnectorAction<StripeApiKeyConfig> {
  readonly type = STRIPE_GET_CUSTOMER_TYPE;
  readonly name = 'Stripe: Get Customer';
  readonly description = 'Fetch a Stripe customer by ID';
  readonly requiredConnectionType = 'stripe';

  constructor(private readonly client: StripeClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<StripeApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = stripeGetCustomerConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, customer: null },
        metadata: { mocked: true },
      };
    }

    const response = await this.client.call<StripeCustomerResponse>(
      connection,
      `/v1/customers/${encodeURIComponent(params.customerId)}`,
      { method: 'GET' },
    );

    return {
      data: {
        id: response.data.id ?? null,
        customer: response.data,
        deleted: response.data.deleted ?? false,
      },
      metadata: { statusCode: response.status },
    };
  }
}
