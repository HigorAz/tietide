import { stripeCreateCustomerConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'email', label: 'Email', placeholder: 'jane@example.com' },
  { kind: 'pill', key: 'name', label: 'Name' },
  { kind: 'text', key: 'description', label: 'Description' },
];

export function StripeCreateCustomerForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="stripe-create-customer-form"
      provider="stripe"
      providerLabel="Stripe"
      schema={stripeCreateCustomerConfigSchema}
      fields={FIELDS}
    />
  );
}
