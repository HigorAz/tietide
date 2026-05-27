import { stripeCreateSubscriptionConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'customerId', label: 'Customer ID', placeholder: 'cus_xxx', required: true },
  { kind: 'pill', key: 'priceId', label: 'Price ID', placeholder: 'price_xxx', required: true },
  { kind: 'number', key: 'quantity', label: 'Quantity' },
];

export function StripeCreateSubscriptionForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="stripe-create-subscription-form"
      provider="stripe"
      providerLabel="Stripe"
      schema={stripeCreateSubscriptionConfigSchema}
      fields={FIELDS}
    />
  );
}
