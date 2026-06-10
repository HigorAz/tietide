import { airtableRecordCreatedConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'baseId',
    label: 'Base ID',
    required: true,
    placeholder: 'appXXXXXXXXXXXXXX',
  },
  { kind: 'pill', key: 'tableIdOrName', label: 'Table ID or name', required: true },
  { kind: 'number', key: 'intervalSeconds', label: 'Poll interval (seconds)' },
];

export function AirtableRecordCreatedForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="airtable-record-created-form"
      provider="airtable"
      providerLabel="Airtable"
      schema={airtableRecordCreatedConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
