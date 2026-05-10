import { stripeEventReceivedConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'text', key: 'eventType', label: 'Event type filter (e.g. payment_intent.succeeded)' },
];

export function StripeEventReceivedForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="stripe-event-received-form"
      provider="stripe"
      providerLabel="Stripe"
      schema={stripeEventReceivedConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
