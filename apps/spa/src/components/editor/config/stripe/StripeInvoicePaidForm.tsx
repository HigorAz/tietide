import { stripeInvoicePaidConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [];

export function StripeInvoicePaidForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="stripe-invoice-paid-form"
      provider="stripe"
      providerLabel="Stripe"
      schema={stripeInvoicePaidConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
      helpBanner={
        <p className="rounded-md border border-white/10 bg-elevated p-2 text-xs text-text-secondary">
          Activating a workflow with this trigger registers a Stripe webhook pinned to the{' '}
          <code>invoice.paid</code> event.
        </p>
      }
    />
  );
}
