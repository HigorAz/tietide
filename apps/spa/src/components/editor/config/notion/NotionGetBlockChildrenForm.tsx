import { notionGetBlockChildrenConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'blockId',
    label: 'Page / block ID',
    required: true,
    placeholder: '32-char or UUID Notion id',
  },
  { kind: 'number', key: 'pageSize', label: 'Page size (1–100)' },
  { kind: 'pill', key: 'startCursor', label: 'Start cursor' },
];

export function NotionGetBlockChildrenForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="notion-get-block-children-form"
      provider="notion"
      providerLabel="Notion"
      schema={notionGetBlockChildrenConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
