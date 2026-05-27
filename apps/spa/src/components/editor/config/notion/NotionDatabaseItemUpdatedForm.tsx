import { notionDatabaseItemUpdatedConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'databaseId',
    label: 'Database ID',
    required: true,
    placeholder: '0123456789abcdef0123456789abcdef',
  },
  { kind: 'number', key: 'intervalSeconds', label: 'Poll interval (seconds)' },
];

export function NotionDatabaseItemUpdatedForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="notion-database-item-updated-form"
      provider="notion"
      providerLabel="Notion"
      schema={notionDatabaseItemUpdatedConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
