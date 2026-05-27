import { stripeListInvoicesConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'customerId', label: 'Customer ID', placeholder: 'cus_xxx' },
  {
    kind: 'select',
    key: 'status',
    label: 'Status',
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'open', label: 'Open' },
      { value: 'paid', label: 'Paid' },
      { value: 'uncollectible', label: 'Uncollectible' },
      { value: 'void', label: 'Void' },
    ],
  },
  { kind: 'number', key: 'limit', label: 'Limit (1–100)', placeholder: '10' },
];

export function StripeListInvoicesForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="stripe-list-invoices-form"
      provider="stripe"
      providerLabel="Stripe"
      schema={stripeListInvoicesConfigSchema}
      fields={FIELDS}
    />
  );
}
