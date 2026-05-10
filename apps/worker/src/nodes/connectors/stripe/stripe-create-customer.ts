import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { stripeCreateCustomerConfigSchema, type StripeApiKeyConfig } from '@tietide/shared';
import { StripeClientFactory, encodeStripeForm } from './stripe-client.factory';

export const STRIPE_CREATE_CUSTOMER_TYPE = 'stripe-create-customer';

interface StripeCustomerResponse {
  id?: string;
  email?: string | null;
  name?: string | null;
  description?: string | null;
  metadata?: Record<string, string>;
  created?: number;
}

@Injectable()
export class StripeCreateCustomerAction extends BaseConnectorAction<StripeApiKeyConfig> {
  readonly type = STRIPE_CREATE_CUSTOMER_TYPE;
  readonly name = 'Stripe: Create Customer';
  readonly description = 'Create a Stripe customer with email, name, and metadata';
  readonly requiredConnectionType = 'stripe';

  constructor(private readonly client: StripeClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<StripeApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = stripeCreateCustomerConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: { email: params.email, name: params.name },
        },
        metadata: { mocked: true },
      };
    }

    const form = encodeStripeForm({
      ...(params.email ? { email: params.email } : {}),
      ...(params.name ? { name: params.name } : {}),
      ...(params.description ? { description: params.description } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });

    const response = await this.client.call<StripeCustomerResponse>(connection, '/v1/customers', {
      method: 'POST',
      form,
    });

    return {
      data: {
        id: response.data.id ?? null,
        email: response.data.email ?? null,
        name: response.data.name ?? null,
        description: response.data.description ?? null,
        metadata: response.data.metadata ?? {},
        created: response.data.created ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
