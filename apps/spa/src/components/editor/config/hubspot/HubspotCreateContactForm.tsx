import { hubspotCreateContactConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'email', label: 'Email', placeholder: 'jane@example.com', required: true },
  { kind: 'pill', key: 'firstName', label: 'First name' },
  { kind: 'pill', key: 'lastName', label: 'Last name' },
];

export function HubspotCreateContactForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="hubspot-create-contact-form"
      provider="hubspot"
      providerLabel="HubSpot"
      schema={hubspotCreateContactConfigSchema}
      fields={FIELDS}
    />
  );
}
