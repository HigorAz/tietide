import { hubspotGetContactConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'pill', key: 'contactId', label: 'Contact ID', placeholder: '501', required: true },
];

export function HubspotGetContactForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="hubspot-get-contact-form"
      provider="hubspot"
      providerLabel="HubSpot"
      schema={hubspotGetContactConfigSchema}
      fields={FIELDS}
    />
  );
}
