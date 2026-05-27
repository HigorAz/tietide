import { hubspotCreateNoteConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'text', key: 'body', label: 'Note body', multiline: true, required: true },
  { kind: 'pill', key: 'contactId', label: 'Associate contact ID', placeholder: '501' },
  { kind: 'pill', key: 'dealId', label: 'Associate deal ID', placeholder: '900' },
];

export function HubspotCreateNoteForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="hubspot-create-note-form"
      provider="hubspot"
      providerLabel="HubSpot"
      schema={hubspotCreateNoteConfigSchema}
      fields={FIELDS}
    />
  );
}
