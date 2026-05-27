import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { stripeCreatePaymentIntentConfigSchema, type StripeApiKeyConfig } from '@tietide/shared';
import { StripeClientFactory, encodeStripeForm } from './stripe-client.factory';

export const STRIPE_CREATE_PAYMENT_INTENT_TYPE = 'stripe-create-payment-intent';

interface StripePaymentIntentResponse {
  id?: string;
  status?: string;
  client_secret?: string;
  amount?: number;
  currency?: string;
}

@Injectable()
export class StripeCreatePaymentIntentAction extends BaseConnectorAction<StripeApiKeyConfig> {
  readonly type = STRIPE_CREATE_PAYMENT_INTENT_TYPE;
  readonly name = 'Stripe: Create Payment Intent';
  readonly description = 'Create a Stripe PaymentIntent for a given amount and currency';
  readonly requiredConnectionType = 'stripe';

  constructor(private readonly client: StripeClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<StripeApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = stripeCreatePaymentIntentConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveCreated: { amount: params.amount, currency: params.currency },
        },
        metadata: { mocked: true },
      };
    }

    const form = encodeStripeForm({
      amount: params.amount,
      currency: params.currency.toLowerCase(),
      ...(params.customerId ? { customer: params.customerId } : {}),
      ...(params.description ? { description: params.description } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });

    const response = await this.client.call<StripePaymentIntentResponse>(
      connection,
      '/v1/payment_intents',
      { method: 'POST', form },
    );

    return {
      data: {
        id: response.data.id ?? null,
        status: response.data.status ?? null,
        clientSecret: response.data.client_secret ?? null,
        amount: response.data.amount ?? null,
        currency: response.data.currency ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
