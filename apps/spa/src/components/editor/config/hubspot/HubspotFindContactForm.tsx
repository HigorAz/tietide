import { hubspotFindContactConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'email', label: 'Email', placeholder: 'jane@example.com', required: true },
];

export function HubspotFindContactForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="hubspot-find-contact-form"
      provider="hubspot"
      providerLabel="HubSpot"
      schema={hubspotFindContactConfigSchema}
      fields={FIELDS}
    />
  );
}
