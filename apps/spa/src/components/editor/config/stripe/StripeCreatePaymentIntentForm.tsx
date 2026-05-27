import { stripeCreatePaymentIntentConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'number', key: 'amount', label: 'Amount (smallest unit, e.g. cents)', required: true },
  { kind: 'pill', key: 'currency', label: 'Currency (ISO, e.g. usd)', required: true },
  { kind: 'pill', key: 'customerId', label: 'Customer ID', placeholder: 'cus_xxx' },
  { kind: 'text', key: 'description', label: 'Description' },
];

export function StripeCreatePaymentIntentForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="stripe-create-payment-intent-form"
      provider="stripe"
      providerLabel="Stripe"
      schema={stripeCreatePaymentIntentConfigSchema}
      fields={FIELDS}
    />
  );
}
