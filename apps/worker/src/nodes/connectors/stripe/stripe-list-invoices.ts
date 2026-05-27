import { Injectable } from '@nestjs/common';
import {
  BaseConnectorAction,
  type DecryptedConnection,
  type ExecutionContext,
  type NodeInput,
  type NodeOutput,
} from '@tietide/sdk';
import { stripeListInvoicesConfigSchema, type StripeApiKeyConfig } from '@tietide/shared';
import { StripeClientFactory } from './stripe-client.factory';

export const STRIPE_LIST_INVOICES_TYPE = 'stripe-list-invoices';

interface StripeInvoiceListResponse {
  data?: Array<Record<string, unknown>>;
  has_more?: boolean;
}

@Injectable()
export class StripeListInvoicesAction extends BaseConnectorAction<StripeApiKeyConfig> {
  readonly type = STRIPE_LIST_INVOICES_TYPE;
  readonly name = 'Stripe: List Invoices';
  readonly description = 'List Stripe invoices, optionally filtered by customer or status';
  readonly requiredConnectionType = 'stripe';

  constructor(private readonly client: StripeClientFactory) {
    super();
  }

  protected async run(
    input: NodeInput,
    connection: DecryptedConnection<StripeApiKeyConfig>,
    context: ExecutionContext,
  ): Promise<NodeOutput> {
    const params = stripeListInvoicesConfigSchema.parse(input.params);

    if (context.isDryRun && params.mockOnDryRun) {
      return {
        data: { mocked: true, invoices: [], hasMore: false },
        metadata: { mocked: true },
      };
    }

    const query: Record<string, string> = { limit: String(params.limit) };
    if (params.customerId) query.customer = params.customerId;
    if (params.status) query.status = params.status;
    if (params.startingAfter) query.starting_after = params.startingAfter;

    const response = await this.client.call<StripeInvoiceListResponse>(connection, '/v1/invoices', {
      method: 'GET',
      query,
    });

    return {
      data: {
        invoices: response.data.data ?? [],
        hasMore: response.data.has_more ?? false,
        count: response.data.data?.length ?? 0,
      },
      metadata: { statusCode: response.status },
    };
  }
}
