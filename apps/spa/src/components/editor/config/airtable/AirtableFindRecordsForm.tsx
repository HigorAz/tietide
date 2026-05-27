import { airtableFindRecordsConfigSchema } from '@tietide/shared';
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
    kind: 'text',
    key: 'filterByFormula',
    label: 'filterByFormula',
    required: true,
    multiline: true,
    placeholder: '{Email}="a@b.com"',
  },
  { kind: 'number', key: 'maxRecords', label: 'Max records (1–100)' },
];

export function AirtableFindRecordsForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="airtable-find-records-form"
      provider="airtable"
      providerLabel="Airtable"
      schema={airtableFindRecordsConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
