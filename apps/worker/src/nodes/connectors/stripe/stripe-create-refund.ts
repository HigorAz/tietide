import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { stripeCreateRefundConfigSchema, type StripeApiKeyConfig } from '@tietide/shared';
import { StripeClientFactory, encodeStripeForm } from './stripe-client.factory';

export const STRIPE_CREATE_REFUND_TYPE = 'stripe-create-refund';

interface StripeRefundResponse {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
}

@Injectable()
export class StripeCreateRefundAction extends BaseConnectorAction<StripeApiKeyConfig> {
  readonly type = STRIPE_CREATE_REFUND_TYPE;
  readonly name = 'Stripe: Create Refund';
  readonly description = 'Refund a Stripe payment intent or charge (full or partial)';
  readonly requiredConnectionType = 'stripe';

  constructor(private readonly client: StripeClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<StripeApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = stripeCreateRefundConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: {
          mocked: true,
          wouldHaveRefunded: {
            paymentIntent: params.paymentIntentId ?? null,
            charge: params.chargeId ?? null,
          },
        },
        metadata: { mocked: true },
      };
    }

    const form = encodeStripeForm({
      ...(params.paymentIntentId ? { payment_intent: params.paymentIntentId } : {}),
      ...(params.chargeId ? { charge: params.chargeId } : {}),
      ...(params.amount !== undefined ? { amount: params.amount } : {}),
      ...(params.reason ? { reason: params.reason } : {}),
    });

    const response = await this.client.call<StripeRefundResponse>(connection, '/v1/refunds', {
      method: 'POST',
      form,
    });

    return {
      data: {
        id: response.data.id ?? null,
        status: response.data.status ?? null,
        amount: response.data.amount ?? null,
        currency: response.data.currency ?? null,
      },
      metadata: { statusCode: response.status },
    };
  }
}
