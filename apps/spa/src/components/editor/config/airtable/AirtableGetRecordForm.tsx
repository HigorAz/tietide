import { airtableGetRecordConfigSchema } from '@tietide/shared';
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
  { kind: 'text', key: 'tableIdOrName', label: 'Table ID or name', required: true },
  {
    kind: 'pill',
    key: 'recordId',
    label: 'Record ID',
    required: true,
    placeholder: 'recXXXXXXXXXXXXXX',
  },
];

export function AirtableGetRecordForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="airtable-get-record-form"
      provider="airtable"
      providerLabel="Airtable"
      schema={airtableGetRecordConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
