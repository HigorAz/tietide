import { stripeFindCustomerConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'email', label: 'Email', placeholder: 'jane@example.com', required: true },
  { kind: 'number', key: 'limit', label: 'Max results (1–100)', placeholder: '1' },
];

export function StripeFindCustomerForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="stripe-find-customer-form"
      provider="stripe"
      providerLabel="Stripe"
      schema={stripeFindCustomerConfigSchema}
      fields={FIELDS}
    />
  );
}
