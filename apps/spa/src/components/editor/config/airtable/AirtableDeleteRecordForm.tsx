import { airtableDeleteRecordConfigSchema } from '@tietide/shared';
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
  {
    kind: 'pill',
    key: 'recordId',
    label: 'Record ID',
    required: true,
    placeholder: 'recXXXXXXXXXXXXXX',
  },
];

export function AirtableDeleteRecordForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="airtable-delete-record-form"
      provider="airtable"
      providerLabel="Airtable"
      schema={airtableDeleteRecordConfigSchema}
      fields={FIELDS}
    />
  );
}
