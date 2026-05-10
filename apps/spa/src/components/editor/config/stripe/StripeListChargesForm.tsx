import { stripeListChargesConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'customerId', label: 'Customer ID', placeholder: 'cus_xxx' },
  { kind: 'number', key: 'limit', label: 'Limit (1–100)', placeholder: '10' },
];

export function StripeListChargesForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="stripe-list-charges-form"
      provider="stripe"
      providerLabel="Stripe"
      schema={stripeListChargesConfigSchema}
      fields={FIELDS}
    />
  );
}
