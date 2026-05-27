import { stripeGetCustomerConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'customerId', label: 'Customer ID', placeholder: 'cus_xxx', required: true },
];

export function StripeGetCustomerForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="stripe-get-customer-form"
      provider="stripe"
      providerLabel="Stripe"
      schema={stripeGetCustomerConfigSchema}
      fields={FIELDS}
    />
  );
}
