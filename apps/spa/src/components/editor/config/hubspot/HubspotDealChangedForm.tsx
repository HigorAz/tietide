import { hubspotDealChangedConfigSchema, HUBSPOT_DEAL_EVENT_TYPES } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'text', key: 'propertyName', label: 'Property name (for propertyChange events)' },
];

export function HubspotDealChangedForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="hubspot-deal-changed-form"
      provider="hubspot"
      providerLabel="HubSpot"
      schema={hubspotDealChangedConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
      helpBanner={
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
          Configure the matching subscription rules in your HubSpot App's webhooks settings (e.g.{' '}
          {HUBSPOT_DEAL_EVENT_TYPES.slice(0, 3).join(', ')}).
        </p>
      }
    />
  );
}
