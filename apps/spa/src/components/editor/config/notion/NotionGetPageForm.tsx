import { notionGetPageConfigSchema } from '@tietide/shared';
import type { NodeConfigFormProps } from '../formRegistry';
import { GenericConnectorForm, type FieldSpec } from '../GenericConnectorForm';

const FIELDS: ReadonlyArray<FieldSpec> = [
  {
    kind: 'pill',
    key: 'pageId',
    label: 'Page ID',
    required: true,
    placeholder: '32-char or UUID Notion page id',
  },
];

export function NotionGetPageForm(props: NodeConfigFormProps): JSX.Element {
  return (
    <GenericConnectorForm
      {...props}
      testId="notion-get-page-form"
      provider="notion"
      providerLabel="Notion"
      schema={notionGetPageConfigSchema}
      fields={FIELDS}
      showMockToggle={false}
    />
  );
}
