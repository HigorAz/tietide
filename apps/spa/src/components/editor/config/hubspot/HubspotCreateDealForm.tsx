import { hubspotCreateDealConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'name',
    label: 'Deal name',
    placeholder: 'Acme — Q3 renewal',
    required: true,
  },
  { kind: 'number', key: 'amount', label: 'Amount (USD)', placeholder: '5000' },
  { kind: 'text', key: 'pipelineId', label: 'Pipeline ID' },
  { kind: 'text', key: 'stageId', label: 'Stage ID' },
];

export function HubspotCreateDealForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="hubspot-create-deal-form"
      provider="hubspot"
      providerLabel="HubSpot"
      schema={hubspotCreateDealConfigSchema}
      fields={FIELDS}
    />
  );
}
