import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { stripeCreateSubscriptionConfigSchema, type StripeApiKeyConfig } from '@tietide/shared';
import { StripeClientFactory, encodeStripeForm } from './stripe-client.factory';

export const STRIPE_CREATE_SUBSCRIPTION_TYPE = 'stripe-create-subscription';

interface StripeSubscriptionResponse {
  id?: string;
  status?: string;
  customer?: string;
  current_period_end?: number;
}

@Injectable()
export class StripeCreateSubscriptionAction extends BaseConnectorAction<StripeApiKeyConfig> {
  readonly type = STRIPE_CREATE_SUBSCRIPTION_TYPE;
  readonly name = 'Stripe: Create Subscription';
  readonly description = 'Subscribe a customer to a recurring price';
  readonly requiredConnectionType = 'stripe';

  constructor(private readonly client: StripeClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<StripeApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = stripeCreateSubscriptionConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: { customer: params.customerId, price: params.priceId },
        },
        metadata: { mocked: true },
      };
    }

    // Stripe expects subscription items as items[0][price]=… / items[0][quantity]=…
    const form = encodeStripeForm({
      customer: params.customerId,
      items: [
        {
          price: params.priceId,
          ...(params.quantity !== undefined ? { quantity: params.quantity } : {}),
        },
      ],
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });

    const response = await this.client.call<StripeSubscriptionResponse>(
      connection,
      '/v1/subscriptions',
      { method: 'POST', form },
    );

    return {
      data: {
        id: response.data.id ?? null,
        status: response.data.status ?? null,
        customer: response.data.customer ?? null,
        currentPeriodEnd: response.data.current_period_end ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
