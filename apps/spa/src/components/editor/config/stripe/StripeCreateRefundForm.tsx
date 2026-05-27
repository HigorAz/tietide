import { stripeCreateRefundConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'paymentIntentId', label: 'Payment Intent ID', placeholder: 'pi_xxx' },
  { kind: 'pill', key: 'chargeId', label: 'Charge ID', placeholder: 'ch_xxx' },
  { kind: 'number', key: 'amount', label: 'Amount (partial refund)' },
  {
    kind: 'select',
    key: 'reason',
    label: 'Reason',
    options: [
      { value: 'duplicate', label: 'Duplicate' },
      { value: 'fraudulent', label: 'Fraudulent' },
      { value: 'requested_by_customer', label: 'Requested by customer' },
    ],
  },
];

export function StripeCreateRefundForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="stripe-create-refund-form"
      provider="stripe"
      providerLabel="Stripe"
      schema={stripeCreateRefundConfigSchema}
      fields={FIELDS}
    />
  );
}
