import { hubspotCreateCompanyConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'name', label: 'Company name', placeholder: 'Acme Inc', required: true },
  { kind: 'pill', key: 'domain', label: 'Domain', placeholder: 'acme.com' },
];

export function HubspotCreateCompanyForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="hubspot-create-company-form"
      provider="hubspot"
      providerLabel="HubSpot"
      schema={hubspotCreateCompanyConfigSchema}
      fields={FIELDS}
    />
  );
}
